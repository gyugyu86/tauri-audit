import type { AnalyzedConfig } from '../../projectContext.js';
import type { DocPath } from '../../parse/index.js';

/**
 * Reading config values without trusting their shape.
 *
 * A rule runs against whatever the user actually wrote, which may not match the
 * schema at all: a string where a boolean belongs, an array of nulls, a scalar
 * where an object belongs. None of that may throw — an exception in one rule
 * would abort a scan and turn a reportable project into no report at all.
 *
 * Type mismatches are also not a rule's business. They are reported separately as
 * `info` schema findings, so a rule that cannot recognize a value simply declines
 * to fire. Declining is the safe direction: a false negative costs a missed
 * finding, a false positive costs the user's trust in every finding.
 */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Walks `path` from the document root.
 *
 * Returns `undefined` if any step is missing or is not an object. Note that this
 * conflates "absent" with "explicitly null/undefined", which is fine for every
 * rule here: all of them act only on a specific present value, and every field
 * they read defaults to a safe value when absent.
 */
export function readPath(root: Record<string, unknown>, path: DocPath): unknown {
  let current: unknown = root;

  for (const segment of path) {
    if (typeof segment === 'number') {
      if (!Array.isArray(current)) return undefined;
      current = current[segment];
      continue;
    }
    if (!isRecord(current)) return undefined;
    current = current[segment];
  }

  return current;
}

/**
 * 1-based line for `path`, falling back to line 1.
 *
 * Exact for JSON, approximate for JSON5 and TOML — see `parse/`.
 */
export function lineOf(config: AnalyzedConfig, path: DocPath): number {
  return config.doc.lineOf(path);
}

/** Renders a path as a config key for finding text, e.g. `app.security.csp`. */
export function formatPath(path: DocPath): string {
  return path.map((segment) => (typeof segment === 'number' ? `[${String(segment)}]` : segment)).join('.');
}

/** `true` only for a literal boolean `true`; a truthy string is not a `true`. */
export function isExplicitTrue(value: unknown): boolean {
  return value === true;
}

/** Non-empty array of strings. Empty arrays and mixed arrays do not qualify. */
export function isNonEmptyStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.every((item) => typeof item === 'string');
}
