# Where the project stands

A record, not a summary for readers — figures here are measured, and anything unresolved is
listed rather than left out. Update it when a release ships, and keep the older entries.

## 0.1.0 — 2026-08-06

### What is published

| | |
| --- | --- |
| npm | [`tauri-audit@0.1.0`](https://www.npmjs.com/package/tauri-audit), dist-tag `latest`, MIT |
| Repository | <https://github.com/gyugyu86/tauri-audit>, public |
| Tag | `v0.1.0` → commit `8fbcaf5` |
| Release | <https://github.com/gyugyu86/tauri-audit/releases/tag/v0.1.0> |
| Action | `uses: gyugyu86/tauri-audit@v0.1.0` (composite; runs `npx tauri-audit@<version>`) |
| Code scanning | self-scan workflow publishes SARIF for `tests/fixtures/vulnerable` |

### Scope of the analysis

Configuration only. No frontend or Rust source is parsed, nothing is executed, and no
network access happens anywhere in the analysis path. Phases 2 and 3 below are what would
change that.

### Rules

Eight rule IDs, ten rule objects — `TA-CONF-001` and `TA-CONF-002` each carry a v1 and a v2
variant that differ only in the configuration path they read.

`TA-CONF-001`, `TA-CONF-002`, `TA-V1-001`, `TA-V1-002`, `TA-V1-003`, `TA-CAP-003`,
`TA-DEP-001`, `TA-VITE-001`.

Three declare `real-world` evidence — they fire on unmodified third-party configuration in
the corpus. The other seven are `synthetic-only`: the settings they look for are rare in
shipped code, which is the point of them being dangerous.

### Corpus

| | Apps | v1 | v2 | Partially analyzed | Findings | Gating |
| --- | --- | --- | --- | --- | --- | --- |
| `clean/` | 19 | 12 | 7 | 2 | 23 | **0** |
| `true-positive/` | 6 | 6 | 0 | 0 | 17 | 9 |

Of the nineteen in `clean/`, seventeen are third-party and two are Tauri's own v1 examples.
Those two are the partially analyzed pair: they carry a `tauri.conf.json` and no
`Cargo.toml`, so the dependency rules inspect nothing and their runs exit `2` rather than
`0`. That distinction is stated wherever the corpus result is claimed, because "no gating
findings" and "fully analyzed" are different facts.

Gating means high-confidence `critical` or `high` — the same predicate as the CI exit code,
imported from `core/gate.ts` rather than restated.

Applications are selected on licensing and provenance only, never on what a rule would say
about them; `docs/CORPUS-SELECTION.md` records why, including the occasion when that was
violated and had to be undone.

### Tests

506 tests across 21 files, 505 passing and 1 skipped, in roughly two seconds. Offline.
`npm test` pins `--update=none`, so snapshots are never written or tolerated as obsolete on
any machine.

## Open, as of this release

### Issues

- [#1](https://github.com/gyugyu86/tauri-audit/issues/1) — `TA-V1-002` grades an entry on
  `enableTauriAPI` alone and ignores how large the allowlist actually is. Deferred: openteams
  is the only real-world material, and tuning a severity model to one sample is overfitting.
- [#2](https://github.com/gyugyu86/tauri-audit/issues/2) — `TA-CONF-001` fires on 19 of 22
  applications measured. Not a false positive and it never gates, but a rule that is on
  almost always carries little information. Deferred to Phase 2.
- [#3](https://github.com/gyugyu86/tauri-audit/issues/3) — the README inside the npm 0.1.0
  tarball documents the action as `@v0`, a ref that does not exist. Fixed in the repository;
  npm cannot be corrected without shipping 0.1.1.

### Coverage with no real-world material

Found by screening 278 repositories carrying a Tauri configuration:

- **A v2 application that sets a CSP.** Every v2 application in the corpus ships `csp: null`,
  so there is no real application in which `TA-CONF-001` legitimately stays silent. Its
  absence is also a result: shipping without a policy appears to be the norm.
- **A capability mixing string and object permission entries**, to walk the `PermissionEntry`
  `anyOf` with data nobody wrote here.
- **An application configuring `plugins.shell`**, which is why `TA-DEP-001`'s exemption paths
  remain `synthetic-only`.
- **A `deny` list alongside `allow`** in a filesystem scope.

### Upstream notification

`kiwitalk` was notified — [KiwiTalk/KiwiTalk#2415](https://github.com/KiwiTalk/KiwiTalk/issues/2415),
filed 2026-07-28 after this repository was public so the links in it resolve.

`openteams`, `ace-v3`, `luwav` and `recoverymagic` have **not** been notified, neither that
their configuration is vendored here nor that a rule fired on it. Whether to do so is
undecided. Each `PROVENANCE.md` says so plainly rather than describing a notice as sent.

## Next

- **Phase 2** — JavaScript/TypeScript AST rules (`invoke`, `shell.open`), porting the AST
  work from electron-audit. Issues #1 and #2 are held for this phase.
- **Phase 3** — Rust analysis via tree-sitter, single-function-scope dataflow, `heuristic`
  only, and only once the zero-false-positive result is confirmed to survive it.
- **Ongoing** — keep `advisories/tauri-advisories.json` in sync with GHSA and RustSec.
