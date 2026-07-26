import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { buildProjectContext } from '../../src/core/projectContext.js';
import { runRules } from '../../src/core/ruleEngine.js';
import { ALL_RULES } from '../../src/core/rules/index.js';
import type { Confidence, Finding, Severity } from '../../src/core/types.js';

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');

/** Runs the full rule set over a fixture, as the CLI would. */
function scan(fixture: string): Finding[] {
  const project = buildProjectContext(path.join(FIXTURES, fixture));
  // Schema findings share the pipeline but are not security rules; excluding them
  // keeps these assertions about the rule under test.
  return runRules(project, ALL_RULES).findings.filter(
    (finding) => !finding.ruleId.startsWith('TA-SCHEMA'),
  );
}

function ids(findings: Finding[]): string[] {
  return findings.map((finding) => finding.ruleId).sort();
}

describe('TA-CONF-002 — dangerousDisableAssetCspModification', () => {
  it('flags `true` in a v2 config as high severity, high confidence', () => {
    const findings = scan('TA-CONF-002/v2-true');
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      ruleId: 'TA-CONF-002',
      severity: 'high',
      confidence: 'high',
    });
    expect(findings[0]?.target).toContain('app.security.dangerousDisableAssetCspModification: true');
  });

  it('flags `true` in a v1 config at the v1 path', () => {
    const findings = scan('TA-CONF-002/v1-true');
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      ruleId: 'TA-CONF-002',
      severity: 'high',
      confidence: 'high',
    });
    // The v1 wrapper must report the v1 path, not the v2 one.
    expect(findings[0]?.target).toContain(
      'tauri.security.dangerousDisableAssetCspModification: true',
    );
  });

  it('treats a directive array as a different, lesser setting', () => {
    // `true` disables CSP rewriting outright; an array narrows it. Reporting the
    // array as high/high would be a false positive on a defensible choice.
    const findings = scan('TA-CONF-002/v2-array');
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      ruleId: 'TA-CONF-002',
      severity: 'medium',
      confidence: 'heuristic',
    });
    expect(findings[0]?.target).toContain('"style-src"');
  });

  it.each([
    ['v2-false', 'explicit false'],
    ['v2-absent', 'key absent'],
    ['v2-empty-array', 'empty array disables nothing'],
    ['v1-false', 'explicit false in v1'],
  ])('does not fire for %s (%s)', (fixture) => {
    expect(scan(`TA-CONF-002/${fixture}`)).toEqual([]);
  });

  it('reports the line of the offending key, not the file start', () => {
    // The fixture puts dangerousDisableAssetCspModification on line 8.
    const findings = scan('TA-CONF-002/v2-true');
    expect(findings[0]?.line).toBe(8);
  });
});

describe('TA-V1-001 — allowlist.all', () => {
  it('flags `all: true` as high severity, high confidence', () => {
    const findings = scan('TA-V1-001/all-true');
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      ruleId: 'TA-V1-001',
      severity: 'high',
      confidence: 'high',
    });
  });

  it.each([
    ['all-false', 'explicit false is the correct way to write this'],
    ['no-allowlist-key', 'no allowlist object at all'],
    ['allowlist-without-all', 'allowlist present but `all` absent'],
    ['v2-config', 'a v2 config has no allowlist concept'],
  ])('does not fire for %s (%s)', (fixture) => {
    expect(scan(`TA-V1-001/${fixture}`)).toEqual([]);
  });
});

describe('TA-V1-003 — dangerousUseHttpScheme', () => {
  it('flags `true` as medium severity, high confidence', () => {
    const findings = scan('TA-V1-003/true');
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      ruleId: 'TA-V1-003',
      severity: 'medium',
      confidence: 'high',
    });
  });

  it('does not fire for an explicit false', () => {
    expect(scan('TA-V1-003/false')).toEqual([]);
  });
});

