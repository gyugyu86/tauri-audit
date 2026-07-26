import { extractEnvPrefix, secretsExposedBy } from './shared/envPrefix.js';

import type { Finding } from '../types.js';
import type { ProjectRule } from './types.js';

/**
 * TA-VITE-001 — a Vite `envPrefix` wide enough to inline Tauri signing secrets
 * (CVE-2023-46115).
 *
 * Severity is low and confidence is heuristic, and the two are low for different
 * reasons.
 *
 * Severity follows the GHSA label. The sources disagree sharply on this CVE —
 * GHSA rates it Low, NVD 5.5 Medium, and the CNA 8.4 High — so the finding cites
 * all three rather than presenting one as settled.
 *
 * Confidence is heuristic because matching the configuration is not the same as
 * proving a leak. A default production build does not embed the key; the
 * exposure needs a debug build whose frontend also references the variable. The
 * finding therefore reports a dangerous pattern and tells the reader how to
 * check their actual bundle, rather than asserting a leak has happened.
 */

const REFERENCES = [
  'https://github.com/tauri-apps/tauri/security/advisories/GHSA-2rcp-jvr4-r259',
  'https://nvd.nist.gov/vuln/detail/CVE-2023-46115',
  'https://vite.dev/config/shared-options.html#envprefix',
];

const SEVERITY_SOURCES =
  'Scoring sources disagree on this advisory: GHSA rates it Low, NVD 5.5 Medium ' +
  '(AV:L/AC:L/PR:L/UI:N/S:U/C:H/I:N/A:N), and the CNA 8.4 High (S:C/C:H/I:H). This finding ' +
  "follows the GHSA label, and lists the others so the disagreement is visible rather than " +
  'resolved silently on your behalf.';

function whyDangerous(prefix: string, exposed: readonly string[]): string {
  return (
    `Vite inlines every environment variable beginning with a configured prefix into the ` +
    `frontend bundle. The prefix \`${prefix}\` covers ${exposed.map((name) => `\`${name}\``).join(', ')}, ` +
    'which carry the private key used to sign application bundles and updates. A key that ' +
    'reaches shipped JavaScript can be extracted from it, and an attacker holding the update ' +
    'signing key can sign an update the application will accept as genuine.\n\n' +
    'This reports a configuration pattern, not a confirmed leak. A default production build ' +
    'does not embed the value; the exposure needs a debug build whose frontend also ' +
    "references the variable. That is why this is heuristic — the setting is real, the leak " +
    'has to be confirmed against your actual bundle.\n\n' +
    `${SEVERITY_SOURCES}`
  );
}

const RECOMMENDATION =
  'Narrow the prefix so it cannot cover signing variables.\n\n' +
  'To confirm whether anything actually leaked, search a built bundle rather than reasoning ' +
  'about the config:\n\n' +
  '    grep -r "TAURI_PRIVATE_KEY" dist/\n' +
  '    grep -r "TAURI_SIGNING_PRIVATE_KEY" dist/\n\n' +
  'If you need Tauri build metadata in the frontend, use `TAURI_ENV_` rather than `TAURI_`. ' +
  'Tauri sets `TAURI_ENV_PLATFORM`, `TAURI_ENV_ARCH`, `TAURI_ENV_DEBUG` and similar during a ' +
  'build; none of them carry secrets, and that prefix does not reach the signing variables.\n\n' +
  'Also rotate the signing key if a bundle containing it was ever distributed — narrowing ' +
  'the prefix protects future builds, not ones already shipped.';

export const TA_VITE_001: ProjectRule = {
  id: 'TA-VITE-001',
  kind: 'project',
  severity: 'low',
  maxConfidence: 'heuristic',
  evidence: 'synthetic-only',
  target: 'vite.config envPrefix covering Tauri signing variables',
  whyDangerous:
    'A Vite `envPrefix` wide enough to match Tauri signing variables can inline the update ' +
    'signing key into the frontend bundle.',
  recommendation: RECOMMENDATION,
  references: REFERENCES,
  check(context) {
    const findings: Finding[] = [];

    for (const viteConfig of context.project.viteConfigs) {
      const declaration = extractEnvPrefix(viteConfig.text);
      // No envPrefix, or one this scanner cannot read confidently (computed,
      // spread, template literal). Not analyzed is not the same as safe, but a
      // guess here would be a false positive on a config we cannot see into.
      if (declaration === undefined) continue;

      for (const prefix of declaration.prefixes) {
        const exposed = secretsExposedBy(prefix);
        if (exposed.length === 0) continue;

        findings.push({
          ruleId: 'TA-VITE-001',
          severity: 'low',
          confidence: 'heuristic',
          file: viteConfig.file,
          line: declaration.line,
          target: `envPrefix includes '${prefix}', which covers ${exposed.join(', ')}`,
          whyDangerous: whyDangerous(prefix, exposed),
          recommendation: RECOMMENDATION,
          references: REFERENCES,
        });
      }
    }

    return findings;
  },
};
