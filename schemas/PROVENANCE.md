# Vendored Tauri configuration schemas

## Why these are vendored rather than fetched

`schema.tauri.app` serves version-addressed paths, but **they do not return that version**.
Measured 2026-07-19:

| URL | HTTP | bytes | `$id` |
| --- | --- | --- | --- |
| `/config` | 200 | 154933 | `https://schema.tauri.app/config/2.11.5` |
| `/config/2.9.4` | 200 | 154933 | `https://schema.tauri.app/config/2.11.5` |
| `/config/2` | 200 | 154933 | `https://schema.tauri.app/config/2.11.5` |
| `/config/1` | 200 | 123198 | *(none)* |
| `/config/1.6.0` | 200 | 123198 | *(none)* |

Every v2 version path aliases the current latest v2 document byte-for-byte, so a
version-pinned URL cannot give reproducible analysis. Pinning happens here instead.

Vendoring also keeps the analysis path free of network access, which tauri-audit requires:
the analyzer never reaches the network and never executes the project it analyzes.

## Files

| File | Source URL | Fetched | Bytes | SHA-256 | `$schema` | `$id` |
| --- | --- | --- | --- | --- | --- | --- |
| `tauri-config-v2.json` | `https://schema.tauri.app/config` | 2026-07-19 | 154933 | `6928b54f49574a13d8c597effa0f429853d19ddf3f6da5329751cff3848510de` | draft-07 | `https://schema.tauri.app/config/2.11.5` |
| `tauri-config-v1.json` | `https://schema.tauri.app/config/1` | 2026-07-19 | 123198 | `3c5c1fb0a7f27da4a5010e56e79f69ecbca95b7d96dce4ede500ce27929ce397` | draft-07 | *(none)* |

**Both files are unmodified.** No formatting, key reordering, or content edits were applied.

Note that the v1 schema declares no `$id`; the loader assigns one so ajv can address it.

## License

Both schemas are generated from [`tauri-apps/tauri`](https://github.com/tauri-apps/tauri),
which is dual-licensed **MIT OR Apache-2.0**.

## Refresh procedure

```bash
curl -sS -o schemas/tauri-config-v2.json https://schema.tauri.app/config
curl -sS -o schemas/tauri-config-v1.json https://schema.tauri.app/config/1
shasum -a 256 schemas/tauri-config-*.json
```

Then update the table above. Bumping the vendored v2 schema can change which fields
validate, so re-run the corpus tests and review any snapshot diff before committing.
