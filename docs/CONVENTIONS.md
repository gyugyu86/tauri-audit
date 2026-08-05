# Engineering conventions — tauri-audit

A security static analyzer for Tauri v2/v1 applications. It parses configuration and source
**without executing them**, reports dangerous settings and known-vulnerable patterns, and
fails CI on the ones it is certain about.

`docs/DESIGN.md` is the primary reference for design, CVEs, version ranges and exemption
conditions; CVE facts come from there. This file holds only the invariants that must hold
in every change.

## Non-negotiable invariants

- **Low false positives outrank everything else.** A finding carries `severity`
  (critical/high/medium/low/info) and `confidence` (high/heuristic) as **separate** fields.
  They are independent: something serious that we can only suspect stays heuristic.
- **Zero tolerance for high-confidence false positives.** If a single high-confidence
  finding appears against the corpus of real third-party applications
  (`tests/corpus/clean/`), that rule is demoted to heuristic or held back — unless the
  finding is correct, in which case the application moves to `true-positive/` and the
  reasoning is recorded there.
- **Corpus eligibility may never be phrased in terms of what a rule objects to.** Selecting
  on provenance and licensing keeps the sample independent; excluding an application because
  its configuration contains the very setting a rule detects makes "no false positives" true
  by construction. This was learned by doing it — see `docs/CORPUS-SELECTION.md`.
- **Never run the analyzed application.** Static parsing only — fast, safe, CI-friendly.
- **Dataflow is approximated within a single function scope.** Cross-function flow, return
  values and reassignment are not tracked: accept false negatives to avoid false positives.
- **One rule ID per file.** Every rule ships with `vulnerable`/`safe` fixtures and unit
  tests. **The analysis engine knows nothing about the CLI** — the dependency runs one way.
- **Document the limits honestly.** README carries an "Honest limitations" section stating
  accepted false negatives and exemption conditions.
- **Unanalyzable is not clean.** A parse failure, an unvalidatable schema, an
  undeterminable version, or a broken config degrades to a visible warning — never to a
  silent "zero findings means safe". **This propagates all the way to the exit code.**
- **Every new layer must answer: if this layer dies, does the run still exit 0 with no
  findings?** A failed analysis and a clean project produce byte-identical output unless
  something says otherwise, and suppression logic is always dangerous in this direction —
  a capability file that cannot be read makes a rule asking "is this permission absent?"
  answer yes. `tests/core/silentFailure.test.ts` enumerates the known paths and asserts
  each degrades; add an entry there rather than relying on the next failure being noticed.
- **Never carry one rule's polarity over to the next.** Establish from the primary source,
  per rule, whether the dangerous state is a value being present or absent. Every S4 rule
  fires on a setting explicitly turned on, so absence is safe there. CVE-2025-31477 is the
  exact inverse: `plugins.shell.open` being **unset** is the affected state, because the
  default validation it implies was the thing that was broken. Assuming the familiar
  polarity would have produced a false negative across the entire affected population.

## Working with severity and confidence

- For CVE-derived rules, severity follows the **GHSA label** as the primary source. Where
  scoring sources disagree (CVE-2023-46115 is GHSA Low / NVD 5.5 / CNA 8.4), the finding
  cites all of them.
- **A CVE with exemption conditions ("not affected if…") is never high-confidence.** Unless
  the exemption can be cross-checked statically, the rule stays `confidence=heuristic` and
  the finding text explains how to verify by hand.
- Version ranges are matched strictly with semver. Stable and prerelease ranges (for
  example `2.0.0-beta.0` through `2.0.0-beta.19`) are never conflated, and npm and cargo are
  matched separately.

## Supporting both config generations

- Before reading a config, determine whether it is **v1 (`tauri.allowlist`) or v2
  (`app.security` + capabilities)** — the config-version discriminator. A v2 rule must
  never see a v1 config or the reverse; misapplication is a pure false-positive source.
- When in doubt, the official schema is authoritative
  (<https://schema.tauri.app/config>, currently `$id` 2.11.5).
- **Schemas are vendored under `schemas/`.** Version-addressed URLs do not pin: measured,
  `/config/<version>` always returns the latest v2 document (`/config/2.9.4` returns `$id`
  2.11.5 byte for byte). Pinning locally is what makes analysis reproducible, and it also
  keeps the analysis path free of network access.

## Implementation stack

- TypeScript throughout. Rust analysis waits until Phase 3 (tree-sitter-rust).
- Main dependencies: commander, json5, jsonc-parser, smol-toml, yaml, ajv + ajv-formats,
  semver, fast-glob, picomatch, chalk; plus typescript, tsx, vitest, eslint and
  @typescript-eslint for development.
- **Build with plain `tsc -p tsconfig.json`. No bundler.** Node executes `dist/` directly,
  so bundling buys nothing — which is why relative imports carry `.js` extensions and
  `module`/`moduleResolution` are `NodeNext`.
- typescript is **pinned to the 6.x line**: typescript-eslint@8.64.0 declares peer
  `typescript: >=4.8.4 <6.1.0` and no dist-tag widens it.
- SARIF 2.1.0 output, with a unique category per run (`run.automationDetails.id`), as
  GitHub has required since 2025-07.
- Exit-code gate: by default high-confidence critical/high fails; `--strict` widens it to
  heuristic critical/high; `--no-fail` suppresses finding-driven failure only.

## Release phases

- **Phase 1 (MVP)** — configuration rules only, all TypeScript. Deterministic rules first
  (TA-CONF-002, TA-V1-001/002/003) to establish the zero-false-positive pipeline, then
  CVE-derived rules (TA-DEP-001, TA-VITE-001) added as heuristic.
- **Phase 2** — JavaScript/TypeScript AST rules (`invoke`, `shell.open`).
- **Phase 3** — Rust analysis (tree-sitter-rust, single-function dataflow, heuristic only),
  once FP=0 is confirmed to survive it.
- **Ongoing** — keep `advisories/tauri-advisories.json` in sync with GHSA and RustSec.

## Always / never

- **Always**: when adding a rule, write its `vulnerable`/`safe` fixtures and tests in the
  same change, and confirm the corpus yields zero high-confidence findings before moving on.
- **Never**: verify by running things. No runtime evaluation of configuration, no network
  access, and no external process launches anywhere in the analysis path.

## Commands

```bash
npm run build   # tsc; no bundler
npm test        # vitest, fully offline
npm run lint    # eslint flat config
node dist/cli/index.js <path>   # run against a project
```
