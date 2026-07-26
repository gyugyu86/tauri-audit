import {
  checkAssetCspModification,
  REFERENCES,
  RULE_ID,
} from './shared/assetCspModification.js';

import type { ConfigRule } from './types.js';

/**
 * TA-CONF-002 — Tauri's CSP rewriting is disabled.
 *
 * The field exists in both config generations at different paths, and `appliesTo`
 * takes a single generation, so this ships as two rule objects sharing one rule
 * ID and one implementation. Only one can ever fire for a given document: the
 * engine matches `appliesTo` against the discriminator's verdict, and a document
 * it could not place gets neither.
 *
 * `severity` here is the rule's headline for SARIF's rule descriptor. Individual
 * findings carry their own severity, because `true` (protection off entirely) and
 * a directive list (protection narrowed) are different situations behind one key.
 */

const TARGET = 'security.dangerousDisableAssetCspModification';

const SUMMARY =
  "Disables Tauri's build-time CSP rewriting, which the official schema warns leaves an " +
  'application vulnerable to XSS.';

export const TA_CONF_002_V2: ConfigRule = {
  id: RULE_ID,
  kind: 'config',
  appliesTo: 'v2',
  severity: 'high',
  evidence: 'synthetic-only',
  target: `app.${TARGET}`,
  whyDangerous: SUMMARY,
  recommendation: 'Let Tauri manage the CSP, or verify your own CSP is equivalently strict.',
  references: REFERENCES,
  check: (context) => checkAssetCspModification(context, ['app', 'security']),
};

export const TA_CONF_002_V1: ConfigRule = {
  id: RULE_ID,
  kind: 'config',
  appliesTo: 'v1',
  severity: 'high',
  evidence: 'synthetic-only',
  target: `tauri.${TARGET}`,
  whyDangerous: SUMMARY,
  recommendation: 'Let Tauri manage the CSP, or verify your own CSP is equivalently strict.',
  references: REFERENCES,
  check: (context) => checkAssetCspModification(context, ['tauri', 'security']),
};
