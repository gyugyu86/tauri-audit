import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Ajv } from 'ajv';
import addFormatsModule from 'ajv-formats';
import { describe, expect, it } from 'vitest';

import { formatSarif, sarifGrading } from '../../src/cli/formatters/sarif.js';
import type { ReportMeta } from '../../src/cli/formatters/reportModel.js';
import type { Confidence, Finding, Severity } from '../../src/core/types.js';
import { buildProjectContext } from '../../src/core/projectContext.js';
import { runRules } from '../../src/core/ruleEngine.js';
import { ALL_RULES } from '../../src/core/rules/index.js';

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

  it('lands each grading in the intended GitHub band', () => {
    // Documented banding: over 9.0 critical, 7.0-8.9 high, 4.0-6.9 medium,
    // 0.1-3.9 low. A heuristic finding sits at least one band below the
    // confident finding of the same severity.
    const band = (value: string): string => {
      const score = Number(value);
      if (score > 9) return 'critical';
      if (score >= 7) return 'high';
      if (score >= 4) return 'medium';
      return 'low';
    };

    expect(band(sarifGrading('critical', 'high').securitySeverity)).toBe('critical');
    expect(band(sarifGrading('critical', 'heuristic').securitySeverity)).toBe('high');
    expect(band(sarifGrading('high', 'high').securitySeverity)).toBe('high');
    expect(band(sarifGrading('high', 'heuristic').securitySeverity)).toBe('medium');
    expect(band(sarifGrading('medium', 'high').securitySeverity)).toBe('medium');
    expect(band(sarifGrading('medium', 'heuristic').securitySeverity)).toBe('low');
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

describe('sarifGrading keeps uncertainty subordinate', () => {
  const SEVERITIES = ['critical', 'high', 'medium', 'low', 'info'] as const;

  it('emits only values GitHub treats as a security severity', () => {
    // Documented: 0.0 or out of range means "no security severity", which would
    // drop the finding out of the banding entirely.
    for (const severity of SEVERITIES) {
      for (const confidence of ['high', 'heuristic'] as const) {
        const score = Number(sarifGrading(severity, confidence).securitySeverity);
        expect(score, `${severity}/${confidence}`).toBeGreaterThan(0);
        expect(score, `${severity}/${confidence}`).toBeLessThanOrEqual(10);
      }
    }
  });

  it('scores a heuristic finding strictly below a confident one of the same severity', () => {
    for (const severity of SEVERITIES) {
      const confident = Number(sarifGrading(severity, 'high').securitySeverity);
      const heuristic = Number(sarifGrading(severity, 'heuristic').securitySeverity);
      expect(heuristic, severity).toBeLessThan(confident);
    }
  });

  it('never gives two gradings the same score', () => {
    // A flat penalty previously made a heuristic critical score exactly what a
    // confident high scored, so the two were indistinguishable in GitHub's
    // ordering — the tie this grading exists to prevent.
    const scores = SEVERITIES.flatMap((severity) =>
      (['high', 'heuristic'] as const).map(
        (confidence) => sarifGrading(severity, confidence).securitySeverity,
      ),
    );
    expect(new Set(scores).size).toBe(scores.length);
  });

  it('puts a confident critical above the documented critical threshold', () => {
    // "over 9.0 is critical" — 9.0 itself is not over 9.0.
    expect(Number(sarifGrading('critical', 'high').securitySeverity)).toBeGreaterThan(9);
  });

  it('demotes the level of a heuristic finding', () => {
    // The level badge is what a reader notices first, so uncertainty has to show
    // there and not only in a number.
    expect(sarifGrading('high', 'high').level).toBe('error');
    expect(sarifGrading('high', 'heuristic').level).toBe('warning');
    expect(sarifGrading('medium', 'heuristic').level).toBe('note');
    // note is already the quietest level SARIF defines.
    expect(sarifGrading('info', 'heuristic').level).toBe('note');
  });
});

describe('rule descriptors reflect the confidence actually emitted', () => {
  const meta: ReportMeta = {
    rootDir: '/scan',
    configsAnalyzed: 1,
    configsUnplaced: 0,
    capabilitiesAnalyzed: 0,
    filesUnparsable: 0,
    warnings: [],
  };

  function finding(ruleId: string, severity: Severity, confidence: Confidence): Finding {
    return {
      ruleId,
      severity,
      confidence,
      file: '/scan/tauri.conf.json',
      line: 1,
      target: `${ruleId} target`,
      whyDangerous: 'why',
      recommendation: 'fix',
    };
  }

  function ruleScore(findings: Finding[], ruleId: string): number {
    const parsed = JSON.parse(formatSarif(findings, meta, {})) as {
      runs: {
        tool: { driver: { rules: { id: string; properties: { 'security-severity': string } }[] } };
      }[];
    };
    const rule = parsed.runs[0]?.tool.driver.rules.find((entry) => entry.id === ruleId);
    return Number(rule?.properties['security-severity']);
  }

  it('does not band a heuristic-only rule as if it were certain', () => {
    // security-severity is rule-level in SARIF while level is per-result, and
    // GitHub bands from the rule-level number. Grading the descriptor as if
    // certain made a heuristic finding badge at full strength while its own
    // level said otherwise.
    const heuristicOnly = ruleScore([finding('TA-X-001', 'high', 'heuristic')], 'TA-X-001');
    const certain = ruleScore([finding('TA-X-001', 'high', 'high')], 'TA-X-001');
    expect(heuristicOnly).toBeLessThan(certain);
  });

  it('uses the strongest grading a rule actually produced', () => {
    // A rule reporting both confidently and heuristically is described by its
    // confident finding, which is the worst thing it genuinely found.
    const mixed = ruleScore(
      [finding('TA-X-002', 'high', 'heuristic'), finding('TA-X-002', 'high', 'high')],
      'TA-X-002',
    );
    expect(mixed).toBe(ruleScore([finding('TA-X-002', 'high', 'high')], 'TA-X-002'));
  });
});

describe('every SARIF location points at a file that exists', () => {
  // GitHub resolves artifactLocation.uri against the checkout root. A URI that
  // does not resolve is accepted, displayed, and simply never links to source —
  // the alert looks fine and is unusable. That is how TA-DEP-001 shipped a
  // finding pointing at `demo-app/src-tauri/Cargo.lock`, three directories
  // short of the real path, because it put a display string in `Finding.file`
  // where an absolute path belongs.
  const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

  function urisFor(target: string): string[] {
    const project = buildProjectContext(path.join(REPO, target));
    const findings = runRules(project, ALL_RULES).findings;
    const sarif = JSON.parse(formatSarif(findings, {
      rootDir: project.rootDir,
      configsAnalyzed: project.configs.length,
      configsUnplaced: project.unplacedConfigs.length,
      capabilitiesAnalyzed: project.capabilities.length,
      filesUnparsable: project.filesUnparsable,
      warnings: project.warnings,
    }, { cwd: REPO })) as { runs: { results: { locations: { physicalLocation: { artifactLocation: { uri: string } } }[] }[] }[] };

    return (sarif.runs[0]?.results ?? []).map(
      (result) => result.locations[0]?.physicalLocation.artifactLocation.uri ?? '',
    );
  }

  // The self-scan target, because that is what reaches the Security tab.
  it.each(['tests/fixtures/vulnerable', 'tests/corpus/true-positive'])(
    'scanning %s produces only resolvable URIs',
    (target) => {
      const uris = urisFor(target);
      expect(uris.length, 'no results — the assertion would pass vacuously').toBeGreaterThan(0);

      const missing = uris.filter((uri) => !existsSync(path.join(REPO, uri)));
      expect(missing, 'SARIF URIs that do not resolve from the checkout root').toEqual([]);
    },
  );

  it('covers a dependency finding, which is the case that broke', () => {
    // Guards the guard: if the sample stopped producing a TA-DEP-001 finding the
    // assertion above would still pass while no longer testing this path.
    const project = buildProjectContext(path.join(REPO, 'tests/fixtures/vulnerable'));
    const ruleIds = runRules(project, ALL_RULES).findings.map((finding) => finding.ruleId);
    expect(ruleIds).toContain('TA-DEP-001');
  });
});
