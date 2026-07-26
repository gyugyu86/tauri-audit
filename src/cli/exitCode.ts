import { hasGatingFindings, type FailMode } from '../core/gate.js';

import type { Finding } from '../core/types.js';

export type ExitCode = 0 | 1 | 2;

/**
 * Exit codes.
 *
 * | code | meaning |
 * | --- | --- |
 * | 0 | analysis completed and found nothing that gates |
 * | 1 | gating findings (see `core/gate.ts`) |
 * | 2 | operational error, or the analysis could not fully cover the project |
 *
 * The `2` case carries the invariant that unanalyzable is not clean. If a config
 * could not be parsed, placed as v1/v2, or schema-checked, then no rule ran over
 * it and "zero findings" says nothing about it. Returning 0 there would report
 * silence as safety.
 *
 * `--no-fail` suppresses only finding-derived failure. It is a statement about
 * findings ("do not block my build over what you found"), not a claim that the
 * run succeeded, so it cannot turn a `2` into a `0`. A static analyzer that fails
 * CI on its own false positives gets uninstalled; one that reports "clean" when
 * it never read the file is worse.
 */
export function computeExitCode(
  findings: readonly Finding[],
  mode: FailMode,
  incomplete: readonly string[] = [],
): ExitCode {
  if (incomplete.length > 0) return 2;
  return hasGatingFindings(findings, mode) ? 1 : 0;
}

/** Maps commander's flags to a mode. `--no-fail` wins over `--strict`. */
export function resolveFailMode(options: { fail?: boolean; strict?: boolean }): FailMode {
  if (options.fail === false) return 'none';
  return options.strict === true ? 'strict' : 'default';
}
