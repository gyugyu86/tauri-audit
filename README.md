# tauri-audit

> 日本語の入口は [README.ja.md](README.ja.md) にあります。

Static security analyzer for [Tauri](https://tauri.app) v2 and v1 apps. It parses your
configuration and source **without running the app**, so it is fast, safe, and CI-friendly.

> **Status: pre-release (0.1.0).** Eight rules, landing incrementally. See [Roadmap](#roadmap).
>
> **Unofficial.** An independent project, not affiliated with or endorsed by the Tauri
> project or the Tauri Programme within the Commons Conservancy.

## Where this fits

tauri-audit is **complementary to**, not a replacement for, the dependency scanners you
already run:

| Concern | Tool |
| --- | --- |
| Insecure **configuration** — dangerous flags, over-broad capability scopes, missing CSP | **tauri-audit** |
| Vulnerable **Rust dependencies** | [`cargo-audit`](https://github.com/rustsec/rustsec) / RustSec |
| Vulnerable **npm dependencies** | `npm audit` |
| General-purpose code patterns across any language | [Semgrep](https://semgrep.dev), [CodeQL](https://codeql.github.com) |

Semgrep and CodeQL analyze code; tauri-audit analyzes the configuration that decides what
that code is permitted to do. Neither knows what `dangerousDisableAssetCspModification`
means or that `$CONFIG/**` is a different grant from `$APPCONFIG/**`.

tauri-audit does check a small number of Tauri-specific advisories where the vulnerability
only matters in combination with your configuration (so a plain version bump check would
be misleading), but wholesale dependency auditing is not its job.

**Lockfile support.** A manifest records a version *range*; only a lockfile records what is
installed. Cargo is the sharpest example: `tauri-plugin-shell = "2.2.0"` means `^2.2.0` and
almost certainly installs the patched 2.2.1, so reading it as "2.2.0, vulnerable" flags a
project that is fine.

| Lockfile | Support |
| --- | --- |
| `Cargo.lock`, `package-lock.json`, `pnpm-lock.yaml` (v5/v6/v9) | resolved versions read — findings are **confirmed** |
| `yarn.lock`, `bun.lock*`, unrecognized `pnpm-lock.yaml` versions | not parsed — findings fall back to manifest ranges and are reported as **possible** |
| no lockfile | manifest ranges only — **possible** |

The fallback errs toward reporting: a range that *could* include an affected version is
flagged, and the finding says the installed version is unknown. Nothing is hidden.

**It accepts false negatives to avoid false positives.** Rules whose exemption conditions
cannot be verified statically are reported as `heuristic` and never fail your build by
default. See [Honest limitations](#honest-limitations).

## Install

```bash
npm install -g tauri-audit
# or run it without installing
npx tauri-audit ./my-tauri-app
```

Requires Node.js >= 22.12.

## Usage

```bash
tauri-audit <target-path> [options]
```

| Option | Effect |
| --- | --- |
| `--json` | machine-readable JSON output |
| `--markdown` | Markdown report |
| `--sarif` | SARIF 2.1.0, for GitHub code scanning |
| `--category <id>` | SARIF category (`run.automationDetails.id`) |
| `--strict` | also fail on `heuristic` critical/high findings |
| `--no-fail` | do not fail on findings (operational errors still exit 2) |

### Severity and confidence are separate

Every finding carries two independent values:

- **severity** — `critical` / `high` / `medium` / `low` / `info`: how bad this is *if real*.
- **confidence** — `high` / `heuristic`: how sure we are that it *is* real.

They do not collapse into one number. A critical issue we can only suspect stays
`heuristic`. This matters because several Tauri CVEs carry exemption conditions
("not affected if…") that cannot be cross-checked statically — those rules are pinned to
`heuristic` permanently and their finding text tells you how to confirm by hand.

For CVE-derived rules, severity follows the **GitHub Security Advisory label** as the
primary source. Where scoring sources disagree — CVE-2023-46115 is GHSA `Low`, NVD `5.5
Medium`, and CNA `8.4 High` — the finding cites all of them rather than picking one.

### Exit codes (CI gate)

| Code | Meaning | Suppressed by `--no-fail`? |
| --- | --- | --- |
| `0` | analysis completed; nothing gated | — |
| `1` | gating findings present | yes |
| `2` | operational error, **or the analysis could not fully cover the project** | no |

"Gating" means **high-confidence `critical` or `high`** by default; `--strict` widens it to
include `heuristic` findings of those severities.

This exact predicate is also the pass condition of the clean-corpus regression test, so
"the tool would not break this app's CI" has one definition, checked in one place.

#### Unanalyzable is not clean

Exit `2` covers more than bad flags. If a config could not be parsed, could not be placed as
v1 or v2, was skipped for size, or does not exist at all, then **no rule ran over it** — and
"zero findings" would be silence, not safety. tauri-audit refuses to report that as success:
it prints what it could not analyze and exits `2`.

`--no-fail` is a statement about findings ("do not block my build over what you found"), not
a claim that the run succeeded, so it does not suppress this. If you point tauri-audit at a
directory with no Tauri project, you get `2`, not a clean bill of health.

## GitHub Action

```yaml
- uses: gyugyu86/tauri-audit@v0
  with:
    path: .
    category: tauri-audit   # give each run its own category
```

The scan step never fails on its own, so the SARIF always reaches the Security tab; the
gate is a separate step.

## Rules

Rule documentation lives in the finding text itself — each finding explains why the setting
is dangerous and how to confirm or fix it, so the report is readable without this table.

| ID | Applies to | Detects | Severity / confidence | Evidence |
| --- | --- | --- | --- | --- |
| `TA-CONF-001` | v1 + v2 | `security.csp` unset or `null` — no policy is enforced | medium / heuristic | real-world |
| `TA-CONF-002` | v1 + v2 | `security.dangerousDisableAssetCspModification` | `true` → high / high · directive list → medium / heuristic | synthetic |
| `TA-V1-001` | v1 | `tauri.allowlist.all: true` — every v1 API enabled at once | high / high | real-world |
| `TA-V1-002` | v1 | `tauri.security.dangerousRemoteDomainIpcAccess` — remote origins granted IPC | `enableTauriAPI` or plugins → high / high · domain-only → medium / heuristic | synthetic |
| `TA-V1-003` | v1 | `tauri.security.dangerousUseHttpScheme: true` | medium / high | synthetic |
| `TA-DEP-001` | v2 | shell plugin ≤ 2.2.0 with an unset `open` scope (CVE-2025-31477) | high / heuristic | synthetic |
| `TA-VITE-001` | any | Vite `envPrefix` covering Tauri signing variables (CVE-2023-46115) | low / heuristic | synthetic |
| `TA-CAP-003` | v2 | capability filesystem scope reaching past the application | medium / heuristic | synthetic |

**Evidence** records whether the rule has been shown to fire on real third-party code, and
is carried as rule metadata rather than documentation, so a test can check it. `real-world`
means the rule fires on an unmodified config vendored in `tests/corpus/`; `synthetic` means
it has only been demonstrated against fixtures written for this repository. A rule may
understate its evidence but cannot claim `real-world` without a corpus application to back
it — that direction is asserted in the suite.

Firing on a *correctly written* application still counts, and is worth reading carefully:
it proves the rule matches real code, and it simultaneously proves the rule must stay
`heuristic`, since a high-confidence finding there would fail those projects' builds. That
is the position `TA-CONF-001` is in.

Most rules are `synthetic` because the settings they look for are rare in shipped code —
which is the point of them being dangerous. That asymmetry is expected rather than a gap to
close.

### What this is worth on v2, honestly

Most of the deterministic rules above are v1-only, and that is a fact about Tauri rather
than about coverage. v1's allowlist was opt-in but coarse, and it carried explicit
`dangerous*` switches that a project could turn on. v2 replaced it with capabilities, which
are default-deny and per-command — so there are simply fewer settings left that are wrong
under every reading.

The value on v2 is therefore different in kind. It is not "find the dangerous flag"; it is
**making capability grants reviewable**: noticing that a filesystem scope reaches past the
application, that a CVE's exemption cannot be confirmed, that no CSP is set. Those are
judgement calls surfaced for a human, which is why the v2 rules are heuristic and why they
do not gate. If you are on v2 and this tool reports nothing gating, that is the expected
result and largely a credit to v2's design.

### About the Tauri sample in the corpus

`tests/corpus/true-positive/` contains Tauri's own `examples/api` configuration, which
trips `TA-V1-001` by setting `allowlist.all: true`. That is **not a defect in Tauri**. It
is an API demonstration whose purpose is to exercise every API in one place, so enabling
all of them is correct for what it is and wrong only if copied into a product. It sits in
the corpus because it is a permissively licensed, real configuration written by people who
know the framework — which makes it far better evidence than a fixture written by whoever
wrote the rule.

**Polarity is decided per rule, from the primary source.** For most rules above the
dangerous state is a setting explicitly turned on, so an absent key is safe. Two are the
exact inverse. `TA-DEP-001` treats an **unset** `plugins.shell.open` as affected, because
the default validation an unset value selects is the part that was broken. `TA-CONF-001`
fires when no CSP is configured, because the field defaults to `null` and a null CSP
enforces nothing. Assuming the familiar polarity in either case would have missed the
entire affected population.

`TA-CONF-001` therefore fires on a large share of real applications, which is intended: it
is `medium`/`heuristic` and can never fail a build. Three of the six corpus applications
ship without a CSP, and reporting that is correct rather than a false positive.

Two of these grade themselves by content rather than by presence.
`dangerousDisableAssetCspModification: true` switches Tauri's CSP rewriting off entirely,
while a directive array narrows it — the same key, two different settings, so they are not
reported the same way. Likewise a remote-IPC entry granting `enableTauriAPI` hands over the
whole API surface, whereas one naming only a domain and windows enables the mechanism
without granting commands through that setting alone, and what those windows expose
otherwise is not visible in the config.

More rules are landing — see [Roadmap](#roadmap).

## Honest limitations

These are deliberate. A static analyzer that fails CI on its own false positives is one
nobody keeps in their pipeline.

- **The app is never executed.** Configuration is parsed, not evaluated. Anything decided
  at runtime is invisible.
- **Exemption conditions are respected by downgrading, not by guessing.** Where an advisory
  says "not affected if X" and X cannot be checked statically, the rule stays `heuristic`
  and the finding tells you how to verify X yourself.
- **Line numbers are exact for JSON, approximate for JSON5 and TOML.** `tauri.conf.json`
  and `capabilities/*.json` are parsed with position information; `tauri.conf.json5` and
  `Tauri.toml` fall back to a key scan and may point at the enclosing region.
- **Mixed or unrecognizable configs are skipped, not guessed.** If a document cannot be
  confidently placed as v1 or v2, no config rules are applied to it and a warning is
  logged — applying v1 rules to a v2 config (or the reverse) is a pure false-positive
  source.
- **`vite.config.*` is read by text scan, not parsed.** There is no JavaScript parser in
  this package yet, so a `envPrefix` built from variables, spread from another object, or
  written as a template literal is **not analyzed** and produces no finding. Comments and
  string literals are masked before the option is looked for, so a commented-out or
  quoted mention does not trigger it either.
- **There is no dataflow analysis yet.** Nothing tracks a value from a source to a sink,
  so a rule cannot tell whether attacker-controlled input reaches a dangerous call. When it
  lands (Phase 3) it will be single-function-scope only: cross-function flow, return values
  and reassignment will not be followed, which trades false negatives for false positives
  deliberately.
- **Rust source analysis is not implemented yet** (planned, tree-sitter based).
- **Lockfiles**: `Cargo.lock`, `package-lock.json` and `pnpm-lock.yaml` (v5/v6/v9) give
  confirmed versions; `yarn.lock` and `bun.lock*` are recognized but not parsed, so those
  projects fall back to manifest ranges and their dependency findings say so.
- **Evidence strength differs per rule**, and each rule says which it has — see the
  `Evidence` column above.

## Roadmap

- **Phase 1 (MVP)** — configuration rules, TypeScript only. Deterministic rules first to
  establish the zero-false-positive pipeline, then CVE and context-dependent rules as
  `heuristic`.
- **Phase 2** — JavaScript/TypeScript AST rules (`invoke`, `shell.open`).
- **Phase 3** — Rust analysis via tree-sitter, single-function-scope dataflow, `heuristic`
  only.

## Development

```bash
npm ci
npm run build   # tsc; no bundler
npm run lint
npm test        # all layers, fully offline
```

The analysis engine (`src/core/`) knows nothing about the CLI (`src/cli/`); the dependency
runs one way only, so the engine stays embeddable.

## License

MIT. See [LICENSE](LICENSE).

Test fixtures under `tests/corpus/` are third-party configuration files retained under
their own licenses; each directory carries a `PROVENANCE.md` recording its source, commit,
and license. They are test data, not part of the distributed package (`npm` ships `dist/`
only).
