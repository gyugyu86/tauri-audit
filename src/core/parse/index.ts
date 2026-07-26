import { parseJson5Document } from './json5Doc.js';
import { parseJsonDocument } from './jsonDoc.js';
import { parseTomlDocument } from './tomlDoc.js';

import type { ParsedDocument } from './document.js';

export { approximateLineOf, LineIndex } from './document.js';
export type { DocPath, LocationPrecision, ParsedDocument } from './document.js';
export { parseJson5Document } from './json5Doc.js';
export { parseJsonDocument } from './jsonDoc.js';
export { parseTomlDocument } from './tomlDoc.js';

/**
 * Picks a parser by file extension.
 *
 * Returns `undefined` for both "unsupported extension" and "unparsable content".
 * Callers treat the two the same way: the file is counted as unparsable and
 * skipped, and analysis continues with the rest of the project.
 */
export function parseConfigDocument(filePath: string, text: string): ParsedDocument | undefined {
  const lower = filePath.toLowerCase();

  if (lower.endsWith('.json5')) return parseJson5Document(text);
  if (lower.endsWith('.toml')) return parseTomlDocument(text);
  if (lower.endsWith('.json') || lower.endsWith('.jsonc')) return parseJsonDocument(text);

  return undefined;
}
