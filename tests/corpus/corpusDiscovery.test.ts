import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { detectConfigVersion } from '../../src/core/configVersion.js';
import { discover, readDiscoveredFile } from '../../src/core/discovery.js';
import { parseConfigDocument } from '../../src/core/parse/index.js';
import type { TauriConfigVersion } from '../../src/core/types.js';

const CORPUS_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)));

/**
 * Real, unmodified configuration files from real Tauri apps.
 *
 * `clean/` and `true-positive/` are separated on purpose: `clean/` apps must
 * produce no gating findings, `true-positive/` apps are expected to trip rules.
 * Mixing them would make the FP=0 assertion meaningless. See each directory's
 * PROVENANCE.md for source, commit and license.
 */
interface CorpusApp {
  group: 'clean' | 'true-positive';
  name: string;
  /** Expected version verdict for every tauri config found in this app. */
  expect: TauriConfigVersion;
  configCount: number;
  capabilityCount: number;
}

const APPS: readonly CorpusApp[] = [
  { group: 'clean', name: 'surrealist', expect: 'v2', configCount: 1, capabilityCount: 1 },
  { group: 'clean', name: 'ecopaste', expect: 'v2', configCount: 1, capabilityCount: 2 },
  // Two Tauri apps in one repo, neither under src-tauri/.
  { group: 'clean', name: 'yaak', expect: 'v2', configCount: 2, capabilityCount: 2 },
  { group: 'clean', name: 'tauri-helloworld-v1', expect: 'v1', configCount: 1, capabilityCount: 0 },
  { group: 'clean', name: 'tauri-isolation-v1', expect: 'v1', configCount: 1, capabilityCount: 0 },
  { group: 'true-positive', name: 'tauri-api-v1', expect: 'v1', configCount: 1, capabilityCount: 0 },
];

function analyze(app: CorpusApp) {
  const root = path.join(CORPUS_ROOT, app.group, app.name);
  const result = discover(root);

  const configs = result.files.filter((file) => file.kind === 'tauri-config');
  const capabilities = result.files.filter((file) => file.kind === 'capability');

  const verdicts = configs.map((file) => {
    const text = readDiscoveredFile(file.path);
    expect(text, `unreadable: ${file.path}`).toBeDefined();
    const doc = parseConfigDocument(file.path, text ?? '');
    expect(doc, `unparsable: ${file.path}`).toBeDefined();
    return {
      file: path.relative(root, file.path),
      verdict: detectConfigVersion(doc?.value),
      doc,
    };
  });

  return { root, result, configs, capabilities, verdicts };
}

describe.each(APPS)('corpus: $group/$name', (app) => {
  it(`discovers ${String(app.configCount)} tauri config(s) and ${String(app.capabilityCount)} capability file(s)`, () => {
    const { configs, capabilities } = analyze(app);
    expect(configs).toHaveLength(app.configCount);
    expect(capabilities).toHaveLength(app.capabilityCount);
  });

  it(`classifies every config as ${app.expect}`, () => {
    const { verdicts } = analyze(app);
    for (const { file, verdict } of verdicts) {
      expect(verdict.version, `${file}: ${verdict.reason}`).toBe(app.expect);
    }
  });

  it('parses every config without syntax complaints', () => {
    // A real shipped config should be valid JSON. If this ever fails, either the
    // upstream project shipped something odd or our parser regressed — both are
    // worth knowing about.
    const { verdicts } = analyze(app);
    for (const { file, doc } of verdicts) {
      expect(doc?.syntaxWarnings, file).toEqual([]);
    }
  });
});

describe('corpus integrity', () => {
  it('never classifies a real config as unknown', () => {
    // The discriminator is allowed to answer `unknown`, but not for a genuine,
    // unmodified config from a shipped app. If this fails, the discriminator has
    // a blind spot and rules would silently stop running for that project.
    const unknowns: string[] = [];
    for (const app of APPS) {
      for (const { file, verdict } of analyze(app).verdicts) {
        if (verdict.version === 'unknown') {
          unknowns.push(`${app.group}/${app.name}/${file}: ${verdict.reason}`);
        }
      }
    }
    expect(unknowns).toEqual([]);
  });

  it('covers both config generations', () => {
    expect(APPS.some((app) => app.expect === 'v1')).toBe(true);
    expect(APPS.some((app) => app.expect === 'v2')).toBe(true);
  });
});
