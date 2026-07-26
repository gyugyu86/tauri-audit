import path from 'node:path';

import type { Finding, Severity } from '../../core/types.js';

/**
 * Shared presentation model for the terminal and Markdown reporters.
 *
 * It groups and orders findings and nothing else — it never adds, drops or
 * mutates one. The JSON output and any snapshot therefore see exactly what the
 * engine produced, and a presentation change can never quietly alter results.
 */

export interface ReportMeta {
  rootDir: string;
  configsAnalyzed: number;
  configsUnplaced: number;
  capabilitiesAnalyzed: number;
  filesUnparsable: number;
  warnings: string[];
}

export interface FindingGroup {
  /** Path relative to the scan root. */
  file: string;
  line: number;
  findings: Finding[];
}

const SEVERITY_ORDER: Readonly<Record<Severity, number>> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

export function severityRank(severity: Severity): number {
  return SEVERITY_ORDER[severity];
}

/** Findings most-severe first; ties broken deterministically for stable output. */
export function orderedFindings(findings: readonly Finding[], rootDir: string): Finding[] {
  return [...findings].sort((a, b) => {
    const bySeverity = severityRank(a.severity) - severityRank(b.severity);
    if (bySeverity !== 0) return bySeverity;
    // Certain before uncertain, so the actionable items read first.
    if (a.confidence !== b.confidence) return a.confidence === 'high' ? -1 : 1;
    const byFile = relativize(a.file, rootDir).localeCompare(relativize(b.file, rootDir));
    if (byFile !== 0) return byFile;
    if (a.line !== b.line) return a.line - b.line;
    return a.ruleId.localeCompare(b.ruleId);
  });
}

/** Groups findings by location, groups ordered by their most severe member. */
export function groupFindings(findings: readonly Finding[], rootDir: string): FindingGroup[] {
  const groups = new Map<string, FindingGroup>();

  for (const finding of orderedFindings(findings, rootDir)) {
    const file = relativize(finding.file, rootDir);
    const key = `${file}:${String(finding.line)}`;
    const existing = groups.get(key);
    if (existing === undefined) {
      groups.set(key, { file, line: finding.line, findings: [finding] });
    } else {
      existing.findings.push(finding);
    }
  }

  return [...groups.values()];
}

export function relativize(filePath: string, rootDir: string): string {
  const relative = path.relative(rootDir, filePath);
  return relative === '' ? path.basename(filePath) : relative;
}

export function countBySeverity(findings: readonly Finding[]): Record<Severity, number> {
  const counts: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const finding of findings) counts[finding.severity] += 1;
  return counts;
}
