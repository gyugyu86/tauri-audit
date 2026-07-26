# Tauri v1 example — api (expected to trip rules)

| | |
| --- | --- |
| Source | https://github.com/tauri-apps/tauri, `examples/api/` |
| Commit | `0cfcd466095c10cd8801522070a5c59a43025751` (tag `tauri-v1.8.3`) |
| Retrieved | 2026-07-19 |
| License | MIT OR Apache-2.0 — MIT text retained in `LICENSE` |
| Tauri | v1 |

## Files copied

- `src-tauri/tauri.conf.json`

**Unmodified.** No reformatting, key reordering, or content edits.

## Why this app is in `true-positive/`, not `clean/`

This is an **API demonstration app**: its whole purpose is to exercise every Tauri API in one
place, so it deliberately turns on things a shipping application would not. The config sets:

- `"allowlist": { "all": true }` — every v1 API enabled at once (TA-V1-001)
- a shell scope permitting `sh -c` and `cmd /C` with an argument validator of `\S+`, which
  accepts effectively any argument

Those settings are **correct for a demo and wrong for a product**, which makes this an ideal
true-positive case: the findings are real, and the app is real, but nothing here indicates a
defect in Tauri. A demo that enables every API is doing its job. What it demonstrates for
tauri-audit is that the rules fire on genuine configuration written by people who know the
framework — not only on fixtures we wrote ourselves.

It also pairs instructively with `clean/tauri-helloworld-v1`, which comes from the same
repository and the same commit and sets `"allowlist": { "all": false }`. Same authors, same
release, opposite verdict — the difference is the configuration, exactly as it should be.
