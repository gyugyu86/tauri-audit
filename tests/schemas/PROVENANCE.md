# SARIF 2.1.0 schema (test-only)

Used by `tests/cli/sarif.test.ts` to validate the SARIF this tool emits. **Test data
only** — it is not shipped in the npm package (`files` lists `dist`, `schemas` and
`advisories`; `tests/` is excluded).

| | |
| --- | --- |
| File | `sarif-2.1.0.json` |
| Source | `https://json.schemastore.org/sarif-2.1.0-rtm.6.json` |
| Retrieved | 2026-07-20 |
| Bytes | 110287 |
| SHA-256 | `6fca63652d2544dad5074ed27bc21f08d213c5f33941fe51a192576ed082d915` |
| Declares | JSON Schema **draft-07** |

Unmodified.

## Why this rendition and not the OASIS original

The canonical schema published by OASIS —
`https://docs.oasis-open.org/sarif/sarif/v2.1.0/errata01/os/schemas/sarif-schema-2.1.0.json`,
mirrored byte-for-byte at
`https://raw.githubusercontent.com/oasis-tcs/sarif-spec/main/sarif-2.1/schema/sarif-schema-2.1.0.json`
(112768 bytes) — declares **draft-04**.

ajv 8 does not support draft-04 without the separate `ajv-draft-04` package, and adding a
dependency purely to validate test output is not worth it. The schemastore rendition is the
same SARIF 2.1.0 content at revision rtm.6 expressed in draft-07, which the ajv instance we
already have can compile.

Both describe SARIF 2.1.0; `properties.version.enum` is `["2.1.0"]` in this file.

Validating against this schema is a local sanity check, not the final word: the authoritative
acceptance test is the real upload to GitHub code scanning in the S7 self-scan workflow,
since GitHub enforces its own subset and rejects documents this schema would accept.

## Refresh

```bash
curl -sSL -o tests/schemas/sarif-2.1.0.json https://json.schemastore.org/sarif-2.1.0-rtm.6.json
shasum -a 256 tests/schemas/sarif-2.1.0.json
```
