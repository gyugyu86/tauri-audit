# Tauri v1 example — helloworld

| | |
| --- | --- |
| Source | https://github.com/tauri-apps/tauri, `examples/helloworld/` |
| Commit | `0cfcd466095c10cd8801522070a5c59a43025751` (tag `tauri-v1.8.3`) |
| Retrieved | 2026-07-19 |
| License | MIT OR Apache-2.0 — MIT text retained in `LICENSE` |
| Tauri | v1 |

## Files copied

- `tauri.conf.json`

Note the path: this config sits at the example root, **not** under `src-tauri/`. The layout
is preserved as upstream has it.

**Unmodified.** No reformatting, key reordering, or content edits.

## Why this app

The v1 clean baseline, authored by the Tauri maintainers themselves — independent of this
project, and permissively licensed.

It is valuable specifically because it sets `"allowlist": { "all": false }`. An explicit
`false` is the single most important negative case for TA-V1-001: a rule that merely checks
for the presence of the `all` key, rather than its value, would fire here. It also carries a
real CSP (`default-src 'self'`) and no `dangerousRemoteDomainIpcAccess`.

Sourced from a pinned tag rather than a branch, because the repository's default branch has
long since moved to v2.