describe('TA-V1-002 — dangerousRemoteDomainIpcAccess', () => {
  it('grades enableTauriAPI as high confidence', () => {
    const findings = scan('TA-V1-002/enable-tauri-api');
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      ruleId: 'TA-V1-002',
      severity: 'high',
      confidence: 'high',
    });
    expect(findings[0]?.target).toContain('https://app.example.com');
  });

  it('grades a non-empty plugins list as high confidence', () => {
    const findings = scan('TA-V1-002/plugins');
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ severity: 'high', confidence: 'high' });
    expect(findings[0]?.target).toContain('"shell"');
  });

  it('grades a domain-and-windows-only entry as heuristic', () => {
    // The mechanism is enabled, but this setting alone grants no command surface,
    // and what the named windows expose otherwise is invisible to static analysis.
    const findings = scan('TA-V1-002/minimal');
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ severity: 'medium', confidence: 'heuristic' });
  });

  it('treats plugins: [] with enableTauriAPI: false as the minimal case', () => {
    const findings = scan('TA-V1-002/plugins-empty');
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ severity: 'medium', confidence: 'heuristic' });
  });

  it.each([
    ['empty-array', 'an empty array grants nothing'],
    ['absent', 'the key is absent'],
  ])('does not fire for %s (%s)', (fixture) => {
    expect(scan(`TA-V1-002/${fixture}`)).toEqual([]);
  });

  it('reports one finding per entry, graded independently', () => {
    const findings = scan('TA-V1-002/mixed-entries');
    expect(findings).toHaveLength(2);
    const byConfidence = findings.map((finding) => finding.confidence).sort();
    expect(byConfidence).toEqual(['heuristic', 'high']);
  });

  it('does not throw on entries missing schema-required keys', () => {
    // domain and windows are required by the schema. A config without them is
    // invalid, which schema validation reports — this rule must survive it.
    expect(() => scan('TA-V1-002/malformed-entries')).not.toThrow();
    const findings = scan('TA-V1-002/malformed-entries');
    // The two non-object entries are skipped; the object one is still assessed.
    expect(findings).toHaveLength(1);
    expect(findings[0]?.target).toContain('(no domain)');
  });
});

describe('appliesTo filtering is enforced by the engine', () => {
  it('runs no config rule against a document it could not place', () => {
    // This fixture contains BOTH a v1 `allowlist.all: true` and a v2
    // `dangerousDisableAssetCspModification: true`. Either would be a
    // high-confidence finding if the document were placed — but it cannot be, so
    // guessing a generation would mean reporting against a config we do not
    // understand. Silence plus a warning is the correct outcome.
    expect(scan('unknown-verdict/mixed')).toEqual([]);
  });

  it('runs no config rule against an unrecognizable document', () => {
    expect(scan('unknown-verdict/unrecognizable')).toEqual([]);
  });

  it('surfaces the unplaced document rather than silently passing', () => {
    // Unanalyzable is not clean: zero findings here must not read as safety.
    const project = buildProjectContext(path.join(FIXTURES, 'unknown-verdict/mixed'));
    expect(project.unplacedConfigs).toHaveLength(1);
    expect(project.incomplete.length).toBeGreaterThan(0);
  });

  it('does not let a v1 rule reach a v2 config', () => {
    expect(ids(scan('TA-V1-001/v2-config'))).toEqual([]);
  });
});

