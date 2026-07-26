import type { AnalyzedCapability, AnalyzedConfig, TauriProject } from '../projectContext.js';
import type { Finding, Severity } from '../types.js';

/**
 * Rule authoring contract.
 *
 * One file per rule ID. Rules are plain objects, registered by hand in
 * `rules/index.ts` — no filesystem discovery, so the set of active rules is one
 * readable list that the CLI and every corpus test share.
 */

/**
 * How strongly this rule has been shown to fire on genuine misconfiguration.
 *
 * The clean corpus proves the negative direction for every rule: none of them
 * fire on six real, correctly written applications. The positive direction —
 * that a rule fires on real misconfigured code, not just on a fixture we wrote
 * to make it fire — is a separate claim, and it does not hold equally for all
 * rules. Settings this dangerous are rare in shipped applications, so some rules
 * can only be demonstrated synthetically.
 *
 * This lives in metadata rather than in prose so it stays attached to the rule
 * it describes, can be asserted in tests, and can be generated into docs — the
 * same reason advisory exemption conditions are data rather than restated in
 * each rule body.
 */
export type RuleEvidence =
  /**
   * Fires on at least one unmodified third-party config in `tests/corpus/`.
   *
   * Either group counts. Firing in `true-positive/` means the rule catches a
   * genuine misconfiguration; firing in `clean/` means the pattern occurs in
   * correctly written applications, which is evidence the rule matches real code
   * — and simultaneously proof it must stay heuristic, since a high-confidence
   * finding there would fail those projects' builds.
   */
  | 'real-world'
  /** Demonstrated only against fixtures authored for this repository. */
  | 'synthetic-only';

interface BaseRule {
  /** e.g. 'TA-CONF-002'. */
  id: string;
  severity: Severity;
  /** Short description of what the rule looks at, shown as the finding headline. */
  target: string;
  whyDangerous: string;
  recommendation: string;
  evidence: RuleEvidence;
  /**
   * Advisory and specification URLs. CVE-derived rules list every scoring source
   * here, because GHSA, NVD and the CNA regularly disagree on the same CVE.
   */
  references?: string[];
}

export interface ConfigRuleContext {
  config: AnalyzedConfig;
  project: TauriProject;
}

export interface CapabilityRuleContext {
  capability: AnalyzedCapability;
  project: TauriProject;
}

export interface ProjectRuleContext {
  project: TauriProject;
}

/**
 * Runs once per discovered Tauri config document — but only against the
 * generation it declares.
 *
 * `appliesTo` is enforced by the engine, not by the rule body. A v2 rule is never
 * handed a v1 document, so it cannot fire on one even if its key name happens to
 * exist in both schemas (`security.csp` and `security.freezePrototype` do). This
 * is the structural half of the false-positive defence; the discriminator is the
 * other half.
 */
export interface ConfigRule extends BaseRule {
  kind: 'config';
  appliesTo: 'v1' | 'v2';
  check(context: ConfigRuleContext): Finding[];
}

/** Runs once per `capabilities/*.json` file. v2-only by definition. */
export interface CapabilityRule extends BaseRule {
  kind: 'capability';
  check(context: CapabilityRuleContext): Finding[];
}

/**
 * Runs once for the whole project.
 *
 * For facts that are not about a single config document: dependency versions,
 * `vite.config.*`, or cross-file conditions such as a CVE whose exemption
 * depends on a capability declared elsewhere.
 */
export interface ProjectRule extends BaseRule {
  kind: 'project';
  check(context: ProjectRuleContext): Finding[];
}

export type Rule = ConfigRule | CapabilityRule | ProjectRule;
