import { parse as parseYaml } from 'yaml';

import { approximateLineOf, type DocPath, type ParsedDocument } from './document.js';

/**
 * Parses YAML — currently only `pnpm-lock.yaml`.
 *
 * Line numbers are `approximate`: the `yaml` package can report positions, but
 * lockfile findings point at the manifest that declares the dependency rather
 * than at a lockfile line, so the extra precision would go unused.
 *
 * Returns `undefined` on unparsable input. Never throws.
 */
export function parseYamlDocument(text: string): ParsedDocument | undefined {
  let value: unknown;
  try {
    value = parseYaml(text);
  } catch {
    return undefined;
  }

  if (value === undefined || value === null) return undefined;

  return {
    value,
    locationPrecision: 'approximate',
    syntaxWarnings: [],
    lineOf(path: DocPath): number {
      return approximateLineOf(text, path);
    },
  };
}
