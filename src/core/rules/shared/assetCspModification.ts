import type { DocPath } from '../../parse/index.js';
import type { Finding } from '../../types.js';
import type { ConfigRuleContext } from '../types.js';
import { formatPath, isExplicitTrue, isNonEmptyStringArray, readPath } from './configField.js';

/**
 * Detection shared by both generations of TA-CONF-002.
 *
 * `dangerousDisableAssetCspModification` exists in v1 at `tauri.security` and in
 * v2 at `app.security`, with a structurally identical schema
 * (`DisabledCspModificationKind`: `boolean | string[]`, default `false`) — only
 * the surrounding path differs. The judgement lives here once; the two rule files
 * are thin wrappers that supply their own path and share this rule ID.
 */

export const RULE_ID = 'TA-CONF-002';

export const REFERENCES = [
  'https://v2.tauri.app/reference/config/#securityconfig',
  'https://v2.tauri.app/security/csp/',
];

const WHY_DISABLED_ENTIRELY =
  'Tauri normally rewrites your CSP at build time, injecting a nonce or hash for every script ' +
  'and style it bundles. Setting this to `true` turns that off completely. The official schema ' +
  'warns that an application is "vulnerable to XSS attacks without this Tauri protection": any ' +
  'injected script in the frontend then executes with the page\'s full privileges, which in a ' +
  'Tauri app means reaching whatever IPC commands the webview is allowed to call.';

const WHY_DISABLED_PARTIALLY =
  'Tauri normally rewrites your CSP at build time, injecting a nonce or hash for every script ' +
  'and style it bundles. Listing directives here turns that rewriting off for those directives ' +
  'only, so the protection is reduced rather than removed. Whether that matters depends on which ' +
  'directives are listed and on what your own CSP already specifies for them — which is why this ' +
  'is reported as heuristic rather than as a definite flaw.';

const RECOMMENDATION_DISABLED_ENTIRELY =
  'Remove the setting so Tauri manages the CSP, or confirm you are replacing it with equivalent ' +
  'protection.\n\n' +
  'To confirm: your own CSP must cover every directive Tauri would have handled, and it must ' +
  'constrain script and style sources at least as tightly — a nonce or hash per bundled asset, ' +
  'not `unsafe-inline`. A CSP containing `script-src` with `unsafe-inline`, or no `script-src` at ' +
  'all, is not equivalent. Note that this setting is what allows a self-managed CSP to survive ' +
  'the build, so removing it and keeping your CSP is usually the correct fix.';

const RECOMMENDATION_DISABLED_PARTIALLY =
  'Confirm each listed directive is one you intend to manage yourself.\n\n' +
  'To confirm: for every directive named here, check that your own `app.security.csp` specifies ' +
  'it explicitly and at least as tightly as Tauri would have. A directive that is disabled here ' +
  'but absent from your CSP is unprotected in both places. If a directive was added to work ' +
  'around a bundler rather than by intent, remove it from this list.';

/**
 * @param securityPath path to the `security` object, e.g. `['app', 'security']`.
 */
export function checkAssetCspModification(
  context: ConfigRuleContext,
  securityPath: readonly string[],
): Finding[] {
  const path: DocPath = [...securityPath, 'dangerousDisableAssetCspModification'];
  const value = readPath(context.config.value, path);
  const key = formatPath(path);

  // `true` is the only value that disables CSP rewriting outright, and the schema
  // documents exactly what it costs. Nothing further needs to be true for the
  // protection to be gone, so this is the one high-confidence case.
  if (isExplicitTrue(value)) {
    return [
      {
        ruleId: RULE_ID,
        severity: 'high',
        confidence: 'high',
        file: context.config.file,
        line: context.config.doc.lineOf(path),
        target: `${key}: true`,
        whyDangerous: WHY_DISABLED_ENTIRELY,
        recommendation: RECOMMENDATION_DISABLED_ENTIRELY,
        references: REFERENCES,
      },
    ];
  }

  // An array is a different setting that happens to share a key: it names
  // directives to leave alone. Treating it as equivalent to `true` would be a
  // false positive on a deliberately narrow, defensible choice.
  if (isNonEmptyStringArray(value)) {
    return [
      {
        ruleId: RULE_ID,
        severity: 'medium',
        confidence: 'heuristic',
        file: context.config.file,
        line: context.config.doc.lineOf(path),
        target: `${key}: [${value.map((directive) => `"${directive}"`).join(', ')}]`,
        whyDangerous: WHY_DISABLED_PARTIALLY,
        recommendation: RECOMMENDATION_DISABLED_PARTIALLY,
        references: REFERENCES,
      },
    ];
  }

  // `false`, absent, an empty array (which disables nothing), and any value the
  // schema would reject all fall through silently. Type errors are reported as
  // schema findings, not as security findings.
  return [];
}
