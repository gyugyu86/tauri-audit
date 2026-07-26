import path from 'node:path';

import { parseJson5Document } from './json5Doc.js';
import { parseJsonDocument } from './jsonDoc.js';
import { parseTomlDocument } from './tomlDoc.js';
import { parseYamlDocument } from './yamlDoc.js';

import type { ParsedDocument } from './document.js';

export { approximateLineOf, LineIndex } from './document.js';
export type { DocPath, LocationPrecision, ParsedDocument } from './document.js';
export { parseJson5Document } from './json5Doc.js';
export { parseJsonDocument } from './jsonDoc.js';
export { parseTomlDocument } from './tomlDoc.js';
export { parseYamlDocument } from './yamlDoc.js';

/**
 * Files whose format is not implied by their extension.
 *
 * `Cargo.lock` is TOML despite the `.lock` suffix. Dispatching on extension
 * alone made every Rust project with a lockfile look unparsable, which — under
 * the "unanalyzable is not clean" rule — failed the build outright.
 */
const FORMAT_BY_FILENAME: Readonly<Record<string, (text: string) => ParsedDocument | undefined>> = {
  'cargo.lock': parseTomlDocument,
  'pnpm-lock.yaml': parseYamlDocument,
};

/**
 * Picks a parser by filename, then extension.
 *
 * Returns `undefined` for both "unsupported format" and "unparsable content".
 * Callers treat the two the same way: the file is counted as unparsable and
 * skipped, and analysis continues with the rest of the project.
 */
export function parseConfigDocument(filePath: string, text: string): ParsedDocument | undefined {
  const lower = filePath.toLowerCase();

  const byName = FORMAT_BY_FILENAME[path.basename(lower)];
  if (byName !== undefined) return byName(text);

  if (lower.endsWith('.json5')) return parseJson5Document(text);
  if (lower.endsWith('.toml')) return parseTomlDocument(text);
  if (lower.endsWith('.json') || lower.endsWith('.jsonc')) return parseJsonDocument(text);

  return undefined;
}
