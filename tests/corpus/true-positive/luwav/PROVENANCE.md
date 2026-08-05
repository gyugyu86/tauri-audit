# Rachioff/Luwav (expected to trip rules)

| | |
| --- | --- |
| Source | https://github.com/Rachioff/Luwav |
| Commit | `e2e91ba03317df90189711c163d9a90feab9373a` (branch `main`) |
| Retrieved | 2026-08-06 |
| License | MIT (see `LICENSE`) |
| Tauri | v1 |

## Files copied

- `package.json`
- `src-tauri/Cargo.lock`
- `src-tauri/Cargo.toml`
- `src-tauri/tauri.conf.json`
- `vite.config.ts`
- `yarn.lock`

**Unmodified.** No reformatting, key reordering, or content edits. Application source is not
copied — only configuration.

## Why this application is in `true-positive/`

`TA-V1-001` reported `tauri.allowlist.all: true` at
`src-tauri/tauri.conf.json:15`, at `high` severity and `high` confidence.

**This is the clearest case in the corpus for why the rule exists.** Unlike the other two,
this configuration was plainly written with security in mind:

```json
"allowlist": {
  "all": true,
  "fs": {
    "all": true,
    "scope": ["$APPDATA/*", "$APPDATA/media/*", "$RESOURCE/*", "$RESOURCE/../notes/*",
              "$RESOURCE/../image/*", "$RESOURCE/../audio/*", "$RESOURCE/../video/*",
              "$RESOURCE/../doc/*"],
    ...
  },
  "protocol": { "all": true, "asset": true, "assetScope": ["**"] }
}
```

The author enumerated eight filesystem paths rather than reaching for a wildcard, and set a
real Content Security Policy (`default-src 'self'; …`) instead of leaving it `null` as most
of the corpus does. Both are deliberate acts of narrowing.

And `all: true` undoes it for everything else. The careful `fs.scope` binds only `fs`; the
other twelve families — `shell` and `process` among them — are enabled with no scope at
all. The effort spent constraining one family is spent next to a key that opens the rest.

This is the same contradiction reported upstream to KiwiTalk, reached independently by a
different author in a different application. That it recurs is what makes `TA-V1-001` worth
having: the setting is not an exotic mistake, it is what happens when `all: true` is read as
"enable Tauri's APIs" rather than "enable every API family, unscoped".

### A second finding that did *not* gate, and should not have

The same file carries:

```json
"dangerousRemoteDomainIpcAccess": [ { "windows": [], "domain": "file://" } ]
```

`TA-V1-002` graded this `medium`/`heuristic` rather than `high`/`high`, because the entry
sets neither `enableTauriAPI` nor `plugins`, and its `windows` list is empty — it grants
nothing to nobody. It is therefore reported without failing the build, which is the graded
assessment behaving as designed on real data rather than on a fixture.

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
