import { readFileSync } from 'node:fs';
import path from 'node:path';

import type { ReportMeta } from './reportModel.js';
import { orderedFindings } from './reportModel.js';

import type { Confidence, Finding, Severity } from '../../core/types.js';

const SARIF_SCHEMA = 'https://json.schemastore.org/sarif-2.1.0.json';
const INFORMATION_URI = 'https://github.com/gyugyu86/tauri-audit';

export type SarifLevel = 'error' | 'warning' | 'note';

export interface SarifGrading {
  level: SarifLevel;
  /** GitHub's numeric sort key, serialised as a string per its convention. */
  securitySeverity: string;
}

/**
 * The single place where a finding's severity and confidence become GitHub's
 * grading. Every SARIF field that depends on either goes through here.
 *
 * `security-severity` folds confidence into the score by subtracting a penalty,
 * so a certain finding always outranks an uncertain one of the same severity in
 * GitHub's ordering. `level` currently derives from severity alone.
 *
 * PROVISIONAL: the penalty value and the choice to leave `level` untouched are
 * unverified against how GitHub actually renders them. S7's self-scan checks the
 * real code-scanning UI, and this function is deliberately the only thing that
 * would need to change — including if heuristics should instead drop to
 * `level: 'note'`.
 *
 * Note that this grading is independent of the CI gate. SARIF shows everything,
 * graded; `core/gate.ts` decides pass or fail. Conflating them would mean either
 * hiding findings or failing builds on uncertainty.
 */
const BASE_SCORE: Readonly<Record<Severity, number>> = {
  critical: 9,
  high: 7,
  medium: 5,
  low: 3,
  info: 1,
};

const HEURISTIC_PENALTY = 2;

function levelFor(severity: Severity): SarifLevel {
  if (severity === 'critical' || severity === 'high') return 'error';
  if (severity === 'medium') return 'warning';
  return 'note';
}

export function sarifGrading(severity: Severity, confidence: Confidence): SarifGrading {
  const base = BASE_SCORE[severity];
  const score = confidence === 'heuristic' ? Math.max(0.5, base - HEURISTIC_PENALTY) : base;
  return { level: levelFor(severity), securitySeverity: score.toFixed(1) };
}

/**
 * GitHub resolves `artifactLocation.uri` against the repository checkout root,
 * which is the working directory of the action step — not our scan root. The
 * JSON and Markdown reporters stay scan-root relative on purpose; only SARIF
 * needs this.
 */
function toSarifUri(filePath: string, cwd: string): string {
  const relative = path.relative(cwd, filePath);
  const normalized = relative === '' ? path.basename(filePath) : relative;
  return normalized.split(path.sep).join('/');
}

function readToolVersion(): string {
  try {
    const url = new URL('../../../package.json', import.meta.url);
    const parsed = JSON.parse(readFileSync(url, 'utf8')) as { version?: unknown };
    return typeof parsed.version === 'string' ? parsed.version : '0.0.0';
  } catch {
    return '0.0.0';
  }
}

export interface SarifOptions {
  /**
   * `run.automationDetails.id`. Since 2025-07-22 GitHub rejects deliveries whose
   * runs share a tool and category, so every run needs one.
   */
  category?: string;
  /** Base for artifact URIs. Defaults to the process working directory. */
  cwd?: string;
}

export function formatSarif(
  findings: readonly Finding[],
  meta: ReportMeta,
  options: SarifOptions = {},
): string {
  const cwd = options.cwd ?? process.cwd();
  const category = options.category ?? 'tauri-audit';
  const ordered = orderedFindings(findings, meta.rootDir);

  // One reportingDescriptor per rule ID, in first-seen order.
  const ruleIndex = new Map<string, number>();
  const rules: unknown[] = [];

  for (const finding of ordered) {
    if (ruleIndex.has(finding.ruleId)) continue;
    ruleIndex.set(finding.ruleId, rules.length);

    const references = finding.references ?? [];
    rules.push({
      id: finding.ruleId,
      name: finding.ruleId,
      shortDescription: { text: finding.target },
      fullDescription: { text: finding.whyDangerous },
      help: { text: finding.recommendation },
      // A rule descriptor is shared by every finding of that rule, so it is
      // graded as if certain; per-result grading below carries the real
      // confidence.
      defaultConfiguration: { level: sarifGrading(finding.severity, 'high').level },
      ...(references[0] === undefined ? {} : { helpUri: references[0] }),
      properties: {
        'security-severity': sarifGrading(finding.severity, 'high').securitySeverity,
        ...(references.length > 0 ? { references } : {}),
      },
    });
  }

  const results = ordered.map((finding) => {
    const grading = sarifGrading(finding.severity, finding.confidence);
    const references = finding.references ?? [];

    return {
      ruleId: finding.ruleId,
      ruleIndex: ruleIndex.get(finding.ruleId) ?? 0,
      level: grading.level,
      message: {
        text: `${finding.confidence === 'heuristic' ? '[heuristic] ' : ''}${finding.target}`,
      },
      locations: [
        {
          physicalLocation: {
            artifactLocation: { uri: toSarifUri(finding.file, cwd) },
            region: { startLine: Math.max(1, finding.line) },
          },
        },
      ],
      properties: {
        confidence: finding.confidence,
        'security-severity': grading.securitySeverity,
        ...(references.length > 0 ? { references } : {}),
      },
    };
  });

  const sarif = {
    $schema: SARIF_SCHEMA,
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: 'tauri-audit',
            informationUri: INFORMATION_URI,
            version: readToolVersion(),
            rules,
          },
        },
        automationDetails: { id: category },
        results,
      },
    ],
  };

  return JSON.stringify(sarif, null, 2);
}
