# Corpus selection criteria

**This document is fixed before any application is chosen, and is not revised to
accommodate what the tool turns out to report.**

`tests/corpus/clean/` is the evidence behind this project's central claim: that tauri-audit
does not fail the build of a correctly written application. That claim is only worth
something if the applications were selected without reference to what tauri-audit says
about them. Choosing applications that the tool happens to pass would make the claim
circular and destroy the one property the corpus exists to have — independence.

## The order of operations is the method

1. Fix these criteria and commit them.
2. Select and vendor applications using **only** these criteria.
3. **Only then** run tauri-audit against them.
4. Never remove an application from the corpus because it produced a finding.

Step 4 is the one that matters under pressure. A high-confidence finding on an application
selected this way is not a reason to drop the application; it is a result, and it has
exactly two honest resolutions:

- **It is a true positive.** Move the application to `tests/corpus/true-positive/` and
  record in its `PROVENANCE.md` what makes the finding correct.
- **It is a false positive.** Demote the offending rule to `heuristic`, or withdraw it.
  This is non-negotiable and is the rule the whole project is built around.

If which of the two applies cannot be determined, stop and escalate rather than guessing.
Finding this before release is a success, not a setback.

## Eligibility

An application qualifies if all of the following hold. Nothing else is considered.

- **Permissive license only**: MIT, Apache-2.0, BSD, or ISC. GPL, AGPL and LGPL are
  excluded to keep this repository free of copyleft. MPL-2.0 is also excluded — not for
  legal reasons but because it causes friction in automated license scanning, which matters
  for the audiences most likely to adopt this tool.
- **License verified from the `LICENSE` file itself**, not from a README badge or a
  repository description. A previous candidate advertised differently from what its
  `LICENSE` actually said, which is why this is spelled out.
- **Real, third-party, and maintained** — commits within roughly the last year. Applications
  authored by this project do not count as independent evidence.
- **Actually a Tauri application**, carrying a real v1 or v2 configuration.
- **Selected without looking at tauri-audit's output for it.**

Reading an application's configuration during selection is required, not a violation — the
coverage goals below are stated in terms of what a configuration contains. What may not
happen is running the analyzer and letting its verdict influence the choice.

## Coverage goals

Applications are chosen to close gaps in what the corpus exercises, not by popularity. In
priority order:

1. **A third-party v1 application.** Currently zero. The only v1 configurations in the
   corpus are Tauri's own examples, so `TA-V1-001`, `TA-V1-002` and `TA-V1-003` have no
   independent evidence at all. One is worth a lot; two is better.
2. **An application configuring `plugins.shell`.** Currently zero. `TA-DEP-001`'s exemption
   paths — `open` set to `true`, to a regex, or to `false` — have no real-world material,
   which is why the rule is `synthetic-only`.
3. **A v2 application that sets a CSP correctly.** Currently zero: all three v2 applications
   ship `csp: null`. There is no real application where `TA-CONF-001` legitimately stays
   silent, which is exactly the negative evidence that matters most.
4. **Filesystem scope variety.** Only `$APPDATA` appears today (via yaak). Other variables
   (`$APPCONFIG`, `$APPLOCALDATA`, `$RESOURCE`) or a `deny` list alongside `allow` would
   give `TA-CAP-003` real material.
5. **A `vite.config` declaring `envPrefix`.** Real-world material for `TA-VITE-001`.
6. **A `pnpm-lock.yaml`.** Exercises the pnpm resolution path against real data rather than
   fixtures.
7. **A capability mixing string and object permission entries.** Walks the `PermissionEntry`
   `anyOf` with data nobody wrote for this repository.

Not every goal has to be met. Any that cannot be filled is recorded in
`tests/corpus/README.md` as a gap — an absence of real-world material is itself an honest
limitation, and hiding it would be worse than having it.

## What gets vendored

Configuration only. Never the application.

- `tauri.conf.json`, `tauri.*.conf.json`, `tauri.conf.json5`, `Tauri.toml`
- `capabilities/*.json`
- `Cargo.toml`, `package.json`, `vite.config.*`
- lockfiles, when their size is reasonable — a lockfile upgrades a dependency finding from
  `possible` to `resolved`, which is materially stronger evidence. If one is excluded for
  size, the exclusion and its reason go in `PROVENANCE.md`.

The upstream directory layout is preserved exactly, including whether a `src-tauri/`
directory exists. That layout is itself a discovery test case.

Each application lives in `tests/corpus/clean/<name>/` with a `PROVENANCE.md` recording
source URL, commit SHA, license as read from the `LICENSE` file, retrieval date, an explicit
statement that nothing was modified, the list of files copied, and the reason for anything
deliberately left out.
