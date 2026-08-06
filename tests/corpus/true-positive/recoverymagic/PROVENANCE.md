# ActiveTK/RecoveryMagic (expected to trip rules)

| | |
| --- | --- |
| Source | https://github.com/ActiveTK/RecoveryMagic |
| Commit | `821921ff6ddcb3aeb135cf62622a96352c999b0c` (branch `main`) |
| Retrieved | 2026-08-06 |
| License | MIT (see `LICENSE`) |
| Tauri | v1 |

## Files copied

- `Cargo.lock`
- `Cargo.toml`
- `tauri.conf.json`

**Unmodified.** No reformatting, key reordering, or content edits. Application source is not
copied — only configuration.

## Why this application is in `true-positive/`

`TA-V1-001` reported `tauri.allowlist.all: true` at `tauri.conf.json:32`, at
`high` severity and `high` confidence.

```json
"allowlist": { "all": true }
```

That is the whole allowlist. Tauri v1's allowlist is opt-in per API family, so `all: true`
enables all thirteen at once — `app`, `clipboard`, `dialog`, `fs`, `globalShortcut`,
`http`, `notification`, `os`, `path`, `process`, `protocol`, `shell`, `window` — none of
them narrowed by a scope, because no per-family block exists to carry one.

The rule is deterministic here: the key is present and explicitly `true`, there is no
exemption condition, and the finding states exactly what the schema says the setting does.

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
