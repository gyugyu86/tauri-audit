import JSON5 from 'json5';

import { approximateLineOf, type DocPath, type ParsedDocument } from './document.js';

/**
 * Parses `tauri.conf.json5`.
 *
 * JSON5 gives us the value but discards position, so line numbers fall back to a
 * key scan and are marked `approximate`. Tauri supports this dialect behind its
 * `config-json5` Cargo feature; it is rare in practice, which is why it gets the
 * cheaper treatment rather than a second position-aware parser.
 *
 * Returns `undefined` on unparsable input. Never throws.
 */
export function parseJson5Document(text: string): ParsedDocument | undefined {
  let value: unknown;
  try {
    value = JSON5.parse(text);
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
