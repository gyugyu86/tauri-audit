# EcoPaste

| | |
| --- | --- |
| Source | https://github.com/EcoPasteHub/EcoPaste |
| Commit | `d710277d087d3858c66a69d5917a90d2633dfa02` (branch `master`) |
| Retrieved | 2026-07-19 |
| License | Apache-2.0 (see `LICENSE`) |
| Tauri | v2 |

Note: this project was previously published as `ayangweb/EcoPaste` and has since moved to
the `EcoPasteHub` organization. GitHub redirects the old path.

## Files copied

- `src-tauri/tauri.conf.json`
- `src-tauri/capabilities/default.json`
- `src-tauri/capabilities/macos-permissions.json`

**Unmodified.** No reformatting, key reordering, or content edits. Application source is not
copied — only configuration.

## Why this app

Carries **multiple capability files**, including a platform-scoped one. Exercises the code
path where capabilities must be merged across files rather than read from a single
`default.json`.
