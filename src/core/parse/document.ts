/**
 * The shape every config parser produces.
 *
 * A finding needs two things from a config file: the parsed value (to decide
 * whether it is dangerous) and a line number (to point the user at it). Neither
 * `JSON.parse` nor `JSON5.parse` preserves position, so each parser pairs the
 * value with its own way of resolving a JSON path back to a line.
 */

/** A path into a parsed document, e.g. `['app', 'security', 'csp']`. */
export type DocPath = readonly (string | number)[];

/**
 * How trustworthy `lineOf` is.
 *
 * - `exact` — resolved from the parser's own offsets (JSON).
 * - `approximate` — resolved by scanning the raw text for the key (JSON5, TOML).
 *   May point at an enclosing region rather than the precise key. This is
 *   documented in the README's Honest limitations.
 */
export type LocationPrecision = 'exact' | 'approximate';

export interface ParsedDocument {
  value: unknown;
  locationPrecision: LocationPrecision;
  /** 1-based line for `path`, or 1 when it cannot be located. Never throws. */
  lineOf(path: DocPath): number;
  /**
   * Non-fatal syntax complaints (e.g. trailing commas in strict JSON). A document
   * can be usable and still have these; they are surfaced at `info` level.
   */
  syntaxWarnings: string[];
}

/** Maps byte offsets to 1-based line numbers. Built once per document. */
export class LineIndex {
  private readonly lineStarts: number[];

  constructor(text: string) {
    const starts = [0];
    for (let i = 0; i < text.length; i += 1) {
      if (text[i] === '\n') starts.push(i + 1);
    }
    this.lineStarts = starts;
  }

  /** 1-based line containing `offset`. Binary search. */
  lineAt(offset: number): number {
    let low = 0;
    let high = this.lineStarts.length - 1;
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      const start = this.lineStarts[mid];
      if (start !== undefined && start <= offset) low = mid;
      else high = mid - 1;
    }
    return low + 1;
  }
}

function escapeRegExp(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** TOML table header: `[a.b.c]` or `[[a.b.c]]`. */
const TOML_TABLE_HEADER = /^\s*\[\[?([^\]]*)\]\]?/;

/**
 * Does this line introduce `key`?
 *
 * Two forms count. An assignment (`"key":`, `key:`, `key =`) covers JSON5 and
 * plain TOML entries. A TOML table header (`[dependencies]`,
 * `[dependencies.tauri]`) covers keys that are never written with a separator at
 * all — without this, every `Cargo.toml` path resolved to line 1.
 *
 * Header segments are compared for exact equality rather than by substring, so
 * `tauri` does not match inside `[dependencies.tauri-plugin-shell]`.
 */
function lineIntroducesKey(line: string, key: string): boolean {
  const assignment = new RegExp(`(^|[{,[\\s])["']?${escapeRegExp(key)}["']?\\s*[:=]`);
  if (assignment.test(line)) return true;

  const header = TOML_TABLE_HEADER.exec(line);
  const inner = header?.[1];
  if (inner === undefined) return false;

  return inner
    .split('.')
    .map((segment) => segment.trim().replace(/^["']|["']$/g, ''))
    .includes(key);
}

/**
 * Best-effort line lookup for formats whose parsers discard position (JSON5,
 * TOML).
 *
 * Walks the path key by key, each time scanning forward from the line where the
 * parent key was found. That keeps `app.security.csp` from matching an unrelated
 * `csp` earlier in the file. Array indices are unlocatable and are skipped, so
 * the result lands on the enclosing key.
 *
 * Returns the deepest line it managed to reach, or 1. Never throws.
 */
export function approximateLineOf(text: string, path: DocPath): number {
  const lines = text.split('\n');
  let searchFrom = 0;
  let best = 1;

  for (const key of path) {
    if (typeof key === 'number') continue;
    let hit = -1;
    for (let i = searchFrom; i < lines.length; i += 1) {
      const line = lines[i];
      if (line !== undefined && lineIntroducesKey(line, key)) {
        hit = i;
        break;
      }
    }
    if (hit === -1) break;
    best = hit + 1;
    searchFrom = hit;
  }

  return best;
}
