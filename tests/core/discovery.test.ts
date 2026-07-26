import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { discover, type FileKind } from '../../src/core/discovery.js';

let root: string;

beforeEach(() => {
  root = mkdtempSync(path.join(os.tmpdir(), 'ta-discovery-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function write(relativePath: string, content = '{}'): string {
  const full = path.join(root, relativePath);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, content);
  return full;
}

/** Discovered paths relative to the scan root, for readable assertions. */
function found(): string[] {
  return discover(root).files.map((file) => path.relative(root, file.path));
}

function kindOf(relativePath: string): FileKind | undefined {
  const target = path.join(root, relativePath);
  return discover(root).files.find((file) => file.path === target)?.kind;
}

describe('discover', () => {
  it('finds a conventional src-tauri layout', () => {
    write('src-tauri/tauri.conf.json');
    write('src-tauri/capabilities/default.json');
    write('src-tauri/Cargo.toml', 'a = 1');
    write('package.json');
    write('vite.config.ts', 'export default {}');

    expect(found().sort()).toEqual(
      [
        'package.json',
        'src-tauri/Cargo.toml',
        'src-tauri/capabilities/default.json',
        'src-tauri/tauri.conf.json',
        'vite.config.ts',
      ].sort(),
    );
  });

  it('classifies each file kind', () => {
    write('src-tauri/tauri.conf.json');
    write('src-tauri/capabilities/main.json');
    write('src-tauri/Cargo.toml', 'a = 1');
    write('package.json');
    write('vite.config.mts', 'export default {}');

    expect(kindOf('src-tauri/tauri.conf.json')).toBe('tauri-config');
    expect(kindOf('src-tauri/capabilities/main.json')).toBe('capability');
    expect(kindOf('src-tauri/Cargo.toml')).toBe('cargo-manifest');
    expect(kindOf('package.json')).toBe('package-manifest');
    expect(kindOf('vite.config.mts')).toBe('vite-config');
  });

  it('finds platform overlay configs and alternative dialects', () => {
    write('src-tauri/tauri.conf.json');
    write('src-tauri/tauri.macos.conf.json');
    write('src-tauri/tauri.windows.conf.json');
    write('src-tauri/tauri.conf.json5', '{a:1}');
    write('src-tauri/Tauri.toml', 'a = 1');

    const configs = discover(root).files.filter((file) => file.kind === 'tauri-config');
    expect(configs).toHaveLength(5);
  });

  it('finds multiple apps in one repo with no src-tauri directory', () => {
    // yaak's real shape: two Tauri apps under crates-tauri/, each with its own
    // capabilities. Anchoring discovery to src-tauri/ would find nothing here.
    write('crates-tauri/yaak-app-client/tauri.conf.json');
    write('crates-tauri/yaak-app-client/capabilities/default.json');
    write('crates-tauri/yaak-app-proxy/tauri.conf.json');
    write('crates-tauri/yaak-app-proxy/capabilities/default.json');

    const configs = discover(root).files.filter((file) => file.kind === 'tauri-config');
    expect(configs).toHaveLength(2);
    const capabilities = discover(root).files.filter((file) => file.kind === 'capability');
    expect(capabilities).toHaveLength(2);
  });

  it('ignores vendored and generated directories', () => {
    write('src-tauri/tauri.conf.json');
    // Both of these contain other projects' configs; attributing them to this
    // project would be a false positive with someone else's settings.
    write('node_modules/some-dep/src-tauri/tauri.conf.json');
    write('src-tauri/target/debug/tauri.conf.json');
    write('dist/tauri.conf.json');
    write('build/tauri.conf.json');

    expect(found()).toEqual(['src-tauri/tauri.conf.json']);
  });

  it('skips oversized files and says so', () => {
    write('src-tauri/tauri.conf.json', ' '.repeat(5000));

    const result = discover(root, { maxFileBytes: 1000 });

    expect(result.files).toHaveLength(0);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('tauri.conf.json');
    expect(result.warnings[0]).toContain('exceeds');
  });

  it('does not follow a symlink that escapes the scan root', () => {
    const outside = mkdtempSync(path.join(os.tmpdir(), 'ta-outside-'));
    try {
      writeFileSync(path.join(outside, 'tauri.conf.json'), '{"tauri":{"allowlist":{"all":true}}}');
      mkdirSync(path.join(root, 'src-tauri'), { recursive: true });
      symlinkSync(path.join(outside, 'tauri.conf.json'), path.join(root, 'src-tauri', 'tauri.conf.json'));

      expect(found()).toEqual([]);
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it('returns an empty result for a directory with nothing relevant', () => {
    write('README.md', '# hi');
    const result = discover(root);
    expect(result.files).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it('reports the resolved absolute root', () => {
    expect(discover(root).rootDir).toBe(path.resolve(root));
  });
});
