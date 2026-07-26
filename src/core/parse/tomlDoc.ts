import { parse as parseToml } from 'smol-toml';

import { approximateLineOf, type DocPath, type ParsedDocument } from './document.js';

/**
 * Parses TOML — `Tauri.toml` (Tauri's `config-toml` feature) and `Cargo.toml`
 * (for dependency version extraction).
 *
 * smol-toml returns values without position, so line numbers are `approximate`.
 * For `Cargo.toml` this rarely matters: dependency findings point at the manifest
 * as a whole rather than a precise key.
 *
 * Returns `undefined` on unparsable input. Never throws.
 */
export function parseTomlDocument(text: string): ParsedDocument | undefined {
  let value: unknown;
  try {
    value = parseToml(text);
  } catch {
    return undefined;
  }

  return {
    value,
    locationPrecision: 'approximate',
    syntaxWarnings: [],
    lineOf(path: DocPath): number {
      return approximateLineOf(text, path);
    },
  };
}
