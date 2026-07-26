import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Ajv } from 'ajv';
import addFormatsModule from 'ajv-formats';
import { describe, expect, it } from 'vitest';

import { formatSarif, sarifGrading } from '../../src/cli/formatters/sarif.js';
import type { ReportMeta } from '../../src/cli/formatters/reportModel.js';
import type { Confidence, Finding, Severity } from '../../src/core/types.js';

const SARIF_SCHEMA_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'schemas',
  'sarif-2.1.0.json',
);

const ajv = new Ajv({ allErrors: true, strict: false, unicodeRegExp: false });
addFormatsModule.default(ajv);
const validateSarif = ajv.compile(JSON.parse(readFileSync(SARIF_SCHEMA_PATH, 'utf8')) as object);

const ROOT = '/project';

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
    ruleId: 'TA-CONF-002',
    severity: 'high',
    confidence: 'high',
    file: `${ROOT}/src-tauri/tauri.conf.json`,
    line: 12,
    target: 'app.security.dangerousDisableAssetCspModification is true',
    whyDangerous: 'Disables Tauri CSP injection.',
    recommendation: 'Remove the flag.',
    ...overrides,
  };
}

function parse(findings: Finding[], options?: Parameters<typeof formatSarif>[2]): {
  runs: {
    tool: { driver: { rules: { id: string; helpUri?: string; properties: Record<string, unknown> }[] } };
    automationDetails?: { id?: string };
    results: {
      ruleId: string;
      ruleIndex: number;
      level: string;
      message: { text: string };
      locations: { physicalLocation: { artifactLocation: { uri: string }; region: { startLine: number } } }[];
      properties: Record<string, unknown>;
    }[];
  }[];
} {
  return JSON.parse(formatSarif(findings, meta, { cwd: ROOT, ...options })) as never;
}

describe('SARIF conforms to the 2.1.0 schema', () => {
  it('validates with no findings', () => {
    const document = JSON.parse(formatSarif([], meta, { cwd: ROOT })) as unknown;
    expect(validateSarif(document), JSON.stringify(validateSarif.errors)).toBe(true);
  });

  it('validates across every severity and confidence combination', () => {
    const severities: Severity[] = ['critical', 'high', 'medium', 'low', 'info'];
    const confidences: Confidence[] = ['high', 'heuristic'];
    const findings = severities.flatMap((severity) =>
      confidences.map((confidence) =>
        finding({ severity, confidence, ruleId: `TA-${severity}-${confidence}` }),
      ),
    );

    const document = JSON.parse(formatSarif(findings, meta, { cwd: ROOT })) as unknown;
    expect(validateSarif(document), JSON.stringify(validateSarif.errors)).toBe(true);
  });

  it('validates with references present', () => {
    const document = JSON.parse(
      formatSarif([finding({ references: ['https://example.invalid/GHSA-x'] })], meta, {
        cwd: ROOT,
      }),
    ) as unknown;
    expect(validateSarif(document), JSON.stringify(validateSarif.errors)).toBe(true);
  });
});

describe('run.automationDetails.id', () => {
  it('is always set, so GitHub does not reject the delivery', () => {
    // Since 2025-07-22 GitHub rejects multiple runs sharing tool + category.
    expect(parse([finding()]).runs[0]?.automationDetails?.id).toBe('tauri-audit');
  });

  it('honours an explicit category', () => {
    expect(parse([finding()], { category: 'nightly' }).runs[0]?.automationDetails?.id).toBe(
      'nightly',
    );
  });
});

describe('references survive into the output', () => {
  const refs = ['https://example.invalid/GHSA-c9pr', 'https://nvd.example.invalid/CVE-2025-31477'];

  it('appears on both the rule descriptor and the result', () => {
    const document = parse([finding({ references: refs })]);
    expect(document.runs[0]?.tool.driver.rules[0]?.properties['references']).toEqual(refs);
    expect(document.runs[0]?.results[0]?.properties['references']).toEqual(refs);
  });

  it('uses the first reference as helpUri', () => {
    expect(parse([finding({ references: refs })]).runs[0]?.tool.driver.rules[0]?.helpUri).toBe(
      refs[0],
    );
  });

  it('omits the keys entirely when there are no references', () => {
    const rule = parse([finding()]).runs[0]?.tool.driver.rules[0];
    expect(rule?.helpUri).toBeUndefined();
    expect(rule?.properties['references']).toBeUndefined();
  });
});

describe('sarifGrading — the single grading function', () => {
  it('maps severity to level', () => {
    expect(sarifGrading('critical', 'high').level).toBe('error');
    expect(sarifGrading('high', 'high').level).toBe('error');
    expect(sarifGrading('medium', 'high').level).toBe('warning');
    expect(sarifGrading('low', 'high').level).toBe('note');
    expect(sarifGrading('info', 'high').level).toBe('note');
  });

  it('subtracts 2 from security-severity for heuristic findings', () => {
    expect(sarifGrading('critical', 'high').securitySeverity).toBe('9.0');
    expect(sarifGrading('critical', 'heuristic').securitySeverity).toBe('7.0');
    expect(sarifGrading('high', 'high').securitySeverity).toBe('7.0');
    expect(sarifGrading('high', 'heuristic').securitySeverity).toBe('5.0');
  });

  it('keeps a certain finding ranked above an uncertain one of the same severity', () => {
    for (const severity of ['critical', 'high', 'medium', 'low', 'info'] as Severity[]) {
      const certain = Number(sarifGrading(severity, 'high').securitySeverity);
      const uncertain = Number(sarifGrading(severity, 'heuristic').securitySeverity);
      expect(uncertain).toBeLessThan(certain);
    }
  });

  it('never produces a negative or zero score', () => {
    expect(Number(sarifGrading('info', 'heuristic').securitySeverity)).toBeGreaterThan(0);
  });
});

describe('result shape', () => {
  it('tags heuristic findings in the message text', () => {
    const document = parse([finding({ confidence: 'heuristic' })]);
    expect(document.runs[0]?.results[0]?.message.text).toMatch(/^\[heuristic\] /);
  });

  it('carries confidence in result properties', () => {
    expect(parse([finding({ confidence: 'heuristic' })]).runs[0]?.results[0]?.properties['confidence']).toBe(
      'heuristic',
    );
  });

  it('writes URIs relative to cwd with forward slashes', () => {
    const uri = parse([finding()]).runs[0]?.results[0]?.locations[0]?.physicalLocation
      .artifactLocation.uri;
    expect(uri).toBe('src-tauri/tauri.conf.json');
  });

  it('clamps a zero line to 1, since SARIF regions are 1-based', () => {
    const region = parse([finding({ line: 0 })]).runs[0]?.results[0]?.locations[0]
      ?.physicalLocation.region;
    expect(region?.startLine).toBe(1);
  });

  it('emits one rule descriptor per rule ID even with many findings', () => {
    const document = parse([finding(), finding({ line: 20 }), finding({ ruleId: 'TA-V1-001' })]);
    expect(document.runs[0]?.tool.driver.rules).toHaveLength(2);
    expect(document.runs[0]?.results).toHaveLength(3);
  });

  it('points every result at a rule descriptor that exists', () => {
    const document = parse([finding(), finding({ ruleId: 'TA-V1-001', severity: 'critical' })]);
    const rules = document.runs[0]?.tool.driver.rules ?? [];
    for (const result of document.runs[0]?.results ?? []) {
      expect(rules[result.ruleIndex]?.id).toBe(result.ruleId);
    }
  });
});
