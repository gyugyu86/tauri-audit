# Razee4315/Paperling

| | |
| --- | --- |
| Source | https://github.com/Razee4315/Paperling |
| Commit | `30752314fd91f4f4dcc95cbeff50bb19e676f6b0` |
| Retrieved | 2026-07-26 |
| License | Apache-2.0 — verified by reading `LICENSE` in the repository, not a badge |
| Tauri | v2 |

## Files copied

- `src-tauri/tauri.conf.json`
- `src-tauri/capabilities/default.json`, `src-tauri/capabilities/desktop.json`
- `src-tauri/Cargo.toml`
- `package.json`, `vite.config.ts`

**Unmodified.** No reformatting, key reordering, or content edits. Only configuration was
copied; no application source.

## Why this application is in the corpus

Selected under `docs/CORPUS-SELECTION.md` before tauri-audit was run against it.

It contributes two things the corpus lacked. It sets a CSP, so TA-CONF-001 stays silent on a
second real v2 application. And it declares `fs:scope` over `**`, which is the first
real-world case TA-CAP-003 reports on — the rule previously had fixture evidence only.

That finding is `medium`/`heuristic` and does not gate. A document application plausibly
does need broad filesystem access, and whether this scope is wider than the feature requires
is a judgement its authors are positioned to make and this tool is not. The finding says
what the configuration grants; it does not assert the application is vulnerable.

Two capability files, which also exercises merging permissions across files.

## Deliberately not copied

No lockfile: the repository does not carry `package-lock.json` at the root.
