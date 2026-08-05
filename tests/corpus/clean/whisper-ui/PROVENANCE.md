# whisper-ui

| | |
| --- | --- |
| Source | https://github.com/bits-by-brandon/whisper-ui |
| Commit | `6b9404b0274f4691576434254e0480d7efa9dcd5` (branch `main`) |
| Retrieved | 2026-08-06 |
| License | MIT (see `LICENSE`) |
| Tauri | v1 |

## Files copied

- `package.json`
- `src-tauri/Cargo.lock`
- `src-tauri/Cargo.toml`
- `src-tauri/tauri.conf.json`
- `vite.config.js`
- `yarn.lock`

**Unmodified.** No reformatting, key reordering, or content edits. Application source is not
copied — only configuration.

## Why this app

Shell configured for a sidecar with an explicit scope entry, and an fs scope over `$RESOURCE`/`$APPCACHE` — shapes no fixture covers.

Selected against `docs/CORPUS-SELECTION.md` before tauri-audit was run over it. Its
findings, whatever they turn out to be, are recorded in the corpus snapshot rather than
used to revisit this choice.
