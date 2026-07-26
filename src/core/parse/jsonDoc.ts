import {
  findNodeAtLocation,
  getNodeValue,
  parseTree,
  printParseErrorCode,
  type Node,
  type ParseError,
} from 'jsonc-parser';

import { LineIndex, type DocPath, type ParsedDocument } from './document.js';

/**
 * Parses JSON with exact position information.
 *
 * Used for `tauri.conf.json` and `capabilities/*.json` — the formats that matter
 * most — so their findings can point at the precise offending key.
 *
 * jsonc-parser is deliberately lenient (it tolerates comments and trailing
 * commas). That is a feature here: Tauri itself accepts several config dialects,
 * and refusing to analyze a file over a trailing comma would just hide real
 * issues. Anything the strict grammar would reject is recorded in
 * `syntaxWarnings` instead.
 *
 * Returns `undefined` only when the text yields no usable tree at all. Never
 * throws — a malformed config in someone's repo must not crash the analyzer.
 */
export function parseJsonDocument(text: string): ParsedDocument | undefined {
  let root: Node | undefined;
  const errors: ParseError[] = [];

  try {
    // Report deviations from strict JSON rather than silently accepting them:
    // Tauri loads plain .json with serde_json, which rejects trailing commas, so
    // a config we can read might still fail to load for the user. jsonc-parser is
    // error-tolerant and still returns a usable tree, so we get both the value
    // and the warning.
    root = parseTree(text, errors, { allowTrailingComma: false, disallowComments: false });
  } catch {
    return undefined;
  }

  if (root === undefined) return undefined;

  const lineIndex = new LineIndex(text);
  const syntaxWarnings = errors.map((error) => {
    const line = lineIndex.lineAt(error.offset);
    return `${printParseErrorCode(error.error)} at line ${String(line)}`;
  });

  let value: unknown;
  try {
    value = getNodeValue(root);
  } catch {
    return undefined;
  }

  return {
    value,
    locationPrecision: 'exact',
    syntaxWarnings,
    lineOf(path: DocPath): number {
      try {
        const node = findNodeAtLocation(root, [...path]);
        if (node === undefined) return 1;
        // Point at the property name rather than the value: for a multi-line
        // object or array the value's own offset is the opening brace, which is
        // what the reader wants to see anyway, but for a property we want the key.
        const anchor = node.parent?.type === 'property' ? node.parent : node;
        return lineIndex.lineAt(anchor.offset);
      } catch {
        return 1;
      }
    },
  };
}
