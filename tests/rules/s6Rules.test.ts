import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { buildProjectContext } from '../../src/core/projectContext.js';
import { runRules } from '../../src/core/ruleEngine.js';
import { ALL_RULES } from '../../src/core/rules/index.js';
import { PATH_VARIABLES } from '../../src/core/rules/shared/pathVariables.js';
import type { Finding } from '../../src/core/types.js';

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');

function only(fixture: string, ruleId: string): Finding[] {
  const project = buildProjectContext(path.join(FIXTURES, fixture));
  return runRules(project, ALL_RULES).findings.filter((finding) => finding.ruleId === ruleId);
}

describe('TA-CONF-001 — no CSP configured', () => {
  // Inverse polarity: the dangerous state is the absent one. Every other config
  // rule in this project fires on a value being present.
  it.each([
    ['v2-null', 'csp written as null'],
    ['v2-absent', 'csp key missing from an existing security block'],
    ['v2-no-security', 'no security block at all'],
    ['v1-null', 'the same in a v1 config'],
  ])('fires for %s (%s)', (fixture) => {
    const findings = only(`TA-CONF-001/${fixture}`, 'TA-CONF-001');
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ severity: 'medium', confidence: 'heuristic' });
  });

  it.each([
    ['v2-string', 'a string policy'],
    ['v2-object', 'a structured policy'],
    ['v1-string', 'a string policy in v1'],
  ])('does not fire for %s (%s)', (fixture) => {
    expect(only(`TA-CONF-001/${fixture}`, 'TA-CONF-001')).toEqual([]);
  });

  it('reports the exact line when csp is written as null', () => {
    const findings = only('TA-CONF-001/v2-null', 'TA-CONF-001');
    expect(findings[0]?.line).toBe(2);
    expect(findings[0]?.target).toContain('null');
  });

  it('walks outward to the nearest block that exists when csp is absent', () => {
    // Nothing to point at when the key is missing. Landing on line 1 would send
    // the reader to the opening brace; the enclosing block is actionable.
    const withSecurity = only('TA-CONF-001/v2-absent', 'TA-CONF-001');
    expect(withSecurity[0]?.line).toBeGreaterThan(1);
    const withoutSecurity = only('TA-CONF-001/v2-no-security', 'TA-CONF-001');
    expect(withoutSecurity[0]?.line).toBeGreaterThan(1);
    expect(withoutSecurity[0]?.target).toContain('not set');
  });

  it('never gates a build', () => {
    // It fires on a large share of real applications by design, so it must not
    // be able to fail CI.
    const findings = only('TA-CONF-001/v2-null', 'TA-CONF-001');
    expect(findings[0]?.confidence).toBe('heuristic');
    expect(findings[0]?.severity).toBe('medium');
  });
});

describe('path variable classification', () => {
  // The pair that differs by three characters and enormously in reach:
  // app_config_dir() is config_dir().join(identifier), so $CONFIG is the
  // directory holding every application's folder.
  it.each([
    ['APPCONFIG', 'app-owned'],
    ['APPDATA', 'app-owned'],
    ['APPLOCALDATA', 'app-owned'],
    ['APPCACHE', 'app-owned'],
    ['APPLOG', 'app-owned'],
    ['RESOURCE', 'app-owned'],
    ['CONFIG', 'cross-application'],
    ['DATA', 'cross-application'],
    ['LOCALDATA', 'cross-application'],
    ['CACHE', 'cross-application'],
    ['HOME', 'user-home'],
    ['DOCUMENT', 'user-data'],
    ['DOWNLOAD', 'user-data'],
  ])('$%s is %s', (variable, expected) => {
    expect(PATH_VARIABLES[variable]).toBe(expected);
  });

  it('keeps every app-prefixed variable distinct from its root', () => {
    for (const [variable, scope] of Object.entries(PATH_VARIABLES)) {
      if (!variable.startsWith('APP')) continue;
      expect(scope, `$${variable} must be app-owned`).toBe('app-owned');
      const root = variable.slice(3);
      if (root in PATH_VARIABLES) {
        expect(PATH_VARIABLES[root], `$${root} must not be app-owned`).not.toBe('app-owned');
      }
    }
  });
});

describe('TA-CAP-003 — over-broad filesystem scope', () => {
  it.each([
    ['home-recursive', '$HOME/**'],
    ['filesystem-wide', '**'],
    ['root-slash', '/**'],
    ['cross-app-config', '$CONFIG/**'],
    ['cross-app-data', '$DATA/**'],
    ['user-documents', '$DOCUMENT/**'],
    ['object-form', '{ path: "$HOME/**" }'],
  ])('fires for %s (%s)', (fixture) => {
    const findings = only(`TA-CAP-003/${fixture}`, 'TA-CAP-003');
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ severity: 'medium', confidence: 'heuristic' });
  });

  it.each([
    ['appdata-recursive', "the app's own data directory"],
    ['appconfig-recursive', "the app's own config directory"],
    ['applocaldata-recursive', "the app's own local data"],
    ['resource-recursive', 'files the app shipped with'],
    ['home-shallow', 'a single * does not cross directories'],
    ['specific-file', 'one named file'],
    ['non-fs-permission', 'not a filesystem permission'],
    ['bare-strings', 'string permissions carry no scope'],
  ])('does not fire for %s (%s)', (fixture) => {
    expect(only(`TA-CAP-003/${fixture}`, 'TA-CAP-003')).toEqual([]);
  });

  it('credits a deny list that carves out sensitive paths', () => {
    // deny takes precedence over allow, so ignoring it and judging the allow
    // alone would overstate the exposure.
    const findings = only('TA-CAP-003/with-deny', 'TA-CAP-003');
    expect(findings).toHaveLength(1);
    expect(findings[0]?.whyDangerous).toContain('takes precedence');
    expect(findings[0]?.whyDangerous).toContain('reduces the exposure');
  });

  it('says so when nothing narrows a broad allow', () => {
    const findings = only('TA-CAP-003/home-recursive', 'TA-CAP-003');
    expect(findings[0]?.whyDangerous).toContain('No `deny` entries narrow it');
  });

  it('explains the $CONFIG / $APPCONFIG distinction in the finding', () => {
    const findings = only('TA-CAP-003/cross-app-config', 'TA-CAP-003');
    expect(findings[0]?.whyDangerous).toContain('$APPCONFIG');
    expect(findings[0]?.whyDangerous).toContain('every other application');
  });

  it('does not throw on arbitrary scope shapes', () => {
    // allow/deny elements are `Value` in the schema, which is arbitrary JSON —
    // the shape belongs to whichever plugin consumes it.
    expect(() => only('TA-CAP-003/malformed', 'TA-CAP-003')).not.toThrow();
    expect(only('TA-CAP-003/malformed', 'TA-CAP-003')).toEqual([]);
  });
});

describe('the two S6 rules have opposite polarity', () => {
  it('TA-CONF-001 fires on absence, TA-CAP-003 fires on presence', () => {
    // Landing both in one release is what makes the point concrete: polarity is
    // read from each rule's own source, never inherited from the last one.
    expect(only('TA-CONF-001/v2-no-security', 'TA-CONF-001')).toHaveLength(1);
    expect(only('TA-CAP-003/bare-strings', 'TA-CAP-003')).toEqual([]);
  });
});
