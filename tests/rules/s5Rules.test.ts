import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { buildProjectContext } from '../../src/core/projectContext.js';
import { runRules } from '../../src/core/ruleEngine.js';
import { ALL_RULES } from '../../src/core/rules/index.js';
import { extractEnvPrefix, secretsExposedBy } from '../../src/core/rules/shared/envPrefix.js';
import type { Finding } from '../../src/core/types.js';

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');

function scan(fixture: string): Finding[] {
  const project = buildProjectContext(path.join(FIXTURES, fixture));
  return runRules(project, ALL_RULES).findings.filter(
    (finding) => !finding.ruleId.startsWith('TA-SCHEMA'),
  );
}

function only(fixture: string, ruleId: string): Finding[] {
  return scan(fixture).filter((finding) => finding.ruleId === ruleId);
}

describe('envPrefix prefix semantics', () => {
  // The core of TA-VITE-001. A substring test would flag TAURI_ENV_, which is a
  // correct and common setting, so the question is strictly whether a real
  // secret's name begins with the configured prefix.
  it.each([
    ['TAURI_', true, 'reaches TAURI_PRIVATE_KEY'],
    ['TAURI_SIGNING_', true, 'reaches the v2 signing variables'],
    ['TAURI_ENV_', false, 'only reaches build metadata Tauri sets itself'],
    ['VITE_', false, 'reaches nothing Tauri owns'],
    ['', false, 'an empty prefix is not a filter'],
    ['TAURI_ENV', false, 'still cannot reach TAURI_PRIVATE_KEY'],
  ])('%s exposes secrets: %s (%s)', (prefix, expected) => {
    expect(secretsExposedBy(prefix).length > 0).toBe(expected);
  });

  it('covers both the v1 name and the v2 rename', () => {
    // v2 renamed the family to TAURI_SIGNING_*, but its CLI still reads the old
    // names first as a fallback, so both generations remain live.
    expect(secretsExposedBy('TAURI_')).toContain('TAURI_PRIVATE_KEY');
    expect(secretsExposedBy('TAURI_')).toContain('TAURI_SIGNING_PRIVATE_KEY');
  });
});

describe('envPrefix extraction', () => {
  it('reads the string form', () => {
    expect(extractEnvPrefix("export default { envPrefix: 'TAURI_' }")?.prefixes).toEqual([
      'TAURI_',
    ]);
  });

  it('reads the array form', () => {
    expect(
      extractEnvPrefix("export default { envPrefix: ['VITE_', 'TAURI_'] }")?.prefixes,
    ).toEqual(['VITE_', 'TAURI_']);
  });

  it('ignores a commented-out setting', () => {
    expect(extractEnvPrefix("// envPrefix: 'TAURI_'\nexport default {}")).toBeUndefined();
    expect(extractEnvPrefix("/* envPrefix: 'TAURI_' */\nexport default {}")).toBeUndefined();
  });

  it('declines to read a computed value rather than guessing', () => {
    expect(extractEnvPrefix('export default { envPrefix: prefixes }')).toBeUndefined();
    expect(extractEnvPrefix('export default { envPrefix: [...base, "TAURI_"] }')).toBeUndefined();
    expect(extractEnvPrefix('export default { envPrefix: `TAURI_` }')).toBeUndefined();
  });

  it('reports the line of the declaration', () => {
    expect(extractEnvPrefix("a\nb\nexport default { envPrefix: 'TAURI_' }")?.line).toBe(3);
  });
});

