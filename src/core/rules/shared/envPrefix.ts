/**
 * Reading `envPrefix` out of a Vite config, and deciding whether it exposes a
 * Tauri signing secret.
 *
 * Vite inlines every environment variable whose name starts with a configured
 * prefix into the frontend bundle. Widening that prefix to cover Tauri's own
 * variables can therefore embed a signing key in shipped JavaScript
 * (CVE-2023-46115).
 *
 * The check is prefix semantics, not substring matching. `TAURI_ENV_` is a
 * legitimate and common prefix — Tauri sets `TAURI_ENV_PLATFORM`,
 * `TAURI_ENV_ARCH` and friends during a build, and exposing those is normal.
 * Asking whether a config "mentions TAURI_" would flag that correct setup. The
 * question is whether a real secret's name starts with a configured prefix, so
 * `TAURI_` matches `TAURI_PRIVATE_KEY` and `TAURI_ENV_` matches none of them.
 *
 * There is no JavaScript parser in this package (that arrives with the AST rules
 * in a later phase), so `envPrefix` is read by scanning text. That is why the
 * rule is heuristic and why anything it cannot read confidently yields no
 * finding: a config that computes its prefixes at runtime is simply not
 * analyzed, rather than guessed at.
 */

/**
 * Environment variables that carry signing material.
 *
 * Measured from the Tauri CLI's own documentation rather than assumed. v1 uses
 * `TAURI_PRIVATE_KEY`; v2 renamed the family to `TAURI_SIGNING_*` but its CLI
 * still reads the old names first as a fallback
 * (`get_env("TAURI_PRIVATE_KEY", "TAURI_SIGNING_PRIVATE_KEY")`), so both
 * generations of name are live and both are checked.
 */
export const SIGNING_ENV_VARS: readonly string[] = [
  // v1 (tooling/cli/ENVIRONMENT_VARIABLES.md @ tauri-v1.8.3)
  'TAURI_PRIVATE_KEY',
  'TAURI_KEY_PASSWORD',
  // v2 (crates/tauri-cli/ENVIRONMENT_VARIABLES.md)
  'TAURI_SIGNING_PRIVATE_KEY',
  'TAURI_SIGNING_PRIVATE_KEY_PATH',
  'TAURI_SIGNING_PRIVATE_KEY_PASSWORD',
  'TAURI_SIGNING_RPM_KEY',
  'TAURI_SIGNING_RPM_KEY_PASSPHRASE',
  // v2 legacy fallbacks, still read by the v2 CLI
  'TAURI_PRIVATE_KEY_PATH',
  'TAURI_PRIVATE_KEY_PASSWORD',
];

/** Signing variables a build using this prefix would inline into the bundle. */
export function secretsExposedBy(prefix: string): string[] {
  // An empty prefix would match everything; Vite treats it as no filter at all,
  // and reporting every variable in that case says nothing useful.
  if (prefix === '') return [];
  return SIGNING_ENV_VARS.filter((name) => name.startsWith(prefix));
}

export interface EnvPrefixDeclaration {
  /** Prefixes as written in the config. */
  prefixes: string[];
  /** 1-based line of the `envPrefix` key. */
  line: number;
}

/**
 * Blanks out comments and the *contents* of string literals, preserving length,
 * positions and newlines.
 *
 * Structure is searched in the mask while values are read from the original at
 * the same offsets. Searching the raw source instead would match an `envPrefix:`
 * written inside an ordinary string — a comment about the setting, a message, a
 * documentation snippet — and report a config that never sets it. Quote
 * delimiters survive so the mask still shows where literals begin and end.
 */
function maskCode(source: string): string {
  const out: string[] = [];
  let index = 0;
  let state: 'code' | 'line' | 'block' | 'single' | 'double' | 'template' = 'code';

  const blank = (char: string): string => (char === '\n' ? '\n' : ' ');

  while (index < source.length) {
    const char = source[index] ?? '';
    const next = source[index + 1] ?? '';

    if (state === 'code') {
      if (char === '/' && next === '/') {
        state = 'line';
        out.push('  ');
        index += 2;
        continue;
      }
      if (char === '/' && next === '*') {
        state = 'block';
        out.push('  ');
        index += 2;
        continue;
      }
      if (char === "'") state = 'single';
      else if (char === '"') state = 'double';
      else if (char === '`') state = 'template';
      // The opening quote itself is kept.
      out.push(char);
      index += 1;
      continue;
    }

    if (state === 'line') {
      if (char === '\n') state = 'code';
      out.push(blank(char));
      index += 1;
      continue;
    }

    if (state === 'block') {
      if (char === '*' && next === '/') {
        state = 'code';
        out.push('  ');
        index += 2;
        continue;
      }
      out.push(blank(char));
      index += 1;
      continue;
    }

    // Inside a string literal.
    if (char === '\\') {
      out.push('  ');
      index += 2;
      continue;
    }
    if (
      (state === 'single' && char === "'") ||
      (state === 'double' && char === '"') ||
      (state === 'template' && char === '`')
    ) {
      state = 'code';
      out.push(char);
      index += 1;
      continue;
    }
    out.push(blank(char));
    index += 1;
  }

  return out.join('');
}

const ENV_PREFIX_KEY = /(^|[{,\s])envPrefix\s*:/;

/** A masked literal is a quote, blanks, and the matching quote. */
const MASKED_LITERAL = /(['"]) *\1/g;

/**
 * Extracts `envPrefix` from Vite config source.
 *
 * Handles the two forms the option accepts — a single string and an array of
 * strings — and returns `undefined` for anything else, including a value built
 * from variables, spread from another object, or written as a template literal.
 * Returning `undefined` means "not analyzed", and the rule emits nothing in that
 * case rather than guessing.
 */
export function extractEnvPrefix(source: string): EnvPrefixDeclaration | undefined {
  const masked = maskCode(source);
  const match = ENV_PREFIX_KEY.exec(masked);
  if (match === null) return undefined;

  const keyEnd = match.index + match[0].length;
  const line = source.slice(0, keyEnd).split('\n').length;

  const maskedRest = masked.slice(keyEnd);
  const firstMeaningful = /\S/.exec(maskedRest);
  if (firstMeaningful === null) return undefined;

  const valueStart = firstMeaningful.index;
  const readLiteral = (start: number, end: number): string =>
    source.slice(keyEnd + start + 1, keyEnd + end - 1);

  if (maskedRest[valueStart] === '[') {
    const close = maskedRest.indexOf(']', valueStart);
    if (close === -1) return undefined;
    const innerMasked = maskedRest.slice(valueStart + 1, close);

    // Anything left after removing literals, whitespace and commas is a
    // variable, a spread or a call — the list cannot be seen in full.
    if (innerMasked.replace(MASKED_LITERAL, '').replace(/[\s,]/g, '') !== '') return undefined;

    const prefixes: string[] = [];
    for (const literal of innerMasked.matchAll(MASKED_LITERAL)) {
      const start = valueStart + 1 + literal.index;
      prefixes.push(readLiteral(start, start + literal[0].length));
    }
    return { prefixes, line };
  }

  if (maskedRest[valueStart] === "'" || maskedRest[valueStart] === '"') {
    MASKED_LITERAL.lastIndex = valueStart;
    const literal = MASKED_LITERAL.exec(maskedRest);
    MASKED_LITERAL.lastIndex = 0;
    if (literal === null || literal.index !== valueStart) return undefined;
    return {
      prefixes: [readLiteral(valueStart, valueStart + literal[0].length)],
      line,
    };
  }

  // A template literal, an identifier, a spread — not statically readable.
  return undefined;
}
