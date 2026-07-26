import { isExplicitTrue, readPath } from './shared/configField.js';

import type { DocPath } from '../parse/index.js';
import type { ConfigRule } from './types.js';

/**
 * TA-V1-003 — the webview is served over http:// on Windows.
 *
 * A deterministic flag with no exemption condition: `true` means the custom
 * protocol is served as `http://<scheme>.localhost` instead of
 * `https://<scheme>.localhost`, and that is true of the build regardless of
 * anything else in the config.
 *
 * Severity is medium rather than high because exploiting it requires local
 * network position — it widens the attack surface rather than opening a hole by
 * itself. Confidence is high because the setting's effect is not conditional.
 *
 * v1-only: v2 replaced this with `app.windows[].useHttpsScheme`, whose sense is
 * inverted, so a v2 config can never contain this key.
 */

const PATH: DocPath = ['tauri', 'security', 'dangerousUseHttpScheme'];

const WHY_DANGEROUS =
  'This serves the webview over `http://<scheme>.localhost` instead of the https equivalent. ' +
  'The page is then a non-secure context, so the browser stops treating mixed content as an ' +
  'error: the app can load scripts over plain http without complaint, and anything on the ' +
  'machine or the local network that can answer those requests can inject code into the ' +
  'webview. In a Tauri app that injected code reaches whatever IPC commands the webview may ' +
  'call. It also disables the browser APIs that are restricted to secure contexts.\n\n' +
  'The setting exists for local development against a plain-http dev server, and is named ' +
  '`dangerous` because it is not meant to survive into a release build.';

const RECOMMENDATION =
  'Remove this from the configuration you ship.\n\n' +
  'If a plain-http dev server is why it is here, move it into a development-only config ' +
  '(`tauri.conf.json` overlays, or the config passed with `--config` during `tauri dev`) so it ' +
  'cannot reach a release build. To confirm the release build is unaffected, check the config ' +
  'that `tauri build` actually consumes rather than the one used for `tauri dev`.\n\n' +
  'On v2 this became `app.windows[].useHttpsScheme`, with the opposite sense: set it to `true` ' +
  'rather than removing a flag.';

export const TA_V1_003: ConfigRule = {
  id: 'TA-V1-003',
  kind: 'config',
  appliesTo: 'v1',
  severity: 'medium',
  evidence: 'synthetic-only',
  target: 'tauri.security.dangerousUseHttpScheme',
  whyDangerous: WHY_DANGEROUS,
  recommendation: RECOMMENDATION,
  references: [
    'https://v1.tauri.app/v1/api/config/#securityconfig.dangeroususehttpscheme',
    'https://v2.tauri.app/start/migrate/from-tauri-1/',
  ],
  check(context) {
    if (!isExplicitTrue(readPath(context.config.value, PATH))) return [];

    return [
      {
        ruleId: 'TA-V1-003',
        severity: 'medium',
        confidence: 'high',
        file: context.config.file,
        line: context.config.doc.lineOf(PATH),
        target: 'tauri.security.dangerousUseHttpScheme: true',
        whyDangerous: WHY_DANGEROUS,
        recommendation: RECOMMENDATION,
        references: [
          'https://v1.tauri.app/v1/api/config/#securityconfig.dangeroususehttpscheme',
          'https://v2.tauri.app/start/migrate/from-tauri-1/',
        ],
      },
    ];
  },
};
