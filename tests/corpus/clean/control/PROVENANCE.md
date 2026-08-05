# Control

| | |
| --- | --- |
| Source | https://github.com/denizZz009/Control |
| Commit | `c08e538fbdeef36d67ff778778aa3712f565d0f9` (branch `main`) |
| Retrieved | 2026-08-06 |
| License | MIT (see `LICENSE`) |
| Tauri | v1 |

## Files copied

- `Cargo.lock`
- `Cargo.toml`
- `package-lock.json`
- `package.json`
- `src-tauri/Cargo.lock`
- `src-tauri/Cargo.toml`
- `src-tauri/tauri.conf.json`
- `tauri.conf.json`
- `vite.config.ts`

**Unmodified.** No reformatting, key reordering, or content edits. Application source is not
copied — only configuration.

## Why this app

fs scope spanning `$APPDATA`, `$RESOURCE` and `$TEMP` — three path variables at once, for TA-CAP-003 v1-side material.

Selected against `docs/CORPUS-SELECTION.md` before tauri-audit was run over it. Its
findings, whatever they turn out to be, are recorded in the corpus snapshot rather than
used to revisit this choice.
