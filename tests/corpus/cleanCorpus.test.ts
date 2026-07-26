import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { isGatingFinding } from '../../src/core/gate.js';
import { buildProjectContext } from '../../src/core/projectContext.js';
import { runRules } from '../../src/core/ruleEngine.js';
import { ALL_RULES } from '../../src/core/rules/index.js';
import type { Finding } from '../../src/core/types.js';

const CORPUS = path.join(path.dirname(fileURLToPath(import.meta.url)));
const CLEAN = path.join(CORPUS, 'clean');

/**
 * The false-positive regression.
 *
 * Apps are enumerated from disk rather than listed here, so a rule added to
 * ALL_RULES is checked against every clean app the moment it lands — there is no
 * separate list to forget to update.
 */
const cleanApps = readdirSync(CLEAN, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

function scan(root: string): { findings: Finding[]; incomplete: string[] } {
  const project = buildProjectContext(root);
  const result = runRules(project, ALL_RULES);
  return { findings: result.findings, incomplete: result.incomplete };
}

function describeFinding(root: string, finding: Finding): string {
  return `${finding.ruleId} ${finding.severity}/${finding.confidence} ${path.relative(root, finding.file)}:${String(finding.line)}`;
}

describe('clean corpus produces no gating findings', () => {
  it('has apps to check', () => {
    // An empty corpus would make every assertion below pass vacuously.
    expect(cleanApps.length).toBeGreaterThanOrEqual(5);
  });

  it.each(cleanApps)('%s', (app) => {
    const root = path.join(CLEAN, app);
    const { findings } = scan(root);

    // The predicate is imported from core/gate.ts, not restated. "Clean" and "the
    // CI gate passes" must be the same claim, or the corpus stops proving the
    // thing it exists to prove.
    //
    // Note this is about HIGH-CONFIDENCE critical/high only. Heuristic findings
    // are expected here and are not false positives: Surrealist really does ship
    // csp: null, and saying so is correct. What must never happen is this tool
    // failing the build of a correctly written app.
    const gating = findings
      .filter((finding) => isGatingFinding(finding, 'default'))
      .map((finding) => describeFinding(root, finding));

    expect(gating, `unexpected gating findings in clean app "${app}"`).toEqual([]);
  });

  it.each(cleanApps)('%s is fully analyzable', (app) => {
    // A clean result is only meaningful if the analysis actually covered the
    // project. An app that failed to parse would produce zero findings for the
    // wrong reason and pass the assertion above by accident.
    const { incomplete } = scan(path.join(CLEAN, app));
    expect(incomplete, `analysis did not fully cover "${app}"`).toEqual([]);
  });
});

describe('corpus findings snapshot', () => {
  // Heuristic findings on real apps are legitimate output, but a CHANGE in them
  // should be looked at by a person. The snapshot makes rule drift visible
  // without making the drift fail the build for the wrong reason.
  it.each(cleanApps)('%s', (app) => {
    const root = path.join(CLEAN, app);
    const { findings } = scan(root);
    const normalized = findings
      .map((finding) => describeFinding(root, finding))
      .sort();
    expect(normalized).toMatchSnapshot();
  });
});

describe('true-positive corpus does trip rules', () => {
  // The mirror image of the clean corpus. If this ever passes silently, the rules
  // have stopped detecting anything and the clean-corpus result would be
  // meaningless.
  it('tauri-api-v1 produces a gating finding', () => {
    const root = path.join(CORPUS, 'true-positive', 'tauri-api-v1');
    const { findings } = scan(root);

    const gating = findings.filter((finding) => isGatingFinding(finding, 'default'));
    expect(gating.length).toBeGreaterThan(0);
    expect(gating.map((finding) => finding.ruleId)).toContain('TA-V1-001');
  });
});
