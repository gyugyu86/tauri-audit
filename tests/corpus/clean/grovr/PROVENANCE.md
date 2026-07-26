# j1king/grovr

| | |
| --- | --- |
| Source | https://github.com/j1king/grovr |
| Commit | `178abcc904c9c785049a343621e41a14a3843469` |
| Retrieved | 2026-07-26 |
| License | MIT — verified by reading `LICENSE` in the repository, not a badge |
| Tauri | v2 |

## Files copied

- `src-tauri/tauri.conf.json`
- `src-tauri/capabilities/default.json`
- `src-tauri/Cargo.toml`
- `package.json`, `vite.config.ts`, `pnpm-lock.yaml`

**Unmodified.** No reformatting, key reordering, or content edits. Only configuration was
copied; no application source.

## Why this application is in the corpus

Selected under `docs/CORPUS-SELECTION.md` before tauri-audit was run against it.

The only application found that **configures `plugins.shell`**, which is what CVE-2025-31477's
exemption turns on. It sets `"open": true` — the documented workaround — while its capability
grants `shell:default`.

That combination is real-world proof the exemption path works: removing `open` from a copy of
this configuration makes TA-DEP-001 fire, and restoring it silences the rule again. Verified
by hand during the expansion.

Also carries a `pnpm-lock.yaml`, which exercises the pnpm resolution path against real data
rather than a fixture.
