import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { formatJson } from '../../src/cli/formatters/json.js';
import { formatMarkdown } from '../../src/cli/formatters/markdown.js';
import {
  countBySeverity,
  groupFindings,
  orderedFindings,
  relativize,
  type ReportMeta,
} from '../../src/cli/formatters/reportModel.js';
import { formatTerminal } from '../../src/cli/formatters/terminal.js';
import { buildProjectContext } from '../../src/core/projectContext.js';
import type { Finding, Severity } from '../../src/core/types.js';

const ROOT = path.resolve('/project');

const meta: ReportMeta = {
  rootDir: ROOT,
  configsAnalyzed: 1,
  configsUnplaced: 0,
  capabilitiesAnalyzed: 0,
  filesUnparsable: 0,
  warnings: [],
};

function finding(overrides: Partial<Finding> = {}): Finding {
  return {
    ruleId: 'TA-TEST-001',
    severity: 'high',
    confidence: 'high',
    file: path.join(ROOT, 'src-tauri', 'tauri.conf.json'),
    line: 5,
    target: 'target text',
    whyDangerous: 'why text',
    recommendation: 'fix text',
    ...overrides,
  };
}

describe('reportModel neither adds nor drops findings', () => {
  it('orders without changing the set', () => {
    const findings = [
      finding({ severity: 'info', ruleId: 'A' }),
      finding({ severity: 'critical', ruleId: 'B' }),
      finding({ severity: 'medium', ruleId: 'C' }),
    ];
    const ordered = orderedFindings(findings, ROOT);
    expect(ordered).toHaveLength(3);
    expect(ordered.map((f) => f.ruleId)).toEqual(['B', 'C', 'A']);
    // The input must not be mutated — JSON output reads the original array.
    expect(findings.map((f) => f.ruleId)).toEqual(['A', 'B', 'C']);
  });

  it('ranks certain above uncertain within the same severity', () => {
    const ordered = orderedFindings(
      [
        finding({ ruleId: 'HEUR', confidence: 'heuristic' }),
        finding({ ruleId: 'CERT', confidence: 'high' }),
      ],
      ROOT,
    );
    expect(ordered.map((f) => f.ruleId)).toEqual(['CERT', 'HEUR']);
  });

  it('is deterministic for identical severities and confidences', () => {
    const findings = [
      finding({ ruleId: 'Z', line: 2 }),
      finding({ ruleId: 'A', line: 2 }),
      finding({ ruleId: 'M', line: 1 }),
    ];
    expect(orderedFindings(findings, ROOT).map((f) => f.ruleId)).toEqual(['M', 'A', 'Z']);
  });

  it('groups by location while preserving every finding', () => {
    const groups = groupFindings(
      [finding({ ruleId: 'A' }), finding({ ruleId: 'B' }), finding({ ruleId: 'C', line: 9 })],
      ROOT,
    );
    expect(groups).toHaveLength(2);
    expect(groups.flatMap((group) => group.findings)).toHaveLength(3);
  });

  it('counts by severity', () => {
    expect(countBySeverity([finding({ severity: 'low' }), finding({ severity: 'low' })])).toEqual({
      critical: 0,
      high: 0,
      medium: 0,
      low: 2,
      info: 0,
    });
  });
});

describe('paths are relative in every output', () => {
  const severities: Severity[] = ['critical', 'info'];

  it('relativizes against the scan root', () => {
    expect(relativize(path.join(ROOT, 'a', 'b.json'), ROOT)).toBe(path.join('a', 'b.json'));
  });

  it('never leaks an absolute path into JSON', () => {
    const output = formatJson(
      severities.map((severity) => finding({ severity })),
      meta,
    );
    expect(output).not.toContain(ROOT);
    expect(output).toContain('src-tauri');
  });

  it('never leaks an absolute path into Markdown', () => {
    const output = formatMarkdown([finding()], meta);
    expect(output).not.toContain(ROOT);
  });

  it('never leaks an absolute path into terminal output', () => {
    const output = formatTerminal([finding()], meta);
    expect(output).not.toContain(ROOT);
  });
});

describe('formatJson', () => {
  it('is parseable and carries a pinned schemaVersion', () => {
    const parsed = JSON.parse(formatJson([finding()], meta)) as {
      tool: string;
      schemaVersion: number;
      summary: { total: number };
      findings: { references: string[] }[];
    };
    expect(parsed.tool).toBe('tauri-audit');
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.summary.total).toBe(1);
  });

  it('always emits references as an array, even when absent', () => {
    const parsed = JSON.parse(formatJson([finding()], meta)) as {
      findings: { references: string[] }[];
    };
    expect(parsed.findings[0]?.references).toEqual([]);
  });

  it('round-trips references when present', () => {
    const refs = ['https://example.invalid/a', 'https://example.invalid/b'];
    const parsed = JSON.parse(formatJson([finding({ references: refs })], meta)) as {
      findings: { references: string[] }[];
    };
    expect(parsed.findings[0]?.references).toEqual(refs);
  });
});

describe('formatMarkdown', () => {
  it('marks heuristic findings visibly', () => {
    expect(formatMarkdown([finding({ confidence: 'heuristic' })], meta)).toContain('`[heuristic]`');
  });

  it('does not mark high-confidence findings', () => {
    expect(formatMarkdown([finding({ confidence: 'high' })], meta)).not.toContain('[heuristic]');
  });

  it('says so plainly when there is nothing to report', () => {
    expect(formatMarkdown([], meta)).toContain('No findings.');
  });

  it('renders warnings in their own section', () => {
    const output = formatMarkdown([], { ...meta, warnings: ['something degraded'] });
    expect(output).toContain('## Warnings');
    expect(output).toContain('something degraded');
  });
});

describe('formatTerminal', () => {
  it('tags heuristic findings and explains they do not gate', () => {
    const output = formatTerminal([finding({ confidence: 'heuristic' })], meta);
    expect(output).toContain('[heuristic]');
    expect(output).toContain('not counted toward the exit code');
  });

  it('omits the heuristic note when every finding is certain', () => {
    expect(formatTerminal([finding()], meta)).not.toContain('not counted toward');
  });

  it('reports an empty run clearly', () => {
    expect(formatTerminal([], meta)).toContain('No findings.');
  });
});

describe('warnings carry relative paths', () => {
  it('names a malformed config relative to the scan root', () => {
    // Absolute paths in warnings leak the machine layout into CI artifacts and
    // make identical reports differ between machines.
    const root = mkdtempSync(path.join(os.tmpdir(), 'ta-warn-'));
    try {
      mkdirSync(path.join(root, 'src-tauri'), { recursive: true });
      writeFileSync(path.join(root, 'src-tauri', 'tauri.conf.json'), '{ broken');

      const project = buildProjectContext(root);

      expect(project.warnings.length).toBeGreaterThan(0);
      for (const warning of project.warnings) {
        expect(warning).not.toContain(root);
      }
      expect(project.warnings.some((w) => w.includes(path.join('src-tauri', 'tauri.conf.json')))).toBe(
        true,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('collapses a repeated parse complaint instead of listing it many times', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'ta-warn2-'));
    try {
      writeFileSync(path.join(root, 'tauri.conf.json'), '{ this is not json');
      const warning = buildProjectContext(root).warnings.find((w) => w.includes('not valid JSON'));
      expect(warning).toBeDefined();
      expect(warning).toMatch(/x\d+/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
