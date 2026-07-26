/**
 * Public API of the analysis engine.
 *
 * Everything the CLI (or any other consumer) is allowed to use is re-exported
 * here. `core/` must never import from `cli/` — the dependency runs one way only,
 * so the engine stays embeddable.
 */

export type {
  Confidence,
  Finding,
  Severity,
  TauriConfigVersion,
} from './types.js';

export { detectConfigVersion } from './configVersion.js';
export type { ConfigVersionVerdict } from './configVersion.js';

export { gatingFindings, hasGatingFindings, isGatingFinding } from './gate.js';
export type { FailMode } from './gate.js';

export { buildProjectContext } from './projectContext.js';
export type {
  AnalyzedCapability,
  AnalyzedConfig,
  AnalyzedTextFile,
  TauriProject,
} from './projectContext.js';

export { runRules } from './ruleEngine.js';
export type { RuleEngineResult } from './ruleEngine.js';

export { ALL_RULES } from './rules/index.js';
export type {
  CapabilityRule,
  CapabilityRuleContext,
  ConfigRule,
  ConfigRuleContext,
  ProjectRule,
  ProjectRuleContext,
  Rule,
} from './rules/types.js';

export { discover, readDiscoveredFile } from './discovery.js';
export type {
  DiscoveredFile,
  DiscoveryOptions,
  DiscoveryResult,
  FileKind,
} from './discovery.js';

export {
  approximateLineOf,
  LineIndex,
  parseConfigDocument,
  parseJson5Document,
  parseJsonDocument,
  parseTomlDocument,
} from './parse/index.js';
export type { DocPath, LocationPrecision, ParsedDocument } from './parse/index.js';

export {
  pointerToPath,
  schemaUnavailableReason,
  unsupportedSchemaFormats,
  validateTauriConfig,
} from './schemaValidate.js';
export type { SchemaIssue, SchemaVersion } from './schemaValidate.js';
