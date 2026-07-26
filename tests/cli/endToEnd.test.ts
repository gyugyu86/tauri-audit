import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { computeExitCode, resolveFailMode } from '../../src/cli/exitCode.js';
import { buildProjectContext } from '../../src/core/projectContext.js';
import { runRules } from '../../src/core/ruleEngine.js';
import { ALL_RULES } from '../../src/core/rules/index.js';

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CLI = path.join(REPO_ROOT, 'dist', 'cli', 'index.js');

let root: string;

beforeEach(() => {
  root = mkdtempSync(path.join(os.tmpdir(), 'ta-e2e-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function write(relativePath: string, content: string): void {
  const full = path.join(root, relativePath);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, content);
}

const VALID_V2 = JSON.stringify({
  productName: 'demo',
  version: '0.1.0',
  identifier: 'com.demo.app',
  app: { security: { csp: "default-src 'self'" } },
});

const MINIMAL_CARGO = `[package]
name = "demo"
version = "0.1.0"

[dependencies]
tauri = "2"
`;

/** The same composition the CLI performs, without commander in the way. */
function audit(options: { strict?: boolean; fail?: boolean } = {}): {
  exitCode: number;
  incomplete: string[];
} {
  const result = runRules(buildProjectContext(root), ALL_RULES);
  return {
    exitCode: computeExitCode(result.findings, resolveFailMode(options), result.incomplete),
    incomplete: result.incomplete,
  };
}

describe('a project with a broken config is never reported as clean', () => {
  it('does not exit 0 when a config is malformed JSON', () => {
    write('src-tauri/tauri.conf.json', '{ this is not json');

    const { exitCode, incomplete } = audit();

    expect(incomplete.length).toBeGreaterThan(0);
    expect(exitCode).not.toBe(0);
    expect(exitCode).toBe(2);
  });

  it('does not exit 0 when a config version cannot be determined', () => {
    write('src-tauri/tauri.conf.json', JSON.stringify({ tauri: {}, app: {} }));

    expect(audit().exitCode).toBe(2);
  });

  it('does not exit 0 when no Tauri config exists at all', () => {
    // Handled by the CLI layer, so assert on the real binary below too.
    write('README.md', '# not a tauri project');

    const result = runRules(buildProjectContext(root), ALL_RULES);
    expect(result.configsAnalyzed).toBe(0);
  });

  it('still exits 2 under --no-fail', () => {
    write('src-tauri/tauri.conf.json', '{ this is not json');
    expect(audit({ fail: false }).exitCode).toBe(2);
  });

  it('exits 0 for a valid config with nothing to report', () => {
    write('src-tauri/tauri.conf.json', VALID_V2);
    // A Tauri application is a Rust crate, so a directory holding only a
    // tauri.conf.json is not one — it cannot build. Without a manifest the run
    // correctly reports that no dependency was checked, which is a different
    // outcome from the one under test here.
    write('src-tauri/Cargo.toml', MINIMAL_CARGO);

    const { exitCode, incomplete } = audit();

    expect(incomplete).toEqual([]);
    expect(exitCode).toBe(0);
  });

  it('one broken config among several valid ones still degrades the whole run', () => {
    write('apps/good/tauri.conf.json', VALID_V2);
    write('apps/bad/tauri.conf.json', '{ broken');

    expect(audit().exitCode).toBe(2);
  });
});

/**
 * The same assertions against the real built binary.
 *
 * Skipped when `dist/` is absent, so `npm test` still works before a build. That
 * convenience must not extend to CI: if the build step were ever reordered or
 * dropped, these would skip and the pipeline would stay green while nothing had
 * exercised the shipped binary. In CI a missing build is a failure, not a skip.
 */
const BUILT = existsSync(CLI);

describe('built CLI binary is available to test', () => {
  it.skipIf(process.env['CI'] === undefined)('dist/ exists in CI', () => {
    expect(BUILT, 'dist/ is missing — run `npm run build` before `npm test`').toBe(true);
  });
});

describe.skipIf(!BUILT)('built CLI binary', () => {
  function run(args: string[]): { status: number; stdout: string; stderr: string } {
    try {
      const stdout = execFileSync(process.execPath, [CLI, ...args], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      return { status: 0, stdout, stderr: '' };
    } catch (error) {
      const failure = error as { status?: number; stdout?: string; stderr?: string };
      return {
        status: failure.status ?? -1,
        stdout: failure.stdout ?? '',
        stderr: failure.stderr ?? '',
      };
    }
  }

  it('exits 2 and explains itself on a malformed config', () => {
    write('src-tauri/tauri.conf.json', '{ this is not json');

    const { status, stderr } = run([root]);

    expect(status).toBe(2);
    expect(stderr).toContain('not valid JSON');
    expect(stderr).toContain('does not mean this project is clean');
  });

  it('exits 2 when pointed at a directory with no Tauri project', () => {
    write('README.md', '# nothing here');

    const { status, stderr } = run([root]);

    expect(status).toBe(2);
    expect(stderr).toContain('no Tauri configuration found');
  });

  it('exits 2 on a malformed config even with --no-fail', () => {
    write('src-tauri/tauri.conf.json', '{ broken');
    expect(run([root, '--no-fail']).status).toBe(2);
  });

  it('exits 0 on a valid config', () => {
    write('src-tauri/tauri.conf.json', VALID_V2);
    write('src-tauri/Cargo.toml', MINIMAL_CARGO);
    expect(run([root]).status).toBe(0);
  });

  it('exits 2 for an operational error regardless of --no-fail', () => {
    expect(run([path.join(root, 'does-not-exist'), '--no-fail']).status).toBe(2);
  });

  it('keeps stdout valid JSON while degrading on stderr', () => {
    write('src-tauri/tauri.conf.json', '{ broken');

    const { stdout, status } = run([root, '--json']);

    expect(status).toBe(2);
    expect(() => JSON.parse(stdout) as unknown).not.toThrow();
  });
});
