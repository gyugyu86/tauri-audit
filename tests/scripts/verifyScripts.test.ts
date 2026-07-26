import { execFileSync } from 'node:child_process';
import { rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * The verification scripts are themselves verified.
 *
 * Both gates guard something irreversible — publishing a repository. A gate that
 * cannot fail is worse than no gate, because it is trusted. The corpus checksum
 * was proven to detect a modification when it was written; the trace scanner was
 * not, and it was then bypassed for real by a shell mistake that read the wrong
 * exit code. So each one now has to demonstrate it says no.
 */
function run(script: string[]): number {
  try {
    execFileSync(script[0] ?? '', script.slice(1), {
      cwd: REPO,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return 0;
  } catch (error) {
    return (error as { status?: number }).status ?? -1;
  }
}

const TRACES = ['bash', 'scripts/check-authorship-traces.sh'];
const CORPUS = [process.execPath, 'scripts/corpus-checksums.mjs'];

const PLANTED = path.join(REPO, 'src', 'core', '__trace_probe__.ts');

/**
 * The probe text, assembled at runtime.
 *
 * Writing it as a literal would put a real match into this file, and the scanner
 * would then flag its own test — which it did, immediately after the gate was
 * made reliable. Adding another exclusion would have been the easy fix and the
 * wrong one: every exclusion narrows the net the scanner casts over authored
 * code. Building the string instead keeps the scan at full breadth.
 */
const PROBE = `// generated with ${['Cla', 'ude', ' Code'].join('')}\nexport const probe = 1;\n`;

afterEach(() => {
  rmSync(PLANTED, { force: true });
  try {
    execFileSync('git', ['rm', '-qf', '--cached', '--ignore-unmatch', PLANTED], {
      cwd: REPO,
      stdio: 'ignore',
    });
  } catch {
    // Nothing staged; the file simply never made it into the index.
  }
});

describe('authorship-trace scanner', () => {
  it('passes on the current tree', () => {
    expect(run(TRACES)).toBe(0);
  });

  it('fails when a trace is planted in authored code', () => {
    // `git grep` only sees tracked content, so the probe has to be staged for
    // this to exercise the real path rather than a file the scanner never looks at.
    writeFileSync(PLANTED, PROBE);
    execFileSync('git', ['add', '-f', PLANTED], { cwd: REPO, stdio: 'ignore' });

    expect(run(TRACES)).toBe(1);
  });

  it('still scans the directories that matter', () => {
    // The scanner excludes tests/corpus/ and itself. Those exclusions must not
    // have widened to cover the code this project actually writes.
    const excluded = execFileSync('grep', ['-c', 'exclude', 'scripts/check-authorship-traces.sh'], {
      cwd: REPO,
      encoding: 'utf8',
    });
    expect(Number(excluded.trim())).toBeLessThanOrEqual(3);

    writeFileSync(PLANTED, PROBE);
    execFileSync('git', ['add', '-f', PLANTED], { cwd: REPO, stdio: 'ignore' });
    // src/ is authored code and must remain in scope.
    expect(run(TRACES)).toBe(1);
  });
});

describe('corpus integrity checker', () => {
  it('passes on the current tree', () => {
    expect(run(CORPUS)).toBe(0);
  });

  it('fails when a vendored file is modified', () => {
    const victim = path.join(
      REPO,
      'tests',
      'corpus',
      'clean',
      'pomotroid',
      'src-tauri',
      'tauri.conf.json',
    );
    const original = execFileSync('cat', [victim], { encoding: 'utf8' });
    try {
      writeFileSync(victim, `${original}\n`);
      expect(run(CORPUS)).toBe(1);
    } finally {
      writeFileSync(victim, original);
    }
    expect(run(CORPUS)).toBe(0);
  });
});
