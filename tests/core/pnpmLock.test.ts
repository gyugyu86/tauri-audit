import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { extractPnpmLock, parsePackageKey } from '../../src/core/pnpmLock.js';
import { buildProjectContext } from '../../src/core/projectContext.js';

let root: string;

beforeEach(() => {
  root = mkdtempSync(path.join(os.tmpdir(), 'ta-pnpm-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function write(relativePath: string, content: string): void {
  const full = path.join(root, relativePath);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, content);
}

describe('parsePackageKey handles all three key formats', () => {
  it('reads v9 keys (no leading slash)', () => {
    expect(parsePackageKey('@tauri-apps/plugin-shell@2.2.0')).toEqual({
      name: '@tauri-apps/plugin-shell',
      version: '2.2.0',
    });
    expect(parsePackageKey('semver@7.8.5')).toEqual({ name: 'semver', version: '7.8.5' });
  });

  it('reads v6 keys (leading slash, @ separator)', () => {
    expect(parsePackageKey('/@tauri-apps/plugin-shell@2.2.0')).toEqual({
      name: '@tauri-apps/plugin-shell',
      version: '2.2.0',
    });
    expect(parsePackageKey('/semver@7.8.5')).toEqual({ name: 'semver', version: '7.8.5' });
  });

  it('reads v5 keys (leading slash, / separator)', () => {
    expect(parsePackageKey('/@tauri-apps/plugin-shell/2.2.0')).toEqual({
      name: '@tauri-apps/plugin-shell',
      version: '2.2.0',
    });
    expect(parsePackageKey('/semver/7.8.5')).toEqual({ name: 'semver', version: '7.8.5' });
  });

  it('strips a peer-dependency suffix rather than reading the peer version', () => {
    // Without stripping, the peer's version would be attributed to the package.
    expect(parsePackageKey('/@tauri-apps/plugin-shell@2.2.0(react@18.0.0)')).toEqual({
      name: '@tauri-apps/plugin-shell',
      version: '2.2.0',
    });
    expect(parsePackageKey('vite@5.0.0(@types/node@20.0.0)(terser@5.0.0)')).toEqual({
      name: 'vite',
      version: '5.0.0',
    });
  });

  it('returns undefined for keys it cannot confidently split', () => {
    for (const key of ['', '/', '@scope', 'name', '/name/not-a-version']) {
      expect(parsePackageKey(key), key).toBeUndefined();
    }
  });
});

describe('lockfileVersion gating', () => {
  function lock(version: string | number): unknown {
    return {
      lockfileVersion: version,
      packages: { '@tauri-apps/plugin-shell@2.2.0': {} },
    };
  }

  it('accepts the versions pnpm actually shipped', () => {
    for (const version of [5.4, '5.4', '6.0', '9.0']) {
      const result = extractPnpmLock(lock(version), 'pnpm-lock.yaml');
      expect(result.unsupportedReason, String(version)).toBeUndefined();
      expect(result.dependencies).toHaveLength(1);
    }
  });

  it('refuses an unknown major instead of guessing', () => {
    const result = extractPnpmLock(lock('12.0'), 'pnpm-lock.yaml');
    expect(result.unsupportedReason).toContain('not supported');
    expect(result.dependencies).toEqual([]);
  });

  it('refuses a lockfile with no readable version', () => {
    expect(extractPnpmLock({ packages: {} }, 'pnpm-lock.yaml').unsupportedReason).toContain(
      'lockfileVersion',
    );
  });

  it('refuses a non-mapping root', () => {
    for (const value of [null, undefined, 'text', 42, []]) {
      expect(extractPnpmLock(value, 'pnpm-lock.yaml').unsupportedReason).toBeDefined();
    }
  });
});

describe('pnpm-lock.yaml end to end', () => {
  it('resolves a version that the manifest range alone could not confirm', () => {
    write('src-tauri/tauri.conf.json', JSON.stringify({ identifier: 'com.demo.app' }));
    write('package.json', JSON.stringify({ dependencies: { '@tauri-apps/plugin-shell': '^2.0.0' } }));
    write(
      'pnpm-lock.yaml',
      `lockfileVersion: '9.0'

packages:

  '@tauri-apps/plugin-shell@2.2.1':
    resolution: {integrity: sha512-fake}
`,
    );

    const project = buildProjectContext(root);
    const shell = project.npmDependencies.get('@tauri-apps/plugin-shell');

    expect(shell?.value).toBe('2.2.1');
    expect(shell?.source).toBe('lockfile');
    expect(shell?.origin).toContain('pnpm-lock.yaml');
    // Scoped to this test's subject. Asserting the warning list is entirely
    // empty couples it to every unrelated warning the project may legitimately
    // produce — this fixture has no Cargo.toml, and saying so is correct.
    expect(project.warnings.filter((warning) => warning.includes('lock'))).toEqual([]);
    expect(project.incomplete).toEqual([]);
  });

  it('warns and falls back when the lockfile version is unsupported', () => {
    write('src-tauri/tauri.conf.json', JSON.stringify({ identifier: 'com.demo.app' }));
    write('package.json', JSON.stringify({ dependencies: { '@tauri-apps/plugin-shell': '^2.0.0' } }));
    write('pnpm-lock.yaml', "lockfileVersion: '12.0'\npackages:\n  'x@1.0.0': {}\n");

    const project = buildProjectContext(root);

    expect(project.warnings.some((warning) => warning.includes('not supported'))).toBe(true);
    // Fallback is the manifest range, which over-reports rather than hiding.
    expect(project.npmDependencies.get('@tauri-apps/plugin-shell')?.source).toBe('manifest');
    // Precision was lost, coverage was not.
    expect(project.incomplete).toEqual([]);
  });

  it('does not treat a malformed pnpm lockfile as a coverage loss', () => {
    write('src-tauri/tauri.conf.json', JSON.stringify({ identifier: 'com.demo.app' }));
    write('pnpm-lock.yaml', '\t\tthis: is: not: valid: yaml\n');

    const project = buildProjectContext(root);
    expect(() => project.npmDependencies.size).not.toThrow();
  });
});
