import { readFileSync } from 'node:fs';

// Named import, not default: ajv ships CJS, and under NodeNext the default
// import resolves to the module namespace rather than the class. `Ajv` is a
// real named export (`export declare class Ajv`) and works in both type and
// runtime positions.
import { Ajv, type ErrorObject, type ValidateFunction } from 'ajv';
import addFormatsModule from 'ajv-formats';

import type { DocPath } from './parse/index.js';

/**
 * Validates a Tauri config against the official JSON Schema.
 *
 * The schemas are vendored under `schemas/` rather than fetched: every
 * version-addressed URL on schema.tauri.app aliases the current latest document,
 * so a pinned URL cannot give reproducible results. See `schemas/PROVENANCE.md`.
 *
 * Schema deviations are reported at `info` severity and never gate CI. The
 * vendored v2 schema tracks one Tauri release, but the projects we analyze track
 * many, so a config written against an older or newer release can disagree with
 * our copy without being wrong. That is a documentation-quality signal, not a
 * security finding.
 */

export interface SchemaIssue {
  /** JSON pointer from ajv, e.g. `/app/security/csp`. */
  instancePath: string;
  /** Parsed form of `instancePath`, for resolving a line number. */
  path: DocPath;
  message: string;
}

/** ajv is draft-07 by default, which is what both Tauri schemas declare. */
const ajv = new Ajv({
  allErrors: true,
  // Tauri's generated schema uses constructs ajv's strict mode objects to
  // (unknown keywords, unions). Being strict here would reject the official
  // schema itself rather than find anything about the user's config.
  strict: false,
  // The schema contains `^[^/\:*?"<>|]+$` (a Windows filename pattern). `\:` is
  // a valid identity escape in an ordinary regex but an error under the `u`
  // flag, which ajv applies by default — compiling the official schema fails
  // outright without this. Patterns are matched without `u` instead.
  unicodeRegExp: false,
  // Needed for `error.data`, which the template-placeholder filter below reads.
  verbose: true,
  // ajv narrates unknown formats to the console while compiling. That is our
  // problem to solve, not the user's, and it would pollute every CLI run's
  // stderr. `unsupportedSchemaFormats()` plus its test is how we stay informed
  // instead.
  logger: false,
});

// ajv-formats is CJS exposing only a default export, so under NodeNext the
// default import lands on the module namespace and `.default` is the actual
// plugin. At runtime the two are the same object, so this spelling is correct in
// both positions. If formats ever fail to register, the "still flags a
// genuinely malformed endpoint" test fails — that assertion guards this line.
addFormatsModule.default(ajv);

/**
 * Unsigned integer formats emitted by schemars, the Rust crate that generates
 * Tauri's schema from its config structs.
 *
 * ajv-formats covers the JSON Schema standard set (`uri`, `uuid`, `int32`,
 * `int64`, `double`), but not these — they are Rust type names. Registering them
 * both silences ajv's unknown-format warnings and makes validation genuinely
 * stricter: a `uint8` of 300 is now caught rather than ignored.
 *
 * `uint` and `uint64` get no upper bound: they map to `usize`/`u64`, whose maxima
 * exceed `Number.MAX_SAFE_INTEGER`, so asserting one would be theatre.
 */
const RUST_UINT_MAXIMA: Readonly<Record<string, number | undefined>> = {
  uint: undefined,
  uint8: 255,
  uint16: 65535,
  uint32: 4294967295,
  uint64: undefined,
};

for (const [name, max] of Object.entries(RUST_UINT_MAXIMA)) {
  ajv.addFormat(name, {
    type: 'number',
    validate: (value: number) =>
      Number.isInteger(value) && value >= 0 && (max === undefined || value <= max),
  });
}

/** Every `format` value appearing anywhere in a schema document. */
function collectFormats(node: unknown, into: Set<string>): void {
  if (Array.isArray(node)) {
    for (const item of node) collectFormats(item, into);
    return;
  }
  if (typeof node !== 'object' || node === null) return;

  const record = node as Record<string, unknown>;
  if (typeof record['format'] === 'string') into.add(record['format']);
  for (const value of Object.values(record)) collectFormats(value, into);
}

/**
 * Formats used by the vendored schemas that this ajv instance does not know.
 *
 * Should always be empty. It is not empty automatically: refreshing the vendored
 * schemas can introduce a format Tauri started using, and an unknown format is
 * silently ignored by ajv — validation quietly gets weaker with no visible
 * failure. `schemaValidate.test.ts` asserts this is empty so a schema bump
 * surfaces the gap instead of eroding coverage.
 */
export function unsupportedSchemaFormats(): string[] {
  const used = new Set<string>();
  for (const version of Object.keys(SCHEMA_FILES) as SchemaVersion[]) {
    try {
      collectFormats(loadSchema(version), used);
    } catch {
      continue;
    }
  }

  const known = new Set(Object.keys(ajv.formats));
  return [...used].filter((format) => !known.has(format)).sort();
}

