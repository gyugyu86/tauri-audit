import { isExplicitTrue, readPath } from './shared/configField.js';

import type { DocPath } from '../parse/index.js';
import type { ConfigRule } from './types.js';

/**
 * TA-V1-001 — every v1 API is enabled at once.
 *
 * v1's allowlist is opt-in: each API family is off until listed. `all: true`
 * opts into all of them simultaneously, which is deterministic to detect and
 * carries no exemption condition — the APIs are reachable from the webview
 * either way.
 *
 * v1-only by construction: `allowlist` does not appear anywhere in the v2 schema,
 * where capabilities replaced it.
 */

const PATH: DocPath = ['tauri', 'allowlist', 'all'];

const WHY_DANGEROUS =
  "v1's allowlist is opt-in — each API family stays disabled until you list it, so the " +
  'allowlist is what limits an XSS in your frontend to the APIs you actually use. `all: true` ' +
  'opts into every family at once: filesystem, shell execution, process control, HTTP, clipboard ' +
  'and the rest. Injected script in the webview can then call any of them, so a content ' +
  'injection bug becomes arbitrary command execution rather than a contained frontend problem.';

const RECOMMENDATION =
  'Remove `all: true` and enable only the API families the app actually calls, then scope each ' +
  'one.\n\n' +
  'To confirm what you need: run the app with the allowlist narrowed and exercise its features — ' +
  'a disallowed call fails visibly rather than silently. Scope the families you keep (`fs.scope`, ' +
  '`shell.scope`, `http.scope`) rather than enabling them wholesale, since `fs: { all: true }` ' +
  'has the same problem at a smaller scale.\n\n' +
  'If you are planning a move to v2, this maps onto capabilities with per-command permissions, ' +
  'which makes the same narrowing explicit and reviewable.';

export const TA_V1_001: ConfigRule = {
  id: 'TA-V1-001',
  kind: 'config',
  appliesTo: 'v1',
  severity: 'high',
  // Trips tauri-apps/tauri examples/api, vendored in tests/corpus/true-positive/.
  evidence: 'real-world',
  target: 'tauri.allowlist.all',
  whyDangerous: WHY_DANGEROUS,
  recommendation: RECOMMENDATION,
  references: [
    'https://v1.tauri.app/v1/api/config/#allowlistconfig',
    'https://v2.tauri.app/start/migrate/from-tauri-1/',
  ],
  check(context) {
    // Only a literal `true` fires. An explicit `false`, an absent key, and an
    // absent `allowlist` object are all the safe default and must stay silent —
    // a rule keying on presence rather than value would fire on `all: false`,
    // which is the single most common way a correct v1 config is written.
    if (!isExplicitTrue(readPath(context.config.value, PATH))) return [];

    return [
      {
        ruleId: 'TA-V1-001',
        severity: 'high',
        confidence: 'high',
        file: context.config.file,
        line: context.config.doc.lineOf(PATH),
        target: 'tauri.allowlist.all: true',
        whyDangerous: WHY_DANGEROUS,
        recommendation: RECOMMENDATION,
        references: [
          'https://v1.tauri.app/v1/api/config/#allowlistconfig',
          'https://v2.tauri.app/start/migrate/from-tauri-1/',
        ],
      },
    ];
  },
};
