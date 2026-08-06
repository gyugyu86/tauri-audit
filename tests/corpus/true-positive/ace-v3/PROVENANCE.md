# synapticsim/ace-v3 (expected to trip rules)

| | |
| --- | --- |
| Source | https://github.com/synapticsim/ace-v3 |
| Commit | `e8d1f76e0fd8689b8c2fe6184a35051061130df9` (branch `master`) |
| Retrieved | 2026-08-06 |
| License | MIT (see `LICENSE`) |
| Tauri | v1 |

## Files copied

- `package-lock.json`
- `package.json`
- `src-tauri/Cargo.lock`
- `src-tauri/Cargo.toml`
- `src-tauri/tauri.conf.json`
- `vite.config.ts`

**Unmodified.** No reformatting, key reordering, or content edits. Application source is not
copied — only configuration.

## Why this application is in `true-positive/`

`TA-V1-001` reported `tauri.allowlist.all: true` at
`src-tauri/tauri.conf.json:14`, at `high` severity and `high` confidence.

```json
"allowlist": { "all": true }
```

As with `recoverymagic`, this is the minimal form: one key, no per-family blocks, so all
thirteen API families are enabled and none is scoped. The finding restates what the v1
schema defines `AllowlistConfig.all` to mean.

Two applications arriving at the same shape independently is the point of having both. A
single occurrence could be an outlier; a repeated one is a pattern.

## This is not a claim that the application is unsafe

The directory name is this project's internal classification: it means the detection fired
correctly on configuration that really is there. Whether any of it is reachable depends on
what the application does with those APIs, which this tool never examines — it reads
configuration and nothing else. Tauri's own `examples/api` sits in this directory for the
same reason, and it is a demonstration rather than a defect.

Nothing in this repository says this application is insecure.

## Upstream notification

**Not notified, deliberately.** The authors have not been told that these configuration
files are vendored here, nor that a rule fired on them.

The line was drawn on how much a notice would actually tell them, not on how risky the
setting is. `luwav` and `openteams` were notified because each had something only their
author could act on — a carefully enumerated `fs.scope` undone by one key, and an IPC grant
present in the shipped config rather than only the development one. Here the finding is
`allowlist: {"all": true}` and nothing else, so a notice could only restate what the v1
schema already documents: `all` enables every API family. That is a link to the reference,
not an observation about this application.

It is worth being explicit that this cuts against severity. This configuration is *more*
exposed than the two that were notified — every family enabled, none scoped — and it is
still the one not written to, because there is nothing to say that reading the docs would
not say better. Sorting by risk instead would have produced the opposite answer and a worse
reason.

The vendoring is public either way: this file, the repository, and the corpus directory are
all readable without anyone being told. If the authors object, the files come out on
request, with no explanation needed and no expiry on the offer. This paragraph is updated
with a link if a notice is ever filed, rather than describing one as sent.

## How it was selected

Selected against `docs/CORPUS-SELECTION.md` on licensing and provenance alone, vendored,
and only then analyzed.

It is worth recording that these three applications were briefly held back from `clean/` on
the reasoning that an application enabling every API family is not "correctly written". That
reasoning was circular — that `allowlist.all: true` is dangerous is precisely what
`TA-V1-001` asserts, so excluding on it would have meant the rule was never tested against
an application that has it. The exclusion was withdrawn, the criteria were rewritten to be
mechanical, and the rewrite was committed before these were vendored. They are here because
the analysis put them here, not because they were pre-sorted.
