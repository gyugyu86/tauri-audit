import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { isGatingFinding } from '../../src/core/gate.js';
import { buildProjectContext } from '../../src/core/projectContext.js';
import { runRules } from '../../src/core/ruleEngine.js';
import { ALL_RULES } from '../../src/core/rules/index.js';
import type { Finding } from '../../src/core/types.js';
import { corpusApps, verifyApp } from '../../scripts/corpus-checksums.mjs';

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

  it.each(cleanApps)('%s reports its analysis coverage', (app) => {
    // A clean result is only meaningful if the analysis actually covered the
    // project — an app that failed to parse would produce zero findings for the
    // wrong reason and pass the assertion above by accident.
    //
    // Coverage is snapshotted rather than asserted empty, because one honest
    // gap exists and pretending otherwise would be worse than recording it:
    // Tauri's own v1 examples carry a tauri.conf.json and no Cargo.toml, so
    // their Rust dependencies genuinely cannot be checked. Using the snapshot
    // rather than an allowlist means a NEW gap shows up as a reviewable diff
    // instead of being absorbed by a list someone can quietly extend.
    const { incomplete } = scan(path.join(CLEAN, app));
    expect(incomplete.map((reason) => reason.replace(/^[^:]+: /, ''))).toMatchSnapshot();
  });
});

const TRUE_POSITIVE = path.join(CORPUS, 'true-positive');

