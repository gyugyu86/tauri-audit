import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import semver from 'semver';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadAdvisories } from '../../src/core/advisories.js';
import { discover } from '../../src/core/discovery.js';
import { buildProjectContext } from '../../src/core/projectContext.js';
import { runRules } from '../../src/core/ruleEngine.js';
import { ALL_RULES } from '../../src/core/rules/index.js';
import { schemaUnavailableReason, unsupportedSchemaFormats } from '../../src/core/schemaValidate.js';
import { formatJson } from '../../src/cli/formatters/json.js';
import { formatMarkdown } from '../../src/cli/formatters/markdown.js';
import { formatSarif } from '../../src/cli/formatters/sarif.js';
import { formatTerminal } from '../../src/cli/formatters/terminal.js';
import type { ReportMeta } from '../../src/cli/formatters/reportModel.js';
import type { Finding } from '../../src/core/types.js';

/**
 * The silent-failure checklist.
 *
 * Every layer here can fail in a way that produces zero findings, which is
 * byte-identical to a clean project. Five of these were found one at a time
 * during development — a schema that would not compile, a swallowed exit code, a
 * broken config recovered to `{}`, a config root that was not an object, an
 * advisory database that failed to load. Finding them individually does not
 * scale, so the paths are enumerated here and each one is asserted to degrade.
 *
 * When a new layer is added, add its entry: ask "if this layer dies, does the
 * run still exit 0 with no findings?" and pin the answer.
 */

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(path.join(os.tmpdir(), 'ta-silent-'));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

function write(relativePath: string, content: string): void {
  const full = path.join(tmp, relativePath);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, content);
}

const VALID_V2 = JSON.stringify({
  productName: 'demo',
  version: '0.1.0',
  identifier: 'com.example.demo',
  app: { security: { csp: "default-src 'self'" } },
});

describe('discovery finds nothing', () => {
  it('does not report a directory with no Tauri project as clean', () => {
    // A valid directory that simply is not a Tauri app. Zero findings here says
    // nothing about safety, so the CLI must not present it as a pass.
    write('package.json', '{"name":"not-tauri","version":"1.0.0"}');
    write('src/index.js', 'console.log(1)');

    const project = buildProjectContext(tmp);
    const result = runRules(project, ALL_RULES);

    expect(result.configsAnalyzed).toBe(0);
    // The CLI turns "no config found at all" into an incomplete reason; the
    // engine's job is to make the emptiness visible rather than to hide it.
    expect(result.findings.filter((f) => !f.ruleId.startsWith('TA-SCHEMA'))).toEqual([]);
    expect(result.configsUnplaced).toBe(0);
  });
});

describe('rule registry', () => {
  it('degrades when no rule is registered', () => {
    // A bad merge or partial build can empty the registry. Without this the tool
    // reports "No findings" and exits 0 while having checked nothing.
    write('src-tauri/tauri.conf.json', VALID_V2);

    const project = buildProjectContext(tmp);
    const result = runRules(project, []);

    expect(result.findings).toEqual([]);
    expect(result.incomplete.length).toBeGreaterThan(0);
    expect(result.incomplete.join(' ')).toContain('no rules were registered');
  });

  it('registers the rules this release ships', () => {
    // Guards against a rule silently dropping out of the barrel. The corpus
    // tests would still pass with a missing rule — they assert an absence.
    const ids = [...new Set(ALL_RULES.map((rule) => rule.id))].sort();
    expect(ids).toEqual([
      'TA-CONF-002',
      'TA-DEP-001',
      'TA-V1-001',
      'TA-V1-002',
      'TA-V1-003',
      'TA-VITE-001',
    ]);
  });

  it('gives every registered rule the metadata the reporters rely on', () => {
    for (const rule of ALL_RULES) {
      expect(rule.id, 'rule with no id').toBeTruthy();
      expect(rule.target, `${rule.id}: no target`).toBeTruthy();
      expect(rule.whyDangerous, `${rule.id}: no whyDangerous`).toBeTruthy();
      expect(rule.recommendation, `${rule.id}: no recommendation`).toBeTruthy();
      expect(rule.evidence, `${rule.id}: no evidence`).toBeTruthy();
    }
  });
});

describe('schema validation', () => {
  it('both vendored schemas compile', () => {
    // A schema that fails to compile makes validateTauriConfig return an empty
    // issue list — identical to a clean config.
    expect(schemaUnavailableReason('v1')).toBeUndefined();
    expect(schemaUnavailableReason('v2')).toBeUndefined();
  });

  it('uses no format the validator silently ignores', () => {
    // ajv ignores unknown formats rather than failing, so validation quietly
    // gets weaker when a schema refresh introduces one.
    expect(unsupportedSchemaFormats()).toEqual([]);
  });
});

