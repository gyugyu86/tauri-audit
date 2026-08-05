# openteams-lab/openteams (expected to trip rules)

| | |
| --- | --- |
| Source | https://github.com/openteams-lab/openteams |
| Commit | `3416049a2951ee305c86f34d57f6b2cf8c76d289` (branch `main`) |
| Retrieved | 2026-08-06 |
| License | Apache-2.0 (see `LICENSE`) |
| Tauri | v1 |

## Files copied

- `Cargo.lock`
- `Cargo.toml`
- `crates/db/Cargo.toml`
- `crates/deployment/Cargo.toml`
- `crates/executors/Cargo.toml`
- `crates/git/Cargo.toml`
- `crates/local-deployment/Cargo.toml`
- `crates/review/Cargo.toml`
- `crates/server/Cargo.toml`
- `crates/services/Cargo.toml`
- `crates/utils/Cargo.toml`
- `frontend/package-lock.json`
- `frontend/package.json`
- `frontend/vite.config.ts`
- `npx/openteams-cli-npx/package.json`
- `npx/openteams-npx/package.json`
- `npx/openteams-web-npx/package.json`
- `openteams-cli/package.json`
- `openteams-cli/packages/openteams-cli/package.json`
- `openteams-cli/packages/plugin/package.json`
- `openteams-cli/packages/script/package.json`
- `openteams-cli/packages/sdk/js/package.json`
- `openteams-cli/packages/util/package.json`
- `package-lock.json`
- `package.json`
- `pnpm-lock.yaml`
- `src-tauri/Cargo.lock`
- `src-tauri/Cargo.toml`
- `src-tauri/tauri.conf.json`
- `src-tauri/tauri.dev.conf.json`

**Unmodified.** No reformatting, key reordering, or content edits. Application source is not
copied — only configuration.

## Why this application is in `true-positive/`, and how it got there

It was selected for `clean/` against `docs/CORPUS-SELECTION.md`, vendored, and only then
analyzed — the order the method requires. `TA-V1-002` reported four high-confidence findings,
which is the outcome the corpus exists to produce, and the finding was judged correct rather
than the rule being weakened to keep the suite green.

`src-tauri/tauri.conf.json` grants IPC access, with the Tauri API enabled, to two origins:

```json
"dangerousRemoteDomainIpcAccess": [
  { "scheme": "http", "domain": "127.0.0.1", "windows": ["main"], "enableTauriAPI": true },
  { "scheme": "http", "domain": "localhost",  "windows": ["main"], "enableTauriAPI": true }
]
```

Three things make this a true positive rather than a rule that is too eager:

1. **It is the shipped configuration, not a development-only one.** The grant is in the base
   `tauri.conf.json`, which is what a release build reads. It is duplicated in
   `tauri.dev.conf.json`; were it a development convenience it would live only there.
2. **v1 matches the domain and ignores the port.** Allowing `localhost` therefore allows
   whatever is listening on *any* local port, so any local process that binds one is handed
   the IPC bridge.
3. **The scheme is `http`.** There is no origin authentication at all, so nothing
   distinguishes the intended local service from anything else answering on that name.

What bounds the impact, and is worth stating alongside the above: this application's
allowlist is small — `{"all": false, "dialog": {"open": true}, "shell": {"open": true}}` —
so "the Tauri API" here is two calls rather than the full surface. `withGlobalTauri` is
nonetheless `true`, and `shell.open` is reachable.

## This is not a claim that the application is unsafe

The directory name is this project's internal classification: it means the detection fired
correctly on configuration that really is there. Whether it is reachable, and whether the
authors consider the trade-off worth it, depends on the application's behaviour — which this
tool never examines, because it reads configuration and nothing else. A project that runs
local services may well have decided this deliberately.

Nothing here is a vulnerability report, and nothing in this repository says this application
is insecure. Tauri's own `examples/api` sits in the same directory for the same reason.

## Upstream notification

Not filed. This paragraph is updated with a link if and when it is, rather than describing
it as done in advance.

## Original selection rationale

Apache-2.0, actively developed. Carries two `dangerousRemoteDomainIpcAccess` entries — the first real-world material for TA-V1-002.

Selected against `docs/CORPUS-SELECTION.md` before tauri-audit was run over it. Its
findings, whatever they turn out to be, are recorded in the corpus snapshot rather than
used to revisit this choice.
