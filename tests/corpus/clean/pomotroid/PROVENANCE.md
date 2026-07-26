# Splode/pomotroid

| | |
| --- | --- |
| Source | https://github.com/Splode/pomotroid |
| Commit | `f9f0b266f7a04b895599ca660544219c0d0df054` |
| Retrieved | 2026-07-26 |
| License | MIT — verified by reading `LICENSE` in the repository, not a badge |
| Tauri | v2 |

## Files copied

- `src-tauri/tauri.conf.json`
- `src-tauri/capabilities/default.json`
- `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`
- `package.json`, `vite.config.js`

**Unmodified.** No reformatting, key reordering, or content edits. Only configuration was
copied; no application source.

## Why this application is in the corpus

Selected under `docs/CORPUS-SELECTION.md` before tauri-audit was run against it.

Closes the largest negative-evidence gap in the corpus: **a v2 application that sets a CSP
correctly**. Every other v2 application here ships `csp: null`, so before this there was no
real application on which TA-CONF-001 legitimately stayed silent. It does stay silent here,
which is the point.

Its capability uses 21 string-form permission entries and no object form, which is the
common shape and a useful contrast with rclone-ui.