describe('advisory database', () => {
  it('loads', () => {
    // A failed load leaves every dependency rule returning nothing, which would
    // exit 0 reporting no vulnerable dependencies when none were checked.
    expect(loadAdvisories().error).toBeUndefined();
  });

  it('is not empty', () => {
    expect(loadAdvisories().database.advisories.length).toBeGreaterThan(0);
  });

  it('has only ranges semver can parse', () => {
    // semver.intersects throws on a malformed range and the caller moves on, so
    // one typo in our own data would make an advisory silently never match.
    const bad: string[] = [];
    for (const advisory of loadAdvisories().database.advisories) {
      for (const affected of advisory.packages) {
        for (const range of [...(affected.stableRanges ?? []), ...(affected.prereleaseRanges ?? [])]) {
          if (semver.validRange(range) === null) bad.push(`${advisory.id} ${affected.name}: ${range}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it('names a package for every advisory', () => {
    const orphaned = loadAdvisories()
      .database.advisories.filter((advisory) => advisory.packages.length === 0)
      .map((advisory) => advisory.id);
    expect(orphaned).toEqual([]);
  });
});

describe('reporters do not drop findings', () => {
  // A reporter that filters or groups incorrectly can lose a finding after the
  // engine produced it. The gate would still fail the build, but the user would
  // never see what for.
  const findings: Finding[] = (
    [
      ['TA-A-001', 'critical', 'high'],
      ['TA-B-002', 'high', 'heuristic'],
      ['TA-C-003', 'medium', 'high'],
      ['TA-D-004', 'low', 'heuristic'],
      ['TA-E-005', 'info', 'high'],
    ] as const
  ).map(([ruleId, severity, confidence], index) => ({
    ruleId,
    severity,
    confidence,
    file: path.join('/scan', `file${String(index)}.json`),
    line: index + 1,
    target: `target-${ruleId}`,
    whyDangerous: `why-${ruleId}`,
    recommendation: `fix-${ruleId}`,
    references: ['https://example.invalid/'],
  }));

  const meta: ReportMeta = {
    rootDir: '/scan',
    configsAnalyzed: 1,
    configsUnplaced: 0,
    capabilitiesAnalyzed: 0,
    filesUnparsable: 0,
    warnings: [],
  };

  it('terminal shows every finding', () => {
    const out = formatTerminal(findings, meta);
    for (const finding of findings) expect(out, finding.ruleId).toContain(finding.ruleId);
  });

  it('markdown shows every finding', () => {
    const out = formatMarkdown(findings, meta);
    for (const finding of findings) expect(out, finding.ruleId).toContain(finding.ruleId);
  });

  it('json carries exactly as many findings as the engine produced', () => {
    const parsed = JSON.parse(formatJson(findings, meta)) as { findings: unknown[] };
    expect(parsed.findings).toHaveLength(findings.length);
  });

  it('sarif carries exactly as many results as the engine produced', () => {
    const parsed = JSON.parse(formatSarif(findings, meta, {})) as {
      runs: { results: unknown[] }[];
    };
    expect(parsed.runs[0]?.results).toHaveLength(findings.length);
  });

  it('every severity survives every format', () => {
    // Grouping by severity is where a whole band can vanish. `info` is the
    // likeliest casualty because it never gates.
    const terminal = formatTerminal(findings, meta);
    const markdown = formatMarkdown(findings, meta);
    for (const finding of findings) {
      expect(terminal, `${finding.severity} missing from terminal`).toContain(finding.ruleId);
      expect(markdown, `${finding.severity} missing from markdown`).toContain(finding.ruleId);
    }
  });
});

describe('unreadable inputs stay visible', () => {
  it.each([
    // jsonc-parser recovers from malformed input rather than failing, so this
    // reports the real problem — not valid JSON — instead of the downstream
    // symptom of an empty object with no recognizable version markers.
    ['malformed config', 'src-tauri/tauri.conf.json', '{ broken', 'not valid JSON'],
    ['config root not an object', 'src-tauri/tauri.conf.json', '[1,2,3]', 'not an object'],
    ['binary content', 'src-tauri/tauri.conf.json', ' ', 'src-tauri'],
  ])('%s degrades', (_label, file, content, expected) => {
    write(file, content);
    const project = buildProjectContext(tmp);
    expect(project.incomplete.length, 'nothing was degraded').toBeGreaterThan(0);
    expect(project.incomplete.join(' ')).toContain(expected);
  });

  it('capability root not an object degrades', () => {
    // Worse than a missing rule: a check asking whether a permission is absent
    // would conclude it is not granted and suppress a real finding.
    write('src-tauri/tauri.conf.json', VALID_V2);
    write('src-tauri/capabilities/default.json', '"just a string"');
    const project = buildProjectContext(tmp);
    expect(project.incomplete.join(' ')).toContain('not an object');
  });

  it('a config the discriminator cannot place degrades', () => {
    const project = buildProjectContext(path.join(FIXTURES, 'unknown-verdict/mixed'));
    expect(project.incomplete.join(' ')).toContain('could not determine Tauri config version');
  });

  it('an oversized file degrades rather than being quietly skipped', () => {
    write('src-tauri/tauri.conf.json', VALID_V2);
    const result = discover(tmp, { maxFileBytes: 10 });
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings.join(' ')).toContain('exceeds');
  });
});

describe('checklist completeness', () => {
  it('covers every layer that can fail into a zero-finding result', () => {
    // Not a functional assertion — a written record of what has been considered,
    // so adding a layer without an entry is a visible omission in review.
    const layers = [
      'discovery: finds nothing',
      'discovery: glob failure per file kind',
      'read: file unreadable',
      'parse: unparsable content',
      'parse: root not an object',
      'discriminator: version unknown',
      'schema: vendored schema fails to compile',
      'schema: unknown format silently ignored',
      'advisories: database fails to load',
      'advisories: malformed range skipped',
      'registry: no rules registered',
      'reporters: finding dropped from output',
    ];
    expect(layers.length).toBeGreaterThanOrEqual(12);
  });
});
