/**
 * Every user-facing CLI string lives here.
 *
 * Do NOT import this module from `core/`. The engine owns its own error text so
 * it stays usable without the CLI layer.
 *
 * English only, by design: finding text is not translated (see README).
 */

export const messages = {
  cliDescription:
    'Static security analyzer for Tauri v2/v1 apps. Parses config and source without running the app.',
  argTargetPath: 'path to the Tauri project to analyze',
  optJson: 'output findings as JSON',
  optMarkdown: 'output findings as Markdown',
  optSarif: 'output findings as SARIF 2.1.0',
  optCategory: 'SARIF category (run.automationDetails.id)',
  optStrict: 'also fail on heuristic critical/high findings',
  optNoFail: 'do not fail on findings (operational errors still exit 2)',
  optVersion: 'output the version number',

  notADirectory: (target: string): string => `not a directory: ${target}`,
  noTauriProject: (target: string): string =>
    `no Tauri configuration found under ${target}. ` +
    'Looked for tauri.conf.json, tauri.conf.json5, Tauri.toml and capabilities/*.json.',
  incompleteAnalysis:
    'the analysis did not fully cover this project (see the warnings above), so a result of ' +
    'zero findings does not mean this project is clean. Exiting 2.',
  noRulesYet:
    'No rules are implemented yet (scaffolding stage). Discovery, parsing and reporting are wired; ' +
    'detection rules land next.',
} as const;
