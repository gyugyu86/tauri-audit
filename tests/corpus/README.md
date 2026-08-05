# Corpus

Real, unmodified configuration files from real Tauri apps. These exist to answer one
question that synthetic fixtures cannot: **would tauri-audit break this project's CI?**

## Why real apps, and why not self-authored ones

Fixtures under `tests/fixtures/` are written by the same person who writes the rules, so a
"correct" fixture naturally avoids the patterns that person's rules look for. That makes
self-authored clean configs self-fulfilling and near-worthless as false-positive evidence.
The corpus is independent: nobody here wrote these configs with our rules in mind.

## The two groups are not interchangeable

| Directory | Meaning |
| --- | --- |
| `clean/` | Apps meeting the selection criteria. Must produce **zero gating findings**. |
| `true-positive/` | Apps that legitimately trip rules. Findings here are expected and correct. |

Keeping them apart is what keeps the FP=0 assertion meaningful — if an app that genuinely
trips a rule sat in `clean/`, we would be forced to weaken the rule to keep the suite green.

## What "clean" means

**`clean/` means zero HIGH-CONFIDENCE findings, not zero findings.** The gate predicate is
`confidence === 'high' && severity ∈ {critical, high}` — character for character the same
predicate as the CI exit-code gate, so "clean" has exactly one definition in this repo.

`heuristic` findings on `clean/` apps are **normal and expected**, not failures. Surrealist
ships `"csp": null`, which TA-CONF-001 reports at `medium`/`heuristic`; that is a correct
observation about a real trade-off, not a false positive. Those findings are captured in a
snapshot so that any *change* to them gets human review, while their mere existence never
fails the build.

## What the corpus covers

Selected under `docs/CORPUS-SELECTION.md`, which was fixed and committed before any
application was chosen and before the tool was run against any of them.

| Application | License | Tauri | What it contributes |
| --- | --- | --- | --- |
| Splode/pomotroid | MIT | v2 | a v2 app that **sets a CSP** — TA-CONF-001 correctly silent |
| currycan/HaTickets | Apache-2.0 | **v1** | third-party v1, CSP set, no `allowlist.all` — all v1 rules correctly silent; monorepo layout |
| j1king/grovr | MIT | v2 | the only app found configuring `plugins.shell` (`open: true`) — CVE-2025-31477's exemption on real code; `pnpm-lock.yaml` |
| rclone-ui/rclone-ui | Apache-2.0 | v2 | 164 string + 8 object permission entries — the `PermissionEntry` `anyOf` on real data |
| Razee4315/Paperling | Apache-2.0 | v2 | `fs:scope` over `**` — TA-CAP-003's first real-world case; two capability files |
| surrealdb/surrealist | MIT | v2 | tightly enumerated permissions |
| EcoPasteHub/EcoPaste | Apache-2.0 | v2 | multiple capability files, one platform-scoped |
| mountain-loop/yaak | MIT | v2 | two apps in one repo, no `src-tauri/`; `$APPDATA/**` fs scope |
| tauri-apps/tauri examples | MIT/Apache-2.0 | v1 | `helloworld` (explicit `allowlist.all: false`) and `isolation` |

Two negative results are worth as much as the positive ones. yaak's `fs:scope` over
`$APPDATA/**` is a recursive wildcard that a naive breadth rule would flag, and TA-CAP-003
correctly does not. KiwiTalk's v1-era `envPrefix` lists `TAURI_PLATFORM`, `TAURI_ARCH` and
similar, and TA-VITE-001 correctly does not — a substring match on `TAURI_` would have.

### An honest exit 2

`clean/tauri-helloworld-v1` and `clean/tauri-isolation-v1` exit 2, not 0. They carry a
`tauri.conf.json` and no `Cargo.toml` — upstream keeps their Rust manifests elsewhere — so
the dependency rules examined nothing, and the run says so instead of reporting a clean
result. That is the intended behaviour, and their coverage snapshots record it.

They stay in `clean/` because the classification is about findings, not about how completely
the analysis could run: neither produces a gating finding, which is what `clean/` asserts.

### Gaps that remain

The August 2026 expansion closed several of these — `TA-V1-002` and `TA-V1-003` now have
third-party material, and the filesystem variables `$APPCONFIG`, `$APPCACHE`, `$RESOURCE`
and `$TEMP` all appear. What is still missing, after screening 278 repositories carrying a
Tauri configuration:

- **A v2 application that sets a CSP.** Every v2 application in the corpus ships
  `csp: null`. This is the most valuable gap remaining, because it is the negative
  evidence: there is no real application in which `TA-CONF-001` legitimately stays silent,
  so the corpus cannot show the rule being quiet when it should be. Its absence is also a
  finding in itself — shipping without a CSP appears to be the norm rather than the
  exception, which is why the rule is `heuristic`.
- **A capability mixing string and object permission entries.** The `PermissionEntry`
  `anyOf` is still walked only by fixtures written here.
- **TA-CONF-002** (`dangerousDisableAssetCspModification`) — no permissively licensed
  application setting it was found. Fixtures only.
- **TA-DEP-001 firing.** grovr exercises the exemption, but no corpus application both
  depends on an affected shell plugin version *and* leaves `open` unset.
- **`deny` alongside `allow`** in a filesystem scope.

These are recorded rather than filled. Filling them would mean either weakening the
selection criteria or writing the evidence ourselves, and an absence of real-world material
is itself an honest result — one worth more than a corpus quietly shaped until every rule
had something to point at.

## Provenance and licensing

Each app directory carries its own `PROVENANCE.md` (source URL, commit SHA, exact files
copied, license) and the upstream `LICENSE`. **Nothing is modified** — no reformatting, no
key reordering.

Only configuration files are copied; application source is not. Every app here is under a
permissive license (MIT or Apache-2.0). Copyleft-licensed projects are deliberately not
vendored, so this repository contains no GPL-licensed bytes and stays clean under automated
license scanning.

These files are test data. They are not part of the published npm package, which ships
`dist/`, `schemas/` and `advisories/` only.
