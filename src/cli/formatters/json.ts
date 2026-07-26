import { countBySeverity, orderedFindings, relativize, type ReportMeta } from './reportModel.js';

import type { Finding } from '../../core/types.js';

/**
 * Machine-readable output.
 *
 * `schemaVersion` is bumped only on a breaking change to this shape, so consumers
 * can pin against it.
 */
const SCHEMA_VERSION = 1;

export function formatJson(findings: readonly Finding[], meta: ReportMeta): string {
  const ordered = orderedFindings(findings, meta.rootDir);

  return JSON.stringify(
    {
      tool: 'tauri-audit',
      schemaVersion: SCHEMA_VERSION,
      summary: {
        total: ordered.length,
        bySeverity: countBySeverity(ordered),
        configsAnalyzed: meta.configsAnalyzed,
        configsUnplaced: meta.configsUnplaced,
        capabilitiesAnalyzed: meta.capabilitiesAnalyzed,
        filesUnparsable: meta.filesUnparsable,
      },
      warnings: meta.warnings,
      findings: ordered.map((finding) => ({
        ruleId: finding.ruleId,
        severity: finding.severity,
        confidence: finding.confidence,
        file: relativize(finding.file, meta.rootDir),
        line: finding.line,
        target: finding.target,
        whyDangerous: finding.whyDangerous,
        recommendation: finding.recommendation,
        references: finding.references ?? [],
      })),
    },
    null,
    2,
  );
}
