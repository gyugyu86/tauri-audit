# praises

| | |
| --- | --- |
| Source | https://github.com/ElmTran/praises |
| Commit | `7106e9bef993553e57a5f32ed0ba7363d1918b59` (branch `master`) |
| Retrieved | 2026-08-06 |
| License | MIT (see `LICENSE`) |
| Tauri | v1 |

## Files copied

- `package.json`
- `pnpm-lock.yaml`
- `src-tauri/Cargo.lock`
- `src-tauri/Cargo.toml`
- `src-tauri/tauri.conf.json`
- `vite.config.ts`

**Unmodified.** No reformatting, key reordering, or content edits. Application source is not
copied — only configuration.

## Why this app

Eleven allowlist families with `all: false`, a shell `open` set to a regex rather than a boolean, and an fs scope anchored at `$APPCONFIG`/`$APPCACHE`.

Selected against `docs/CORPUS-SELECTION.md` before tauri-audit was run over it. Its
findings, whatever they turn out to be, are recorded in the corpus snapshot rather than
used to revisit this choice.
