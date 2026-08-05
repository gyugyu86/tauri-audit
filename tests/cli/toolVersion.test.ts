import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { readToolVersion } from '../../src/cli/toolVersion.js';
import { formatSarif } from '../../src/cli/formatters/sarif.js';
import type { ReportMeta } from '../../src/cli/formatters/reportModel.js';

const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const declared = (
  JSON.parse(readFileSync(path.join(REPO, 'package.json'), 'utf8')) as { version: string }
).version;

describe('the tool reports its own version', () => {
  it('reads the published version, not the fallback', () => {
    // readToolVersion() swallows a read failure and answers '0.0.0' rather than
    // refusing to report findings over a version string. That branch must stay
    // unreachable in practice: without this, a broken path would silently make
    // every scan and every SARIF upload claim 0.0.0, and nothing would fail.
    expect(readToolVersion()).toBe(declared);
    expect(readToolVersion()).not.toBe('0.0.0');
  });

  it('puts the same version in SARIF as --version prints', () => {
    // These are the two places a version is published, and they disagreeing
    // would be worse than either being absent: a SARIF upload is how a scan
    // gets attributed to a tool build.
    const meta: ReportMeta = {
      rootDir: REPO,
      configsAnalyzed: 0,
      configsUnplaced: 0,
      capabilitiesAnalyzed: 0,
      filesUnparsable: 0,
      warnings: [],
    };
    const sarif = JSON.parse(formatSarif([], meta, { cwd: REPO })) as {
      runs: { tool: { driver: { version?: string } } }[];
    };

    expect(sarif.runs[0]?.tool.driver.version).toBe(readToolVersion());
  });
});

describe('--version on the built CLI', () => {
  // Runs dist/, so it covers the built artefact rather than the sources — the
  // version is resolved relative to the module, and dist/ nests differently
  // from src/. A path correct in one and wrong in the other is exactly the
  // mistake this catches.
  const CLI = path.join(REPO, 'dist', 'cli', 'index.js');

  it('prints the version and exits 0', () => {
    const stdout = execFileSync(process.execPath, [CLI, '--version'], { encoding: 'utf8' });
    expect(stdout.trim()).toBe(declared);
  });

  it('is listed in --help', () => {
    const stdout = execFileSync(process.execPath, [CLI, '--help'], { encoding: 'utf8' });
    expect(stdout).toContain('--version');
  });
});
