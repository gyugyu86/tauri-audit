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

**Not notified.** The authors have not been told that these configuration files are vendored
here, nor that the setting above was observed. Whether to do so is undecided.

This paragraph is updated with a link if and when a notice is filed, rather than describing
it as done in advance — the same order kept for `kiwitalk`, whose notice was written as
pending until it actually existed.

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
