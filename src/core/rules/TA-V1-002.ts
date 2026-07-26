import { isExplicitTrue, isNonEmptyStringArray, readPath } from './shared/configField.js';

import type { DocPath } from '../parse/index.js';
import type { Finding, Severity } from '../types.js';
import type { ConfigRule } from './types.js';

/**
 * TA-V1-002 — remote origins are granted IPC access.
 *
 * `dangerousRemoteDomainIpcAccess` lets a remote domain loaded in a window reach
 * the Rust side over IPC, so the trust boundary between "content we shipped" and
 * "content served to us" stops holding for that domain.
 *
 * Presence of a scope is deterministic, but how much it grants is not the same
 * question, so severity is graded per entry:
 *
 * - `enableTauriAPI: true` exposes the whole Tauri API surface to the domain.
 * - a non-empty `plugins` list exposes those plugins' commands.
 * - neither — the entry only names a domain and windows — still enables the
 *   mechanism, but grants no command surface through this setting alone. Whether
 *   that matters depends on what else the app exposes to those windows, which we
 *   cannot see from the config, so that case is heuristic.
 *
 * Each entry produces its own finding so the line number points at the specific
 * scope rather than at the array.
 *
 * Per the schema, `domain` and `windows` are required. A config missing them is
 * invalid and that is schema validation's business, not this rule's — this rule
 * reads defensively and never throws.
 */

const PATH: DocPath = ['tauri', 'security', 'dangerousRemoteDomainIpcAccess'];

const REFERENCES = [
  'https://v1.tauri.app/v1/api/config/#securityconfig.dangerousremotedomainipcaccess',
  'https://v2.tauri.app/security/capabilities/',
];

const WHY_BASE =
  'This grants a remote origin access to the IPC bridge. Tauri\'s security model assumes the ' +
  'webview runs content you shipped and the Rust side trusts it accordingly; a remote domain ' +
  'listed here is trusted the same way, so anyone who can control what that domain serves — ' +
  'its operator, an XSS on it, a compromised CDN or dependency it loads, or an attacker in a ' +
  'position to tamper with the response — can drive your application\'s backend.';

const WHY_FULL_API =
  `${WHY_BASE}\n\n` +
  '`enableTauriAPI: true` grants the full Tauri API surface to this origin rather than a ' +
  'selected subset, so the remote content reaches everything the API exposes.';

const WHY_PLUGINS =
  `${WHY_BASE}\n\n` +
  'The `plugins` list grants this origin the commands of those plugins. Their reach is whatever ' +
  'those plugins can do — for shell or fs plugins, that is command execution or file access.';

const WHY_MINIMAL =
  `${WHY_BASE}\n\n` +
  'This entry enables the mechanism without granting the Tauri API or any plugin through this ' +
  'setting, so on its own it hands over less than the other forms. It is reported as heuristic ' +
  'because the remaining risk depends on what the named windows expose by other means, which ' +
  'cannot be determined from the configuration alone.';

const RECOMMENDATION =
  'Remove the entry if the remote content does not need the backend at all — the common case is ' +
  'that a remote page is displayed rather than integrated.\n\n' +
  'If it is genuinely needed: pin `domain` to an exact host you control (not a parent domain ' +
  'that covers subdomains you do not), set `scheme` to `https` so the grant cannot be claimed ' +
  'over plain http, list the narrowest `windows` that need it, and drop `enableTauriAPI` in ' +
  'favour of naming only the plugins required.\n\n' +
  'To confirm the exposure: everything the listed windows can call is reachable by that origin. ' +
  'Review it as though the domain were hostile, because the grant survives the domain being ' +
  'compromised.\n\n' +
  'On v2 this was replaced by a capability\'s `remote.urls`, which scopes the grant to specific ' +
  'permissions rather than to the API as a whole.';

interface ScopeAssessment {
  severity: Severity;
  confidence: 'high' | 'heuristic';
  whyDangerous: string;
  detail: string;
}

function assessScope(scope: Record<string, unknown>): ScopeAssessment {
  if (isExplicitTrue(scope['enableTauriAPI'])) {
    return {
      severity: 'high',
      confidence: 'high',
      whyDangerous: WHY_FULL_API,
      detail: 'enableTauriAPI: true',
    };
  }

  const plugins = scope['plugins'];
  if (isNonEmptyStringArray(plugins)) {
    return {
      severity: 'high',
      confidence: 'high',
      whyDangerous: WHY_PLUGINS,
      detail: `plugins: [${plugins.map((name) => `"${name}"`).join(', ')}]`,
    };
  }

  return {
    severity: 'medium',
    confidence: 'heuristic',
    whyDangerous: WHY_MINIMAL,
    detail: 'no enableTauriAPI, no plugins',
  };
}

/** Describes the entry for the finding headline, tolerating a malformed shape. */
function describeScope(scope: Record<string, unknown>): string {
  const domain = typeof scope['domain'] === 'string' ? scope['domain'] : '(no domain)';
  const scheme = typeof scope['scheme'] === 'string' ? `${scope['scheme']}://` : '';
  const windows = Array.isArray(scope['windows'])
    ? scope['windows'].filter((w): w is string => typeof w === 'string')
    : [];
  const windowList = windows.length > 0 ? windows.join(', ') : '(no windows)';
  return `${scheme}${domain} -> windows [${windowList}]`;
}

export const TA_V1_002: ConfigRule = {
  id: 'TA-V1-002',
  kind: 'config',
  appliesTo: 'v1',
  severity: 'high',
  maxConfidence: 'high',
  evidence: 'synthetic-only',
  target: 'tauri.security.dangerousRemoteDomainIpcAccess',
  whyDangerous: WHY_BASE,
  recommendation: RECOMMENDATION,
  references: REFERENCES,
  check(context) {
    const value = readPath(context.config.value, PATH);

    // Absent and `[]` are both the default: the mechanism is off. Only an array
    // with entries grants anything.
    if (!Array.isArray(value)) return [];

    const findings: Finding[] = [];

    value.forEach((entry, index) => {
      // A non-object entry cannot grant access to anything; it is a malformed
      // config, which schema validation reports.
      if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) return;

      const scope = entry as Record<string, unknown>;
      const assessment = assessScope(scope);

      findings.push({
        ruleId: 'TA-V1-002',
        severity: assessment.severity,
        confidence: assessment.confidence,
        file: context.config.file,
        line: context.config.doc.lineOf([...PATH, index]),
        target: `tauri.security.dangerousRemoteDomainIpcAccess[${String(index)}]: ${describeScope(scope)} (${assessment.detail})`,
        whyDangerous: assessment.whyDangerous,
        recommendation: RECOMMENDATION,
        references: REFERENCES,
      });
    });

    return findings;
  },
};