const truePositiveApps = readdirSync(TRUE_POSITIVE, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

describe('corpus findings snapshot', () => {
  // Heuristic findings on real apps are legitimate output, but a CHANGE in them
  // should be looked at by a person. The snapshot makes rule drift visible
  // without making the drift fail the build for the wrong reason.
  //
  // The true-positive apps are snapshotted alongside the clean ones on purpose.
  // While every clean app yields an empty list, an all-empty snapshot file would
  // still pass if the comparison itself were broken — the mechanism would be
  // silently untested, which is the same failure mode as a swallowed exception
  // reading as a clean result. At least one non-empty snapshot keeps the
  // mechanism honest.
  it.each([
    ...cleanApps.map((app) => ['clean', app] as const),
    ...truePositiveApps.map((app) => ['true-positive', app] as const),
  ])('%s/%s', (group, app) => {
    const root = path.join(CORPUS, group, app);
    const { findings } = scan(root);
    const normalized = findings.map((finding) => describeFinding(root, finding)).sort();
    expect(normalized).toMatchSnapshot();
  });

  it('includes at least one non-empty snapshot', () => {
    // Guards the guard: if every corpus app stopped producing findings, the
    // snapshots above would all be `[]` and would keep passing while proving
    // nothing.
    const nonEmpty = truePositiveApps.filter(
      (app) => scan(path.join(TRUE_POSITIVE, app)).findings.length > 0,
    );
    expect(nonEmpty.length).toBeGreaterThan(0);
  });
});

describe('true-positive corpus does trip rules', () => {
  // The mirror image of the clean corpus. If this ever passes silently, the rules
  // have stopped detecting anything and the clean-corpus result would be
  // meaningless.
  it('tauri-api-v1 produces a gating finding', () => {
    const root = path.join(TRUE_POSITIVE, 'tauri-api-v1');
    const { findings } = scan(root);

    const gating = findings.filter((finding) => isGatingFinding(finding, 'default'));
    expect(gating.length).toBeGreaterThan(0);
    expect(gating.map((finding) => finding.ruleId)).toContain('TA-V1-001');
  });
});

describe('rule evidence metadata matches reality', () => {
  /**
   * Rule IDs that fire on any unmodified third-party config in the corpus.
   *
   * Both groups count. A rule firing in `clean/` has demonstrated it matches
   * real shipped code — TA-CONF-001 fires on three real applications that ship
   * without a CSP — and that is exactly why such a rule must stay heuristic.
   */
  const firedOnRealCode = new Set(
    [
      ...truePositiveApps.map((app) => path.join(TRUE_POSITIVE, app)),
      ...cleanApps.map((app) => path.join(CLEAN, app)),
    ].flatMap((root) => scan(root).findings.map((finding) => finding.ruleId)),
  );

  it.each(ALL_RULES.map((rule) => [rule.id, rule.evidence] as const))(
    '%s declares %s',
    (id, evidence) => {
      // A rule may not claim real-world evidence it does not have. The check runs
      // in the honest direction only: `synthetic-only` is always allowed to be a
      // conservative understatement, but `real-world` must be earned by an
      // unmodified third-party config in the corpus.
      if (evidence === 'real-world') {
        expect(firedOnRealCode.has(id), `${id} claims real-world evidence but fires on no corpus app`).toBe(true);
      }
    },
  );

  it('reports how many rules rest on fixtures alone', () => {
    // Not an assertion about the right number — just a place where the ratio is
    // visible, so it cannot quietly drift toward all-synthetic.
    const synthetic = ALL_RULES.filter((rule) => rule.evidence === 'synthetic-only');
    expect(synthetic.length).toBeLessThanOrEqual(ALL_RULES.length);
  });
});

describe('the corpus is never published as findings', () => {
  // tests/corpus/ holds unmodified configuration from real third-party projects.
  // Their findings are heuristic observations about ordinary design choices —
  // shipping without a CSP is the Tauri default — so publishing them to this
  // repository's code-scanning tab would put other people's project names next
  // to what reads as a vulnerability claim against them.
  //
  // The self-scan workflow therefore targets the synthetic sample app. This
  // asserts it stays that way, because the mistake is easy to make and invisible
  // until it has already been published.
  const workflow = readFileSync(
    path.join(CORPUS, '..', '..', '.github', 'workflows', 'self-scan.yml'),
    'utf8',
  );

  it('scans only the synthetic samples', () => {
    // The directory, not one app inside it: it holds a v2 and a v1 sample, and
    // scanning both together is what produces a rule reporting at two
    // confidences in one run — the case the rendering check needs.
    expect(workflow).toContain('tests/fixtures/vulnerable');
  });

  it('never names the corpus as a scan target', () => {
    const scanCommands = workflow
      .split('\n')
      .filter((line) => line.includes('dist/cli/index.js'));
    expect(scanCommands.length).toBeGreaterThan(0);
    for (const command of scanCommands) {
      expect(command, 'a scan command targets the corpus').not.toMatch(/tests\/corpus/);
      // A bare `.` would sweep the whole repository, corpus included.
      expect(command, 'a scan command targets the repository root').not.toMatch(
        /index\.js\s+\.(\s|$)/,
      );
    }
  });
});

describe('the corpus is unmodified', () => {
  // What matters about vendored third-party configuration is not which words it
  // contains — that is upstream's business and nothing to do with this project —
  // but that nobody here has edited it. Its whole value is having been written
  // by people who never heard of this tool, and one well-meaning edit to make a
  // test pass would silently turn it into something we authored.
  //
  // This runs offline against recorded checksums. `npm run verify:corpus --
  // --upstream` re-fetches from the recorded commit for the stronger check.
  it.each(corpusApps().map((app) => [`${app.group}/${app.name}`, app] as const))(
    '%s matches its recorded checksums',
    (_label, app) => {
      expect(verifyApp(app)).toEqual([]);
    },
  );
});

describe('the self-scan target keeps its rendering-check subject', () => {
  // The self-scan exists so the code-scanning UI can be checked against a known
  // mixture. One property of that mixture is load-bearing and easy to lose by
  // editing a fixture: at least one rule must report at BOTH confidences in a
  // single scan.
  //
  // That case is the only one where a heuristic alert inherits a confident
  // rule's band, because SARIF puts security-severity on the rule while level is
  // per-result. Without it the screenshot cannot answer the question it is taken
  // to answer, and nothing else would notice.
  const VULNERABLE = path.join(CORPUS, '..', 'fixtures', 'vulnerable');

  it('produces at least one rule reporting at two confidences', () => {
    const byRule = new Map<string, Set<string>>();
    for (const finding of scan(VULNERABLE).findings) {
      const seen = byRule.get(finding.ruleId) ?? new Set<string>();
      seen.add(finding.confidence);
      byRule.set(finding.ruleId, seen);
    }

    const mixed = [...byRule.entries()]
      .filter(([, confidences]) => confidences.size > 1)
      .map(([ruleId]) => ruleId);

    expect(mixed.length, 'no rule reports at both confidences — the rendering check has no subject').toBeGreaterThan(0);
  });

  it('covers both configuration generations', () => {
    // demo-app is v2 and legacy-app is v1; losing either narrows what the
    // rendering check can show.
    const project = buildProjectContext(VULNERABLE);
    const versions = new Set(project.configs.map((config) => config.verdict.version));
    expect([...versions].sort()).toEqual(['v1', 'v2']);
  });
});
