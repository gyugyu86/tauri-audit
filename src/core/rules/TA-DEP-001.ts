import {
  confidenceFor,
  describeSeveritySources,
  loadAdvisories,
  matchDependency,
} from '../advisories.js';
import { assessShellOpen } from './shared/shellOpenExemption.js';

import type { Finding } from '../types.js';
import type { ProjectRule } from './types.js';

/**
 * TA-DEP-001 — shell plugin `open` accepts arbitrary protocols
 * (CVE-2025-31477 / GHSA-c9pr-q8gx-3mgp).
 *
 * Three conditions have to hold together, and the rule reports only when none of
 * the published exemptions can be confirmed:
 *
 * 1. `tauri-plugin-shell` or `@tauri-apps/plugin-shell` at 2.2.0 or earlier.
 * 2. `plugins.shell.open` not written down — the affected state is the *unset*
 *    one, because the broken default validation is what an unset value selects.
 * 3. A capability granting `shell:default` or `shell:allow-open`, without which
 *    the endpoint cannot be called at all.
 *
 * Confidence is fixed at heuristic through the advisory database's
 * `suggestedConfidence`, because the advisory carries exemptions. It is never
 * promoted, even when all three conditions look satisfied.
 *
 * Suppressing a finding is the dangerous direction here, so exemptions only
 * apply when positively confirmed. An unreadable capability, an unanalyzable
 * config, or a project whose files could not be fully enumerated all leave the
 * finding in place, and the message says which check could not be completed.
 */

const ADVISORY_ID = 'GHSA-c9pr-q8gx-3mgp';

const SHELL_PACKAGES = new Set(['tauri-plugin-shell', '@tauri-apps/plugin-shell']);

export const TA_DEP_001: ProjectRule = {
  id: 'TA-DEP-001',
  kind: 'project',
  severity: 'high',
  maxConfidence: 'heuristic',
  evidence: 'synthetic-only',
  target: 'tauri-plugin-shell / @tauri-apps/plugin-shell <= 2.2.0 with an unset open scope',
  whyDangerous:
    "The shell plugin's open endpoint did not enforce its protocol restriction, so a value " +
    'reaching it could open file://, smb:// and similar and execute code through the system ' +
    'handler.',
  recommendation:
    'Upgrade the shell plugin to 2.2.1 or later, or migrate to tauri-plugin-opener.',
  references: [
    'https://github.com/tauri-apps/plugins-workspace/security/advisories/GHSA-c9pr-q8gx-3mgp',
    'https://osv.dev/vulnerability/GHSA-c9pr-q8gx-3mgp',
    'https://nvd.nist.gov/vuln/detail/CVE-2025-31477',
    'https://v2.tauri.app/plugin/opener/',
  ],
  check(context) {
    // A failed database load is reported as a coverage loss by buildProjectContext,
    // so an empty list here already carries a visible warning and exit 2.
    const advisory = loadAdvisories().database.advisories.find(
      (entry) => entry.id === ADVISORY_ID,
    );
    if (advisory === undefined) return [];

    const dependencies = [
      ...context.project.npmDependencies.values(),
      ...context.project.cargoDependencies.values(),
    ].filter((dependency) => SHELL_PACKAGES.has(dependency.name));

    const matches = dependencies
      .flatMap((dependency) => matchDependency(dependency, [advisory]))
      .filter((match) => match.advisory.id === ADVISORY_ID);

    if (matches.length === 0) return [];

    // Conditions 2 and 3 are project-wide, so they are evaluated once rather
    // than per matched package.
    const assessment = assessShellOpen(context.project);
    if (assessment.exempt) return [];

    const findings: Finding[] = [];

    for (const match of matches) {
      const versionStatement =
        match.certainty === 'resolved'
          ? `${match.dependency.name} ${match.dependency.value} (from a lockfile) is within the affected range ${match.range}`
          : `${match.dependency.name} is declared as ${match.dependency.value} in a manifest, a range that permits the affected ${match.range}. The installed version is unknown — no lockfile was read, so this is possible rather than confirmed`;

      findings.push({
        ruleId: 'TA-DEP-001',
        severity: advisory.severity,
        confidence: confidenceFor(match),
        file: match.dependency.origin,
        line: 1,
        target: `${match.dependency.name} ${match.dependency.value} — shell open scope not enforced (${match.certainty})`,
        whyDangerous:
          `${advisory.summary}\n\n` +
          'The endpoint was meant to restrict opening to protocols like https and mailto. ' +
          'Because that restriction did not work, a value reaching it could name file://, ' +
          'smb:// or nfs:// and be handed to the system protocol handler, which is remote code ' +
          'execution when any of that input is attacker-influenced.\n\n' +
          `Version: ${versionStatement}.\n\n` +
          'Exemptions checked, none of which could be confirmed:\n' +
          `  - Plugin configuration: ${assessment.configExemption.detail}.\n` +
          `  - Reachability: ${assessment.reachability.detail}.\n\n` +
          'Note the polarity: an unset `plugins.shell.open` is the affected state, not the safe ' +
          'one. The advisory says an explicit value is what makes an application safe, because ' +
          'the default the unset value selects is the part that was broken.\n\n' +
          `${describeSeveritySources(advisory)}`,
        recommendation:
          'Upgrade the shell plugin to 2.2.1 or later. That release distinguishes an unset scope ' +
          'from a deliberately disabled one, which is the actual fix.\n\n' +
          'If you cannot upgrade immediately, any one of these removes the exposure:\n' +
          '  - Set the scope explicitly, which restores the intended restriction:\n' +
          '        "plugins": { "shell": { "open": true } }\n' +
          '    This allows only mailto, http and https links.\n' +
          '  - Disable it with a regex that matches nothing, such as "tauri^".\n' +
          '  - Remove `shell:default` and every `shell:allow-open` from your capabilities, if ' +
          'the frontend does not need to open anything.\n\n' +
          'Prefer migrating to tauri-plugin-opener regardless: shell `open` was deprecated in ' +
          '2.1.0 in favour of it.\n\n' +
          'To confirm whether you are actually reachable, search the frontend for calls to the ' +
          'endpoint and check whether any argument derives from input you do not control.',
        references: [
          ...advisory.references,
          'https://nvd.nist.gov/vuln/detail/CVE-2025-31477',
        ],
      });
    }

    return findings;
  },
};