describe('rule metadata contract', () => {
  it('gives every rule references and a confirmation step in its recommendation', () => {
    for (const rule of ALL_RULES) {
      expect(rule.references, `${rule.id} has no references`).toBeDefined();
      expect(rule.references?.length, `${rule.id} has empty references`).toBeGreaterThan(0);
    }
  });

  it('carries references through to every finding', () => {
    const findings = [
      ...scan('TA-CONF-002/v2-true'),
      ...scan('TA-V1-001/all-true'),
      ...scan('TA-V1-002/enable-tauri-api'),
      ...scan('TA-V1-003/true'),
    ];
    expect(findings).toHaveLength(4);
    for (const finding of findings) {
      expect(finding.references?.length, `${finding.ruleId} lost its references`).toBeGreaterThan(0);
      // Every finding must tell the reader how to check the claim themselves.
      expect(finding.recommendation.length).toBeGreaterThan(80);
    }
  });

  it('registers a rule once per generation only where the field exists in both', () => {
    // TA-CONF-001 and TA-CONF-002 read fields present in both v1 and v2 at
    // different paths, and `appliesTo` names one generation, so each ships as two
    // objects sharing an ID. Anything else appearing twice is a duplicate
    // registration, which would report the same finding twice.
    const dualGeneration = new Set(['TA-CONF-001', 'TA-CONF-002']);
    const counts = new Map<string, number>();
    for (const rule of ALL_RULES) counts.set(rule.id, (counts.get(rule.id) ?? 0) + 1);

    for (const id of dualGeneration) {
      expect(counts.get(id), `${id} should be registered for both generations`).toBe(2);
    }
    for (const [id, count] of counts) {
      if (!dualGeneration.has(id)) {
        expect(count, `${id} registered ${String(count)} times`).toBe(1);
      }
    }
  });
});

describe('declared ceilings match what the rules actually emit', () => {
  // SARIF describes a rule by its declared severity and maxConfidence rather
  // than by whatever a given run produced, so rule metadata stays a property of
  // the rule instead of the scanned project. That only works if the declaration
  // is true, and nothing in the type system enforces it — this does.
  const SEVERITY_RANK: Record<Severity, number> = {
    info: 0,
    low: 1,
    medium: 2,
    high: 3,
    critical: 4,
  };
  const CONFIDENCE_RANK: Record<Confidence, number> = { heuristic: 0, high: 1 };

  /** Every fixture directory, so no rule's output is left unexamined. */
  const fixtureDirs = readdirSync(FIXTURES, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((group) =>
      readdirSync(path.join(FIXTURES, group.name), { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => path.join(group.name, entry.name)),
    );

  const declared = new Map(
    ALL_RULES.map((rule) => [rule.id, { severity: rule.severity, confidence: rule.maxConfidence }]),
  );

  it('has fixtures to examine', () => {
    expect(fixtureDirs.length).toBeGreaterThan(10);
  });

  it('never emits a finding stronger than its rule declares', () => {
    const violations: string[] = [];

    for (const fixture of fixtureDirs) {
      for (const finding of scan(fixture)) {
        const ceiling = declared.get(finding.ruleId);
        if (ceiling === undefined) continue;

        if (SEVERITY_RANK[finding.severity] > SEVERITY_RANK[ceiling.severity]) {
          violations.push(
            `${fixture}: ${finding.ruleId} emitted ${finding.severity}, declares ${ceiling.severity}`,
          );
        }
        if (CONFIDENCE_RANK[finding.confidence] > CONFIDENCE_RANK[ceiling.confidence]) {
          violations.push(
            `${fixture}: ${finding.ruleId} emitted ${finding.confidence}, declares ${ceiling.confidence}`,
          );
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it('does not declare a ceiling no fixture reaches', () => {
    // An overstated ceiling inflates the rule's badge in code scanning for
    // findings that can never be that strong. Reported rather than asserted:
    // a rule may legitimately have a path no fixture covers yet.
    const reached = new Map<string, { severity: Severity; confidence: Confidence }>();
    for (const fixture of fixtureDirs) {
      for (const finding of scan(fixture)) {
        const current = reached.get(finding.ruleId);
        if (
          current === undefined ||
          SEVERITY_RANK[finding.severity] > SEVERITY_RANK[current.severity] ||
          CONFIDENCE_RANK[finding.confidence] > CONFIDENCE_RANK[current.confidence]
        ) {
          reached.set(finding.ruleId, {
            severity: finding.severity,
            confidence: finding.confidence,
          });
        }
      }
    }

    const unreached = [...declared.entries()]
      .filter(([id, ceiling]) => {
        const hit = reached.get(id);
        return hit !== undefined && CONFIDENCE_RANK[hit.confidence] < CONFIDENCE_RANK[ceiling.confidence];
      })
      .map(([id]) => id);

    expect(unreached, 'a declared maxConfidence that no fixture demonstrates').toEqual([]);
  });
});
