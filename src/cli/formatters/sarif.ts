import { readFileSync } from 'node:fs';
import path from 'node:path';

import type { ReportMeta } from './reportModel.js';
import { orderedFindings } from './reportModel.js';

import type { Confidence, Finding, Severity } from '../../core/types.js';
import { ALL_RULES } from '../../core/rules/index.js';

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
 * The goal is narrow: a heuristic finding must never compete on equal footing
 * with a confident one. Two mechanisms carry that, because GitHub uses two.
 *
 * `security-severity` is the numeric key GitHub bands into its own labels.
 * Documented thresholds: over 9.0 is critical, 7.0-8.9 high, 4.0-6.9 medium,
 * 0.1-3.9 low, and 0.0 or out of range means no security severity at all. Two
 * consequences shaped the table below. A critical finding scores 9.5 rather than
 * 9.0, because 9.0 is not "over 9.0" and would badge one level down. And every
 * value is distinct, because the previous flat -2 penalty made a heuristic
 * critical (7.0) score identically to a confident high (7.0) — the exact tie
 * this grading exists to prevent.
 *
 * `level` is the badge shown against each alert, and it is what a reader
 * actually notices. Severity sets it and a heuristic finding drops one step, so
 * uncertainty is visible without reading a number.
 *
 * This grading is independent of the CI gate. SARIF shows everything, graded;
 * `core/gate.ts` decides pass or fail. Conflating them would mean either hiding
 * findings or failing builds on uncertainty.
 *
 * Confirmed against a real code-scanning run: GitHub resolves the band per
 * alert, not per rule, so a rule that emits both confidences badges each of its
 * alerts separately rather than lifting the heuristic ones to the confident
 * rule's band. Any adjustment stays inside this function.
 */
const SCORE: Readonly<Record<Severity, Readonly<Record<Confidence, number>>>> = {
  // Every value sits strictly inside (0.0, 10.0], and for each severity the
  // heuristic score is strictly below the confident one. `sarif.test.ts` asserts
  // both, so a future edit cannot silently reintroduce a tie.
  critical: { high: 9.5, heuristic: 7.5 },
  high: { high: 8.0, heuristic: 5.0 },
  medium: { high: 6.0, heuristic: 3.5 },
  low: { high: 2.5, heuristic: 1.5 },
  info: { high: 1.0, heuristic: 0.5 },
};

const LEVEL_BY_SEVERITY: Readonly<Record<Severity, SarifLevel>> = {
  critical: 'error',
  high: 'error',
  medium: 'warning',
  low: 'note',
  info: 'note',
};

/** One step quieter. `note` is already the quietest level SARIF defines. */
const DEMOTED: Readonly<Record<SarifLevel, SarifLevel>> = {
  error: 'warning',
  warning: 'note',
  note: 'note',
};

/** Joins the config paths of a rule's v1 and v2 variants. Display only. */
export const TARGET_SEPARATOR = ' / ';

interface RuleDoc {
  shortDescription: string;
  fullDescription: string;
  help: string;
  references: readonly string[];
  severity: Severity;
  confidence: Confidence;
}

/**
 * What each rule descriptor says, derived from the rule and nothing else.
 *
 * A SARIF rule descriptor is documentation about the rule; the per-result
 * `message` is what happened at one location. Filling the descriptor from the
 * first finding of the run conflated the two, and GitHub's alert list shows the
 * descriptor rather than the message — so every alert of a rule was titled after
 * whichever finding happened to come first. Two `dangerousRemoteDomainIpcAccess`
 * entries appeared under one title claiming `[0]` and `enableTauriAPI: true`,
 * while the alert on line 26 was the second entry and had neither. The location
 * was right and the title described something not there.
 *
 * Built once, at module load, from ALL_RULES. Nothing in it can vary with the
 * project being scanned — which is the same reason `security-severity` is taken
 * from the declared ceiling rather than from the run.
 *
 * A rule ID may have several rule objects: TA-CONF-001 and TA-CONF-002 each
 * carry a v1 and a v2 variant that differ only in the config path they read.
 * SARIF allows one descriptor per ID, so the distinct paths are joined and the
 * rest is asserted identical by `sarif.test.ts`.
 *
 * Targets are accumulated as a list and joined once. Joining into a string and
 * splitting it again to add the next one would have been shorter and wrong:
 * TA-DEP-001's target already contains the separator, so a round trip through
 * it would fragment `tauri-plugin-shell / @tauri-apps/plugin-shell <= 2.2.0`
 * into two targets that no rule declares.
 */
const RULE_DOC: ReadonlyMap<string, RuleDoc> = (() => {
  const targets = new Map<string, string[]>();
  const byId = new Map<string, Omit<RuleDoc, 'shortDescription'>>();

  for (const rule of ALL_RULES) {
    const seen = targets.get(rule.id) ?? [];
    if (!seen.includes(rule.target)) targets.set(rule.id, [...seen, rule.target]);

    if (!byId.has(rule.id)) {
      byId.set(rule.id, {
        fullDescription: rule.whyDangerous,
        help: rule.recommendation,
        references: rule.references ?? [],
        severity: rule.severity,
        confidence: rule.maxConfidence,
      });
    }
  }

  return new Map(
    [...byId].map(([id, doc]) => [
      id,
      { ...doc, shortDescription: (targets.get(id) ?? []).join(TARGET_SEPARATOR) },
    ]),
  );
})();

export function sarifGrading(severity: Severity, confidence: Confidence): SarifGrading {
  const base = LEVEL_BY_SEVERITY[severity];
  return {
    level: confidence === 'heuristic' ? DEMOTED[base] : base,
    securitySeverity: SCORE[severity][confidence].toFixed(1),
  };
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

  /**
   * The ceiling each rule declares, not what this run happened to produce.
   *
   * `security-severity` is a rule-level property in SARIF, so a rule emitting
   * both confidences still needs one number to describe it, and there are two
   * ways to pick it.
   *
   * Taking the strongest grading the run produced was the first attempt, and it
   * makes rule metadata depend on the project being scanned: the same tool
   * version would describe TA-V1-002 as 8.0 for one repository and 5.0 for
   * another. Rule descriptors are documentation about the rule, so they should
   * not move with the target. The declared `severity` and `maxConfidence` give a
   * fixed answer, and `rules.test.ts` asserts no finding ever exceeds it.
   *
   * This number does not decide what a reader sees. A real code-scanning run
   * showed one rule's alerts badged at different severities, so GitHub resolves
   * the band per alert. The descriptor is documentation; `level` is the display.
   */
  for (const finding of ordered) {
    if (ruleIndex.has(finding.ruleId)) continue;
    ruleIndex.set(finding.ruleId, rules.length);

    // Findings with no registered rule — schema conformance, and synthetic
    // findings in tests — are described by themselves. Real rules never take
    // this branch.
    const doc = RULE_DOC.get(finding.ruleId) ?? {
      shortDescription: finding.target,
      fullDescription: finding.whyDangerous,
      help: finding.recommendation,
      references: finding.references ?? [],
      severity: finding.severity,
      confidence: finding.confidence,
    };
    const grading = sarifGrading(doc.severity, doc.confidence);

    rules.push({
      id: finding.ruleId,
      name: finding.ruleId,
      shortDescription: { text: doc.shortDescription },
      fullDescription: { text: doc.fullDescription },
      help: { text: doc.help },
      defaultConfiguration: { level: grading.level },
      ...(doc.references[0] === undefined ? {} : { helpUri: doc.references[0] }),
      properties: {
        'security-severity': grading.securitySeverity,
        ...(doc.references.length > 0 ? { references: doc.references } : {}),
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
