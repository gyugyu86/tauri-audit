/**
 * Core analysis model.
 *
 * `severity` and `confidence` are deliberately independent axes. Severity is how
 * bad the issue is if real; confidence is how sure we are that it IS real. A
 * critical issue we can only suspect stays `heuristic` — it must never gate CI by
 * default. Conflating the two is what makes static analyzers get uninstalled.
 */

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export type Confidence = 'high' | 'heuristic';

/**
 * Which Tauri config generation a document belongs to.
 *
 * `unknown` is a real outcome, not a failure: a document we cannot confidently
 * place is reported as a warning to the user and has NO config rules applied to
 * it. Guessing here would misapply v1 rules to v2 configs (and vice versa), which
 * is a pure false-positive source.
 */
export type TauriConfigVersion = 'v1' | 'v2' | 'unknown';

export interface Finding {
  /** e.g. 'TA-CONF-002'. One rule ID per rule file. */
  ruleId: string;
  severity: Severity;
  confidence: Confidence;
  /** Absolute path at engine level; formatters relativize for display. */
  file: string;
  /** 1-based. Best-effort for JSON5/TOML sources — see `parse/`. */
  line: number;
  /** Short description of the exact thing found, e.g. the offending config key. */
  target: string;
  whyDangerous: string;
  recommendation: string;
  /**
   * Advisory/spec URLs backing this finding. CVE-derived rules carry every
   * scoring source here, because GHSA / NVD / CNA routinely disagree on the same
   * CVE and quoting only one of them would misrepresent the risk.
   */
  references?: string[];
}
