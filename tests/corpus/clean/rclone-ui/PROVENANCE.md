# rclone-ui/rclone-ui

| | |
| --- | --- |
| Source | https://github.com/rclone-ui/rclone-ui |
| Commit | `c02acfbf9b5e17d49c88108f2099c598f91e92e0` |
| Retrieved | 2026-07-26 |
| License | Apache-2.0 — verified by reading `LICENSE` in the repository, not a badge |
| Tauri | v2 |

## Files copied

- `src-tauri/tauri.conf.json`
- `src-tauri/capabilities/default.json`
- `src-tauri/Cargo.toml`
- `package.json`, `vite.config.ts`, `package-lock.json`

**Unmodified.** No reformatting, key reordering, or content edits. Only configuration was
copied; no application source.

## Why this application is in the corpus

Selected under `docs/CORPUS-SELECTION.md` before tauri-audit was run against it.

Its capability is by far the largest here — **164 string-form and 8 object-form permission
entries** — which walks the `PermissionEntry` `anyOf` with data nobody wrote for this
repository. Mixed-form capabilities were previously exercised only by fixtures.

It is also a genuine breadth case worth keeping visible: several of its filesystem
permissions are scoped to `*/**`. TA-CAP-003 does not report that pattern, because the
enumerated list covers `**`, `/**` and variable-anchored recursion but not a leading bare
`*` segment. That is an accepted false negative under this project's stated preference for
missing findings over inventing them, and this application is the reason it is documented
rather than theoretical.
