import type { Finding, Severity } from './types.js';

/**
 * The gating predicate — the single definition of "this finding should fail a
 * build".
 *
 * This lives in `core/`, not `cli/`, because two very different callers must
 * agree on it exactly:
 *
 * 1. the CLI's exit code, which decides whether a user's build fails, and
 * 2. the clean-corpus regression test, which asserts that real, correctly
 *    written apps produce none of these.
 *
 * If those two ever drifted apart, the corpus test would be asserting something
 * other than "tauri-audit would not break this app's CI" while appearing to
 * assert exactly that. One function, imported by both, is what makes the claim
 * honest.
 */

export type FailMode = 'default' | 'strict' | 'none';

/**
 * Severities that can gate. `medium` and below never fail a build regardless of
 * confidence: they are worth reporting and not worth blocking a release over.
 */
const GATING_SEVERITIES: ReadonlySet<Severity> = new Set<Severity>(['critical', 'high']);

export function isGatingFinding(finding: Finding, mode: FailMode = 'default'): boolean {
  if (mode === 'none') return false;
  if (!GATING_SEVERITIES.has(finding.severity)) return false;
  // Default mode gates on certainty only. `--strict` opts into heuristics too,
  // for teams that would rather investigate a false positive than miss anything.
  return mode === 'strict' || finding.confidence === 'high';
}

export function hasGatingFindings(findings: readonly Finding[], mode: FailMode = 'default'): boolean {
  return findings.some((finding) => isGatingFinding(finding, mode));
}

export function gatingFindings(
  findings: readonly Finding[],
  mode: FailMode = 'default',
): Finding[] {
  return findings.filter((finding) => isGatingFinding(finding, mode));
}
