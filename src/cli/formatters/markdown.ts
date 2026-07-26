import { countBySeverity, orderedFindings, relativize, type ReportMeta } from './reportModel.js';

import type { Finding, Severity } from '../../core/types.js';

const SEVERITY_HEADINGS: Readonly<Record<Severity, string>> = {
  critical: '🔴 Critical',
  high: '🟠 High',
  medium: '🟡 Medium',
  low: '🔵 Low',
  info: '⚪ Info',
};

const SEVERITY_SECTIONS: readonly Severity[] = ['critical', 'high', 'medium', 'low', 'info'];

function renderFinding(finding: Finding, rootDir: string): string {
  const lines: string[] = [];
  const tag = finding.confidence === 'heuristic' ? ' `[heuristic]`' : '';

  lines.push(`#### ${finding.ruleId}${tag} — ${finding.target}`);
  lines.push('');
  lines.push(`\`${relativize(finding.file, rootDir)}:${String(finding.line)}\``);
  lines.push('');
  lines.push(`**Why it's dangerous:** ${finding.whyDangerous}`);
  lines.push('');
  lines.push('**Recommended fix:**');
  lines.push('');
  // Untagged fence: the recommendation is prose plus occasional config, and
  // mislabelling it as one language highlights the rest of it wrongly.
  lines.push('```');
  lines.push(finding.recommendation);
  lines.push('```');

  if (finding.references !== undefined && finding.references.length > 0) {
    lines.push('');
    lines.push(`**References:** ${finding.references.map((url) => `<${url}>`).join(' · ')}`);
  }

  lines.push('');
  return lines.join('\n');
}

export function formatMarkdown(findings: readonly Finding[], meta: ReportMeta): string {
  const ordered = orderedFindings(findings, meta.rootDir);
  const counts = countBySeverity(ordered);
  const lines: string[] = ['# tauri-audit report', ''];

  if (ordered.length === 0) {
    lines.push('No findings.', '');
  } else {
    const summary = SEVERITY_SECTIONS.filter((severity) => counts[severity] > 0)
      .map((severity) => `${severity} ${String(counts[severity])}`)
      .join(' · ');
    lines.push(`${String(ordered.length)} findings (${summary})`, '');
  }

  for (const severity of SEVERITY_SECTIONS) {
    const inSection = ordered.filter((finding) => finding.severity === severity);
    if (inSection.length === 0) continue;
    lines.push(`## ${SEVERITY_HEADINGS[severity]}`, '');
    for (const finding of inSection) lines.push(renderFinding(finding, meta.rootDir));
  }

  if (meta.warnings.length > 0) {
    lines.push('## Warnings', '');
    for (const warning of meta.warnings) lines.push(`- ${warning}`);
    lines.push('');
  }

  return lines.join('\n');
}