/** Tauri's config template placeholders, e.g. `{{target}}`, `{{current_version}}`. */
const TEMPLATE_PLACEHOLDER = /\{\{[^}]+\}\}/;

/**
 * The only fields whose own schema description documents template placeholders.
 *
 * Derived by searching both vendored schemas for descriptions containing `{{`:
 * there is exactly one hit, `UpdaterConfig.endpoints` in the v1 schema. The v2
 * schema has none — v2 moved the updater into a plugin, and `plugins` is a
 * free-form object, so no format assertion runs against it in the first place.
 *
 * Kept as an explicit path list rather than "any templated value", so the
 * exemption cannot quietly widen into a blanket `format` bypass. Re-derive this
 * when refreshing the vendored schemas.
 */
const TEMPLATED_FIELD_PATHS: readonly RegExp[] = [/^\/tauri\/updater\/endpoints\/\d+$/];

/**
 * Should this schema error be suppressed?
 *
 * The v1 schema marks updater endpoints as `format: "uri"` while its own
 * description for that field instructs you to write
 * `https://host/{{target}}/{{current_version}}`. A templated URL is not a valid
 * URI, so the schema contradicts itself and every correctly configured updater
 * trips it — Tauri's own `examples/api` config does.
 *
 * Suppressing this fixes a defect in the schema, not in the user's config. All
 * three conditions are required: the right field, the `format` keyword, and a
 * placeholder actually present in the value. A malformed URL in the same field
 * is still reported.
 */
function isSchemaSelfContradiction(error: ErrorObject): boolean {
  if (error.keyword !== 'format') return false;
  if (typeof error.data !== 'string') return false;
  if (!TEMPLATE_PLACEHOLDER.test(error.data)) return false;
  return TEMPLATED_FIELD_PATHS.some((pattern) => pattern.test(error.instancePath));
}

const SCHEMA_FILES = {
  v1: 'tauri-config-v1.json',
  v2: 'tauri-config-v2.json',
} as const;

export type SchemaVersion = keyof typeof SCHEMA_FILES;

const compiled = new Map<SchemaVersion, ValidateFunction | undefined>();
const compileErrors = new Map<SchemaVersion, string>();

/**
 * Why schema validation is unavailable for `version`, or `undefined` if it works.
 *
 * This exists because a swallowed compile error is indistinguishable from a
 * clean config: validation silently returns no issues and everything looks fine.
 * It cost a real debugging session during development, so the failure is now
 * observable — `schemas.test.ts` asserts both vendored schemas compile, and the
 * CLI reports it rather than pretending the config validated.
 */
export function schemaUnavailableReason(version: SchemaVersion): string | undefined {
  getValidator(version);
  return compileErrors.get(version);
}

/**
 * Resolves a vendored schema.
 *
 * `../../schemas/` from `dist/core/` reaches the package root both in this
 * repository and inside `node_modules/tauri-audit/`, and `schemas` is listed in
 * package.json `files`.
 */
function loadSchema(version: SchemaVersion): unknown {
  const url = new URL(`../../schemas/${SCHEMA_FILES[version]}`, import.meta.url);
  return JSON.parse(readFileSync(url, 'utf8')) as unknown;
}

function getValidator(version: SchemaVersion): ValidateFunction | undefined {
  if (compiled.has(version)) return compiled.get(version);

  let validator: ValidateFunction | undefined;
  try {
    const schema = loadSchema(version);
    validator = ajv.compile(schema as object);
  } catch (error) {
    // A missing or uncompilable schema disables schema checks rather than failing
    // the run: schema validation is the least important signal we produce, and
    // losing it must not cost the user their security findings. But the reason is
    // recorded — see `schemaUnavailableReason`.
    compileErrors.set(version, error instanceof Error ? error.message : String(error));
    validator = undefined;
  }

  compiled.set(version, validator);
  return validator;
}

/** Converts an ajv JSON pointer into a path usable with `ParsedDocument.lineOf`. */
export function pointerToPath(pointer: string): DocPath {
  if (pointer === '') return [];
  return pointer
    .split('/')
    .slice(1)
    .map((segment) => {
      const unescaped = segment.replace(/~1/g, '/').replace(/~0/g, '~');
      return /^\d+$/.test(unescaped) ? Number(unescaped) : unescaped;
    });
}

function describe(error: ErrorObject): string {
  const base = error.message ?? 'schema violation';
  if (error.keyword === 'additionalProperties') {
    const extra = (error.params as { additionalProperty?: string }).additionalProperty;
    return extra === undefined ? base : `unknown property \`${extra}\``;
  }
  return base;
}

export function validateTauriConfig(value: unknown, version: SchemaVersion): SchemaIssue[] {
  const validator = getValidator(version);
  if (validator === undefined) return [];

  let valid: boolean;
  try {
    valid = validator(value);
  } catch {
    return [];
  }
  if (valid) return [];

  return (validator.errors ?? [])
    .filter((error) => !isSchemaSelfContradiction(error))
    .map((error) => ({
      instancePath: error.instancePath,
      path: pointerToPath(error.instancePath),
      message: describe(error),
    }));
}
