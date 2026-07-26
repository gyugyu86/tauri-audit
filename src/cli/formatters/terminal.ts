import chalk from 'chalk';

import { countBySeverity, groupFindings, type ReportMeta } from './reportModel.js';

import type { Finding, Severity } from '../../core/types.js';

const SEVERITY_BADGE: Readonly<Record<Severity, (label: string) => string>> = {
  critical: (label) => chalk.bgRed.white.bold(` ${label} `),
  high: (label) => chalk.red.bold(label),
  medium: (label) => chalk.yellow.bold(label),
  low: (label) => chalk.blue(label),
  info: (label) => chalk.gray(label),
};

const SEVERITY_ORDER: readonly Severity[] = ['critical', 'high', 'medium', 'low', 'info'];

function indent(text: string, prefix = '    '): string {
  return text
    .split('\n')
    .map((line) => (line === '' ? line : `${prefix}${line}`))
    .join('\n');
}

function renderFinding(finding: Finding): string {
  const badge = SEVERITY_BADGE[finding.severity](finding.severity.toUpperCase());
  // The heuristic tag is the single most important thing on screen: it is what
  // tells the reader this will not fail their build and may not be real.
  const tag = finding.confidence === 'heuristic' ? ` ${chalk.yellow('[heuristic]')}` : '';

  const lines = [
    `  ${badge} ${chalk.bold(finding.ruleId)}${tag} ${finding.target}`,
    '',
    indent(`${chalk.dim("Why it's dangerous:")} ${finding.whyDangerous}`),
    '',
    indent(chalk.dim('Recommended fix:')),
    indent(finding.recommendation, '      '),
  ];

  if (finding.references !== undefined && finding.references.length > 0) {
    lines.push('', indent(chalk.dim(`References: ${finding.references.join(' ')}`)));
  }

  return lines.join('\n');
}

export function formatTerminal(findings: readonly Finding[], meta: ReportMeta): string {
  const groups = groupFindings(findings, meta.rootDir);
  const counts = countBySeverity(findings);
  const out: string[] = [];

  for (const group of groups) {
    out.push(chalk.underline(`${group.file}:${String(group.line)}`));
    out.push('');
    for (const finding of group.findings) {
      out.push(renderFinding(finding));
      out.push('');
    }
  }

  if (findings.length === 0) {
    out.push(chalk.green('No findings.'));
  } else {
    const breakdown = SEVERITY_ORDER.filter((severity) => counts[severity] > 0)
      .map((severity) => `${severity} ${String(counts[severity])}`)
      .join(' · ');
    const heuristics = findings.filter((finding) => finding.confidence === 'heuristic').length;
    const heuristicNote =
      heuristics > 0
        ? chalk.dim(` — ${String(heuristics)} heuristic, not counted toward the exit code by default`)
        : '';
    const noun = findings.length === 1 ? 'finding' : 'findings';
    out.push(`${String(findings.length)} ${noun} (${breakdown})${heuristicNote}`);
  }

  return out.join('\n');
}

/**
 * Warnings are rendered separately and written to stderr by the caller, so they
 * never contaminate piped `--json` or `--sarif` output.
 */
export function formatWarnings(warnings: readonly string[]): string {
  return warnings.map((warning) => `${chalk.yellow('warning:')} ${warning}`).join('\n');
}
