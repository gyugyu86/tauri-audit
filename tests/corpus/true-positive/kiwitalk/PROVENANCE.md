# KiwiTalk/KiwiTalk (expected to trip rules)

| | |
| --- | --- |
| Source | https://github.com/KiwiTalk/KiwiTalk |
| Commit | `7e8bcc34d6c2d994ff32b482bc649e8b51382255` |
| Retrieved | 2026-07-26 |
| License | Apache-2.0 — verified by reading `LICENSE-APACHE` in the repository, not a badge |
| Tauri | v1 |

## Files copied

- `backend/bin/app/tauri.conf.json`
- `backend/bin/app/Cargo.toml`
- `package.json`, `vite.config.ts`, `pnpm-lock.yaml`

**Unmodified.** No reformatting, key reordering, or content edits. Only configuration was
copied; no application source.

## Why this application is in `true-positive/`, and how it got there

It was selected as a *clean* candidate under `docs/CORPUS-SELECTION.md`, purely on license,
maintenance and coverage grounds, before tauri-audit was run against it. It then produced a
high-confidence finding.

Per those criteria the response is to investigate, never to drop the application. The finding
is a **true positive**, so it moved here:

- The configuration contains `"allowlist": { "all": true }`. The rule reports exactly that,
  at the line it appears on. This is not a parse artifact, a misattributed location, or a
  key-name collision between v1 and v2.
- In v1 the allowlist is opt-in per API family, so `all: true` enables every family at once —
  filesystem, shell, process, HTTP, clipboard and the rest.
- The same file separately narrows the HTTP scope to `["https://*", "http://*"]`. That the
  author scoped one family while `all: true` enables every other family wholesale is what
  makes this a clear over-grant rather than a deliberate choice.

To be precise about what is and is not being claimed: this entry records that **the pattern
this rule detects appears in a real application**. That is its whole purpose here. The
finding states a fact about a public configuration file — `allowlist.all: true` enables every
v1 API family — and nothing beyond it. Whether that is reachable depends on the application's
frontend, which this tool does not analyze, and no claim is made about it.

The same framing applies as to `tauri-api-v1` next door: an application appears in this
directory because its configuration exercises a rule, not because anyone is asserting it is
insecure.

## Upstream notification

An issue is to be opened on KiwiTalk/KiwiTalk describing the `allowlist.all: true`
observation and stating that these configuration files are vendored here under Apache-2.0
with attribution, with a standing offer to remove them on request. It is filed once this
repository is public, so the links in it resolve — a notice pointing at a 404 is worse than
none. Publication here is a quiet visibility change; the notice precedes the parts that
constitute actually releasing the tool.

*Status: not yet filed. This paragraph is updated with a link once it is, rather than
describing it as done in advance.*

The form is notification with a standing opt-out, not a request for permission. Apache-2.0
already permits this vendoring with attribution, so consent is a courtesy rather than a
legal requirement — and asking would have made a release wait on a reply, then made
proceeding without one awkward. Telling them, and meaning the offer to remove, is both
honest and unblocking.

## What it is worth to the corpus

It is the first **third-party** evidence for TA-V1-001. Until this expansion the only
configuration that tripped a v1 rule was Tauri's own `examples/api`, which is a demonstration
deliberately enabling everything — good evidence, but of a different kind than a real
application.

It also carries a `pnpm-lock.yaml` and a v1-era `envPrefix` listing `TAURI_PLATFORM`,
`TAURI_ARCH` and similar. None of those prefixes reaches a signing variable, so TA-VITE-001
correctly stays silent — real-world negative evidence for the prefix-semantics check that a
substring match would have failed.

The application lives at `backend/bin/app/` with no `src-tauri/` directory, which exercises
discovery against another real layout.
