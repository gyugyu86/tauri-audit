# Yaak

| | |
| --- | --- |
| Source | https://github.com/mountain-loop/yaak |
| Commit | `0c24d6562afcb174363e7bc58182fcf123389d01` (branch `main`) |
| Retrieved | 2026-07-19 |
| License | MIT (see `LICENSE`) |
| Tauri | v2 |

## Files copied

- `crates-tauri/yaak-app-client/tauri.conf.json`
- `crates-tauri/yaak-app-client/capabilities/default.json`
- `crates-tauri/yaak-app-proxy/tauri.conf.json`
- `crates-tauri/yaak-app-proxy/capabilities/default.json`

The upstream directory layout is preserved exactly, because the layout is the point (below).

**Unmodified.** No reformatting, key reordering, or content edits. Application source is not
copied — only configuration.

## Why this app

**Two Tauri apps in one repository, and no `src-tauri/` directory at all.** This is the
structural case that breaks discovery implementations which assume the conventional layout:
anchoring the search to `src-tauri/` finds nothing here, and reporting only the first config
found would silently ignore the second app.
