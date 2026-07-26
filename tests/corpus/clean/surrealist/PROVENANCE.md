# Surrealist

| | |
| --- | --- |
| Source | https://github.com/surrealdb/surrealist |
| Commit | `a0f4480f99f04b49808b15208819eeee70c07b40` (branch `main`) |
| Retrieved | 2026-07-19 |
| License | MIT (see `LICENSE`) |
| Tauri | v2 |

## Files copied

- `src-tauri/tauri.conf.json`
- `src-tauri/capabilities/surrealist.json`

**Unmodified.** No reformatting, key reordering, or content edits. Application source is not
copied — only configuration.

## Why this app

A real, actively maintained v2 app with tightly enumerated capability permissions — the
closest thing in the corpus to a textbook-correct v2 configuration.

## Expected findings

Ships `"csp": null`. That is expected to surface as a `medium`/`heuristic` finding
(TA-CONF-001) and is **not** a false positive: it is a real trade-off this project made.
`clean/` requires zero *gating* (high-confidence critical/high) findings, not zero findings.
