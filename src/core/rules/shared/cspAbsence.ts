import type { DocPath } from '../../parse/index.js';
import type { Finding } from '../../types.js';
import type { ConfigRuleContext } from '../types.js';
import { formatPath, readPath } from './configField.js';

/**
 * Detection shared by both generations of TA-CONF-001.
 *
 * **The dangerous state here is the absent one.** `security.csp` defaults to
 * `null`, and a null CSP means Tauri injects and enforces nothing — a Tauri
 * maintainer put it plainly: "The default CSP value in Tauri is null which means
 * no CSP is enabled or enforced by default". So unlike every rule keyed on a
 * dangerous flag being switched on, this one fires when nothing was written.
 *
 * That is why polarity is established per rule from the primary source rather
 * than carried over. TA-CAP-003, landing in the same release, is the ordinary
 * direction; this one is not.
 *
 * It follows that this fires on every application that has not set a CSP, which
 * is a large share of them. That is intended and is why it is medium severity
 * and heuristic: it never gates a build. A missing CSP is a real weakening of
 * defence in depth, and it is also completely unexploitable on its own — how
 * much it matters depends on whether the frontend renders anything the developer
 * did not write, which configuration cannot answer.
 *
 * The field exists in v1 at `tauri.security.csp` and in v2 at `app.security.csp`
 * with the same type and the same `null` default, so the judgement lives here
 * once and two thin wrappers supply their own path.
 */

export const RULE_ID = 'TA-CONF-001';

export const REFERENCES = [
  'https://v2.tauri.app/security/csp/',
  'https://v2.tauri.app/reference/config/#securityconfig',
  'https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy',
];

const WHY_DANGEROUS =
  'No Content Security Policy is configured. This is the default — the field is `null` unless ' +
  'set — and a null CSP means Tauri injects and enforces nothing, so the webview will execute ' +
  'any script that reaches the page.\n\n' +
  'Setting a CSP is also what activates the rest of the protection: Tauri rewrites a configured ' +
  'policy at build time, adding a nonce or hash for each script and style it bundles, so ' +
  'injected markup fails to execute even when it reaches the DOM. With no policy there is no ' +
  'rewriting to do, and an XSS in the frontend runs with the full privileges of the page — in a ' +
  'Tauri application, that means whatever IPC commands the webview is allowed to call.\n\n' +
  'This is reported as heuristic and never fails a build, because how much it matters depends ' +
  'on what the frontend renders. An application displaying only content its authors wrote is ' +
  'much less exposed than one rendering remote pages, user-supplied markup or Markdown — and ' +
  'configuration alone cannot tell those apart.';

function recommendation(key: string): string {
  return (
    `Set \`${key}\` to a policy that matches how the frontend actually loads code.\n\n` +
    'A strict starting point for an application that bundles everything it runs:\n\n' +
    '    "csp": "default-src \'self\'; img-src \'self\' asset: http://asset.localhost"\n\n' +
    'Tighten from there rather than loosening: add only the sources the application genuinely ' +
    'needs, and avoid `unsafe-inline` for `script-src` — it disables the protection this ' +
    'setting exists to provide.\n\n' +
    'To find what is actually required, set the policy, run the application, and read the CSP ' +
    'violation reports in the webview console. Each one names the directive and the blocked ' +
    'source, so the working policy is the one that ends with no reports.\n\n' +
    'If a development server needs looser rules than a release build, use `devCsp` for those ' +
    'rather than widening the policy you ship.'
  );
}

/**
 * The most specific line that exists, walking outwards.
 *
 * A rule about something that is *missing* has no key of its own to point at.
 * Falling straight to line 1 sends the reader to the opening brace of a config
 * that may be a hundred lines long; walking out from `csp` to `security` to
 * `app` lands on the nearest block they would actually edit. Yaak's proxy app
 * has no `security` block at all, which is what surfaced this.
 */
function locate(
  context: ConfigRuleContext,
  securityPath: readonly string[],
  cspIsExplicitNull: boolean,
): number {
  const candidates: DocPath[] = cspIsExplicitNull
    ? [[...securityPath, 'csp']]
    : [[...securityPath], securityPath.slice(0, -1)];

  for (const candidate of candidates) {
    if (candidate.length === 0) continue;
    if (readPath(context.config.value, candidate) === undefined) continue;
    const line = context.config.doc.lineOf(candidate);
    if (line > 1) return line;
  }

  return 1;
}

/**
 * @param securityPath path to the `security` object, e.g. `['app', 'security']`.
 */
export function checkCspAbsence(
  context: ConfigRuleContext,
  securityPath: readonly string[],
): Finding[] {
  const path: DocPath = [...securityPath, 'csp'];
  const value = readPath(context.config.value, path);
  const key = formatPath(path);

  // `undefined` (never written) and `null` (written as null) are the same state:
  // no policy is enforced. Any other value means a policy exists, and judging
  // whether that policy is strong enough is a separate question this rule does
  // not attempt.
  if (value !== undefined && value !== null) return [];

  return [
    {
      ruleId: RULE_ID,
      severity: 'medium',
      confidence: 'heuristic',
      file: context.config.file,
      line: locate(context, securityPath, value === null),
      target: value === null ? `${key}: null` : `${key} is not set`,
      whyDangerous: WHY_DANGEROUS,
      recommendation: recommendation(key),
      references: REFERENCES,
    },
  ];
}