describe('TA-VITE-001', () => {
  it.each([
    ['tauri-prefix-string', "envPrefix: 'TAURI_'"],
    ['tauri-prefix-array', "envPrefix: ['VITE_', 'TAURI_']"],
    ['signing-prefix', "envPrefix: ['VITE_', 'TAURI_SIGNING_'] in a .mts config"],
  ])('flags %s (%s)', (fixture) => {
    const findings = only(`TA-VITE-001/${fixture}`, 'TA-VITE-001');
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ severity: 'low', confidence: 'heuristic' });
  });

  it.each([
    ['tauri-env-prefix', 'TAURI_ENV_ is legitimate build metadata, not a secret'],
    ['vite-only', 'VITE_ alone reaches nothing Tauri owns'],
    ['no-envprefix', 'the option is not set at all'],
    ['commented-out', 'the setting is commented out'],
    ['string-literal-mention', 'the text appears inside an unrelated string'],
    ['dynamic', 'the value is computed, so it is not analyzed rather than guessed'],
  ])('does not fire for %s (%s)', (fixture) => {
    expect(only(`TA-VITE-001/${fixture}`, 'TA-VITE-001')).toEqual([]);
  });

  it('names the exposed variables and how to check the real bundle', () => {
    const finding = only('TA-VITE-001/tauri-prefix-string', 'TA-VITE-001')[0];
    expect(finding?.target).toContain('TAURI_PRIVATE_KEY');
    expect(finding?.recommendation).toContain('grep -r');
    // The three sources disagree on this CVE; all of them are cited.
    expect(finding?.whyDangerous).toContain('GHSA');
    expect(finding?.whyDangerous).toContain('NVD');
    expect(finding?.whyDangerous).toContain('CNA');
  });
});

describe('TA-DEP-001', () => {
  it('fires when the version is affected, open is unset and a capability grants it', () => {
    const findings = only('TA-DEP-001/vulnerable', 'TA-DEP-001');
    expect(findings).toHaveLength(1);
    // Never promoted above heuristic: the advisory carries exemptions.
    expect(findings[0]).toMatchObject({ severity: 'high', confidence: 'heuristic' });
    expect(findings[0]?.target).toContain('resolved');
  });

  it('treats shell:default as granting the endpoint', () => {
    expect(only('TA-DEP-001/vulnerable-shell-default', 'TA-DEP-001')).toHaveLength(1);
  });

  it.each([
    ['exempt-open-true', 'open: true restores the intended restriction'],
    ['exempt-open-regex', 'a non-matching regex disables the endpoint'],
    ['exempt-open-false', 'open: false disables the endpoint'],
    ['exempt-no-permission', 'no capability grants shell open'],
    ['patched', 'the installed version is 2.2.1'],
  ])('does not fire for %s (%s)', (fixture) => {
    expect(only(`TA-DEP-001/${fixture}`, 'TA-DEP-001')).toEqual([]);
  });

  it('reports possible rather than confirmed without a lockfile', () => {
    const findings = only('TA-DEP-001/manifest-only', 'TA-DEP-001');
    expect(findings).toHaveLength(1);
    expect(findings[0]?.target).toContain('possible');
    expect(findings[0]?.whyDangerous).toContain('installed version is unknown');
  });

  it('does not suppress when a capability cannot be read, and says why', () => {
    // Suppression requires proving a negative. An unreadable permissions list
    // cannot establish that shell open is ungranted, so the finding stands.
    const findings = only('TA-DEP-001/unreadable-capability', 'TA-DEP-001');
    expect(findings).toHaveLength(1);
    expect(findings[0]?.whyDangerous).toContain('could not be read');
  });

  it('does not fire on a v1 project', () => {
    expect(only('TA-DEP-001/v1-project', 'TA-DEP-001')).toEqual([]);
  });

  it('states the polarity explicitly in the finding', () => {
    // An unset open is the affected state, which is the opposite of every
    // configuration rule in this project.
    const finding = only('TA-DEP-001/vulnerable', 'TA-DEP-001')[0];
    expect(finding?.whyDangerous).toContain('unset');
    expect(finding?.recommendation).toContain('opener');
  });
});

describe('unanalyzable is not clean', () => {
  it('degrades a config whose root is not an object', () => {
    // Valid JSON, so parsing succeeds, but no rule can run over an array. Before
    // this was fixed the run exited 0 with zero findings, which reads as safe.
    const project = buildProjectContext(path.join(FIXTURES, 'unanalyzable/array-root'));
    expect(project.incomplete.length).toBeGreaterThan(0);
    expect(project.incomplete.join(' ')).toContain('not an object');
  });
});
