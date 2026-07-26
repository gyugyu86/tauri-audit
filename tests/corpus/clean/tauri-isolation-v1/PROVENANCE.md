# Tauri v1 example — isolation

| | |
| --- | --- |
| Source | https://github.com/tauri-apps/tauri, `examples/isolation/` |
| Commit | `0cfcd466095c10cd8801522070a5c59a43025751` (tag `tauri-v1.8.3`) |
| Retrieved | 2026-07-19 |
| License | MIT OR Apache-2.0 — MIT text retained in `LICENSE` |
| Tauri | v1 |

## Files copied

- `tauri.conf.json`

Sits at the example root, not under `src-tauri/`. Layout preserved as upstream has it.

**Unmodified.** No reformatting, key reordering, or content edits.

## Why this app

Uses the **isolation pattern** (`pattern.use: "isolation"`), which Tauri documents as the
security-hardened option. It gives the corpus a v1 config that is configured defensively
rather than merely minimally, so rules about the isolation pattern have a real negative case.

Sourced from a pinned tag rather than a branch, because the repository's default branch has
long since moved to v2.
