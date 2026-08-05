# Corpus selection criteria

**This document is fixed before any application is chosen, and is not revised to
accommodate what the tool turns out to report.**

`tests/corpus/clean/` is the evidence behind this project's central claim: that tauri-audit
does not fail the build of a real, ordinarily written application. That claim is only worth
something if the applications were selected without reference to what tauri-audit says
about them. Choosing applications that the tool happens to pass would make the claim
circular and destroy the one property the corpus exists to have — independence.

## `clean/` means "met the criteria", not "came out clean"

An application belongs in `clean/` because it satisfies the mechanical eligibility rules
below. It is not a claim that the application is harmless, well written, or free of
findings, and **nothing about a configuration's content may be used to keep an application
out.**

That last rule is not pedantry; it was learned by breaking it. Three candidates setting
`allowlist.all: true` were once held back from `clean/` on the reasoning that an application
enabling every API family is "not correctly written" — a judgment about the configuration,
not about the tool's output, and so seemingly permitted. It is not. That
`allowlist.all: true` is dangerous **is the entire claim of `TA-V1-001`**, so using it as an
exclusion criterion means the rule is never tested against an application that has it. Any
criterion phrased in terms of what a rule objects to smuggles that rule's conclusion into
the sample, and "no false positives" becomes true by construction.

The corpus is therefore selected on provenance and licensing alone. An application that
turns out to trip a rule is not removed; it is analyzed, and the finding is resolved as one
of the two outcomes below.

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
- **Third-party and maintained** — not authored by this project, and pushed to within
  roughly the last year. Applications authored here do not count as independent evidence.
  Popularity is not a criterion: a small application written by someone who never heard of
  this tool is exactly as independent as a large one.
- **Actually a Tauri application**, carrying a real v1 or v2 configuration.
- **Selected without reference to what any rule would say about it** — neither by running
  the analyzer, nor by reading the configuration for the settings a rule objects to.

Reading an application's configuration during selection is required, not a violation — the
coverage goals below are stated in terms of what a configuration contains. Reading it to
decide *which shapes are still missing* is the method working. Reading it to decide that an
application is too dangerous to include is the method failing, because "too dangerous" can
only mean "a rule would fire", and that is the question the corpus exists to answer.

## How large the corpus should be

Around twenty applications, and never more than twenty-five.

The cap exists because a corpus is not a scoreboard. Every application added past the point
where it closes a real gap costs test time and review attention while adding nothing to the
claim, and the pressure to reach a number is exactly the pressure that loosens the
eligibility rules below. **If the applications meeting those rules run out, the work stops
and the shortfall is reported.** Stopping early is a result; relaxing eligibility to keep
counting is not.

## Coverage goals

Applications are chosen to close gaps in what the corpus exercises, not by popularity. In
priority order:

1. **Third-party v1 applications — at least four, preferably six.** The only v1
   configurations in the corpus are Tauri's own examples, and those carry no `Cargo.toml`,
   so they are partially analyzed besides. `TA-V1-001`, `TA-V1-002` and `TA-V1-003` are
   three of the four deterministic, build-failing rules, and not one of them has ever been
   run against a third-party v1 application at all. That is the largest hole in the evidence
   and it is worth more than any number of additional v2 applications.
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

## How the corpus is guarded

Two checks, and it matters that they are different questions.

**`npm run verify:corpus` — is it unmodified?** Every vendored file has a recorded sha256
in its application's `CHECKSUMS.txt`, verified offline by the test suite. `--upstream`
re-fetches from the commit in `PROVENANCE.md` and compares byte for byte; that needs the
network, so it runs on demand rather than in CI. This is the property that actually matters:
the corpus is evidence because nobody here wrote it, and a single edit to make a test pass
would quietly destroy that.

**`npm run verify:traces` — did anything about how this project was authored leak in?**
This deliberately **excludes `tests/corpus/`**. Those files are retrieved verbatim from
third parties, so the words inside them say nothing about this project's authorship —
Paperling's `Cargo.toml`, for instance, carries its own comments about AI-related
dependencies *that application* uses. Scanning them is a category error, and it is
unwinnable besides: which words a third party puts in their configuration is not something
this project controls, so every future addition would risk a spurious hit.

Each application lives in `tests/corpus/clean/<name>/` with a `PROVENANCE.md` recording
source URL, commit SHA, license as read from the `LICENSE` file, retrieval date, an explicit
statement that nothing was modified, the list of files copied, and the reason for anything
deliberately left out.
