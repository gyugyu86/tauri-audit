import { checkCspAbsence, REFERENCES, RULE_ID } from './shared/cspAbsence.js';

import type { ConfigRule } from './types.js';

/**
 * TA-CONF-001 — no Content Security Policy is configured.
 *
 * Ships as two rule objects sharing one ID and one implementation, matching
 * TA-CONF-002: the field exists in both generations at different paths while
 * `appliesTo` names a single generation. The engine's filter guarantees at most
 * one sees any document, and a document the discriminator could not place gets
 * neither.
 *
 * Unlike every other configuration rule here, this fires on an *absent* value —
 * see `shared/cspAbsence.ts` for why, and why that makes it heuristic.
 */

const SUMMARY =
  'No Content Security Policy is enforced, so the webview will execute any script that reaches ' +
  'the page and Tauri performs no nonce or hash rewriting.';

const SHORT_RECOMMENDATION =
  "Set a policy such as \"default-src 'self'\" and tighten it using the violation reports the " +
  'webview console produces.';

export const TA_CONF_001_V2: ConfigRule = {
  id: RULE_ID,
  kind: 'config',
  appliesTo: 'v2',
  severity: 'medium',
  maxConfidence: 'heuristic',
  evidence: 'real-world',
  target: 'app.security.csp',
  whyDangerous: SUMMARY,
  recommendation: SHORT_RECOMMENDATION,
  references: REFERENCES,
  check: (context) => checkCspAbsence(context, ['app', 'security']),
};

export const TA_CONF_001_V1: ConfigRule = {
  id: RULE_ID,
  kind: 'config',
  appliesTo: 'v1',
  severity: 'medium',
  maxConfidence: 'heuristic',
  evidence: 'synthetic-only',
  target: 'tauri.security.csp',
  whyDangerous: SUMMARY,
  recommendation: SHORT_RECOMMENDATION,
  references: REFERENCES,
  check: (context) => checkCspAbsence(context, ['tauri', 'security']),
};
