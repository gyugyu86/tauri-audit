import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildProjectContext } from '../../src/core/projectContext.js';

let root: string;

beforeEach(() => {
  root = mkdtempSync(path.join(os.tmpdir(), 'ta-deps-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function write(relativePath: string, content: string): void {
  const full = path.join(root, relativePath);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, content);
}

const CARGO_MANIFEST = `[dependencies]
tauri = { version = "2.10.3", features = [] }
tauri-plugin-shell = "2.2.0"
`;

/** What Cargo actually installed for the manifest above. */
const CARGO_LOCK = `version = 3

[[package]]
name = "tauri"
version = "2.10.3"

[[package]]
name = "tauri-plugin-shell"
version = "2.2.1"
`;

describe('a lockfile beats a manifest', () => {
  it('reads the resolved version from Cargo.lock', () => {
    write('src-tauri/Cargo.toml', CARGO_MANIFEST);
    write('src-tauri/Cargo.lock', CARGO_LOCK);

    const shell = buildProjectContext(root).cargoDependencies.get('tauri-plugin-shell');

    // The manifest says "2.2.0" (meaning ^2.2.0); the lockfile says 2.2.1 is
    // installed. Reporting the manifest value here would flag a patched project.
    expect(shell?.value).toBe('2.2.1');
    expect(shell?.source).toBe('lockfile');
    expect(shell?.origin).toContain('Cargo.lock');
  });

  it('falls back to the manifest when no lockfile exists', () => {
    write('src-tauri/Cargo.toml', CARGO_MANIFEST);

    const shell = buildProjectContext(root).cargoDependencies.get('tauri-plugin-shell');

    expect(shell?.value).toBe('2.2.0');
    expect(shell?.source).toBe('manifest');
    expect(shell?.origin).toContain('Cargo.toml');
  });

  it('reads resolved versions from a v3 package-lock.json', () => {
    write('package.json', JSON.stringify({ dependencies: { '@tauri-apps/plugin-shell': '^2.0.0' } }));
    write(
      'package-lock.json',
      JSON.stringify({
        lockfileVersion: 3,
        packages: {
          '': { name: 'demo' },
          'node_modules/@tauri-apps/plugin-shell': { version: '2.2.1' },
        },
      }),
    );

    const shell = buildProjectContext(root).npmDependencies.get('@tauri-apps/plugin-shell');
    expect(shell?.value).toBe('2.2.1');
    expect(shell?.source).toBe('lockfile');
  });

  it('reads resolved versions from a v1 package-lock.json', () => {
    write('package.json', JSON.stringify({ dependencies: { '@tauri-apps/cli': '^1.0.0' } }));
    write(
      'package-lock.json',
      JSON.stringify({
        lockfileVersion: 1,
        dependencies: { '@tauri-apps/cli': { version: '1.5.6' } },
      }),
    );

    const cli = buildProjectContext(root).npmDependencies.get('@tauri-apps/cli');
    expect(cli?.value).toBe('1.5.6');
    expect(cli?.source).toBe('lockfile');
  });
});

describe('duplicate lockfile entries resolve conservatively', () => {
  it('keeps the lower version when npm hoists one copy and nests another', () => {
    // Both copies are genuinely installed. Keeping the higher one would hide a
    // vulnerable copy that is really on disk.
    write('package.json', JSON.stringify({ dependencies: { '@tauri-apps/plugin-shell': '^2.0.0' } }));
    write(
      'package-lock.json',
      JSON.stringify({
        lockfileVersion: 3,
        packages: {
          '': { name: 'demo' },
          'node_modules/@tauri-apps/plugin-shell': { version: '2.2.1' },
          'node_modules/some-dep/node_modules/@tauri-apps/plugin-shell': { version: '2.2.0' },
        },
      }),
    );

    const shell = buildProjectContext(root).npmDependencies.get('@tauri-apps/plugin-shell');
    expect(shell?.value).toBe('2.2.0');
    expect(shell?.source).toBe('lockfile');
  });

  it('is order independent', () => {
    write(
      'package-lock.json',
      JSON.stringify({
        lockfileVersion: 3,
        packages: {
          'node_modules/a/node_modules/tauri-thing': { version: '1.0.0' },
          'node_modules/tauri-thing': { version: '9.9.9' },
        },
      }),
    );
    expect(buildProjectContext(root).npmDependencies.get('tauri-thing')?.value).toBe('1.0.0');
  });
});

describe('Cargo.lock is analyzable', () => {
  it('does not degrade the run', () => {
    // Cargo.lock is TOML behind a .lock extension. Dispatching on extension
    // alone made it unparsable, which failed the build for every Rust project.
    write('src-tauri/tauri.conf.json', JSON.stringify({ identifier: 'com.demo.app' }));
    write('src-tauri/Cargo.toml', CARGO_MANIFEST);
    write('src-tauri/Cargo.lock', CARGO_LOCK);

    const project = buildProjectContext(root);

    expect(project.incomplete).toEqual([]);
    expect(project.filesUnparsable).toBe(0);
  });
});

describe('unsupported lockfile formats', () => {
  // yarn v1 uses a bespoke format and bun's is partly binary; neither is parsed
  // yet. pnpm IS supported — see pnpmLock.test.ts.
  it.each(['yarn.lock', 'bun.lockb'])('warns without claiming lost coverage: %s', (lockfile) => {
    // Falling back to manifest ranges over-reports rather than under-reports, so
    // nothing is hidden — the run is less precise, not less complete.
    write('src-tauri/tauri.conf.json', JSON.stringify({ identifier: 'com.demo.app' }));
    write('package.json', JSON.stringify({ dependencies: { '@tauri-apps/plugin-shell': '^2.0.0' } }));
    write(lockfile, '# opaque to us\n');

    const project = buildProjectContext(root);

    expect(project.warnings.some((warning) => warning.includes('not supported'))).toBe(true);
    expect(project.incomplete).toEqual([]);
    expect(project.npmDependencies.get('@tauri-apps/plugin-shell')?.source).toBe('manifest');
  });
});
