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
| `clean/` | Correctly written apps. Must produce **zero gating findings**. |
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
