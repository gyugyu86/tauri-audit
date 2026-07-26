import type { TauriProject } from './projectContext.js';
import type { CapabilityRule, ConfigRule, ProjectRule, Rule } from './rules/types.js';
import type { Finding } from './types.js';

export interface RuleEngineResult {
  findings: Finding[];
  warnings: string[];
  /**
   * Reasons the analysis did not fully cover the project. Non-empty means "zero
   * findings" cannot be read as "clean", and the CLI turns this into exit 2.
   */
  incomplete: string[];
  configsAnalyzed: number;
  configsUnplaced: number;
  capabilitiesAnalyzed: number;
  filesUnparsable: number;
}

/** Rule IDs are reserved for rules; schema conformance gets its own namespace. */
const SCHEMA_RULE_ID = 'TA-SCHEMA-001';

/**
 * Turns schema conformance problems into `info` findings.
 *
 * These are deliberately not security findings, and `info` can never gate a
 * build. The vendored schema tracks one Tauri release while the projects we
 * analyze track many, so a config can disagree with our copy without being wrong.
 * Authority over security judgements stays with the discriminator and the rules
 * that inspect keys directly — never with schema validation.
 */
function schemaFindings(project: TauriProject): Finding[] {
  const findings: Finding[] = [];

  for (const config of project.configs) {
    for (const issue of config.schemaIssues) {
      findings.push({
        ruleId: SCHEMA_RULE_ID,
        severity: 'info',
        confidence: 'high',
        file: config.file,
        line: config.doc.lineOf(issue.path),
        target: `${issue.instancePath === '' ? '(document root)' : issue.instancePath}: ${issue.message}`,
        whyDangerous:
          'This does not match the official Tauri configuration schema. It is reported for ' +
          'correctness, not security: an unknown or mistyped key is usually ignored at runtime, ' +
          'so a setting you believe is applied may silently not be.',
        recommendation:
          'Check the key against the configuration reference for your Tauri version. If the key ' +
          'is valid for a newer release than the schema bundled with tauri-audit, this can be ' +
          'ignored.',
        references: ['https://v2.tauri.app/reference/config/'],
      });
    }
  }

  return findings;
}

/**
 * Runs rules over an assembled project.
 *
 * Config rules are filtered by the discriminator's verdict before they are
 * called, so a rule cannot see a config from the other generation. That check
 * lives here rather than in each rule so it cannot be forgotten by a new rule.
 */
export function runRules(project: TauriProject, rules: readonly Rule[]): RuleEngineResult {
  const findings: Finding[] = [];

  const configRules = rules.filter((rule): rule is ConfigRule => rule.kind === 'config');
  const capabilityRules = rules.filter((rule): rule is CapabilityRule => rule.kind === 'capability');
  const projectRules = rules.filter((rule): rule is ProjectRule => rule.kind === 'project');

  for (const config of project.configs) {
    for (const rule of configRules) {
      if (rule.appliesTo !== config.verdict.version) continue;
      findings.push(...rule.check({ config, project }));
    }
  }

  for (const capability of project.capabilities) {
    for (const rule of capabilityRules) {
      findings.push(...rule.check({ capability, project }));
    }
  }

  for (const rule of projectRules) {
    findings.push(...rule.check({ project }));
  }

  findings.push(...schemaFindings(project));

  return {
    findings,
    warnings: project.warnings,
    incomplete: project.incomplete,
    configsAnalyzed: project.configs.length,
    configsUnplaced: project.unplacedConfigs.length,
    capabilitiesAnalyzed: project.capabilities.length,
    filesUnparsable: project.filesUnparsable,
  };
}
