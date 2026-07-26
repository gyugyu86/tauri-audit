# currycan/HaTickets

| | |
| --- | --- |
| Source | https://github.com/currycan/HaTickets |
| Commit | `4dc8e639b30033ff04a34d6820be624996cfcce5` |
| Retrieved | 2026-07-26 |
| License | Apache-2.0 — verified by reading `LICENSE` in the repository, not a badge |
| Tauri | v1 |

## Files copied

- `desktop/src-tauri/tauri.conf.json`
- `desktop/src-tauri/Cargo.toml`
- `desktop/package.json`

**Unmodified.** No reformatting, key reordering, or content edits. Only configuration was
copied; no application source.

## Why this application is in the corpus

Selected under `docs/CORPUS-SELECTION.md` before tauri-audit was run against it.

One of only two **third-party v1 applications** in the corpus, and the one that is clean.
Before this expansion every v1 configuration came from Tauri's own examples, so the v1 rules
had no independent evidence at all.

It sets a CSP and does not set `allowlist.all`, so the v1 rules correctly stay silent —
negative evidence for TA-V1-001 and TA-CONF-001 from code nobody here wrote.

The layout is a monorepo with the application under `desktop/`, which exercises discovery
against a structure that is neither `src-tauri/` at the root nor the yaak multi-app shape.

## Deliberately not copied

No lockfile: the repository does not carry one at `desktop/`. No `vite.config`: none exists
at that path.
