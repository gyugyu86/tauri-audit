import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Ajv } from 'ajv';
import addFormatsModule from 'ajv-formats';
import { describe, expect, it } from 'vitest';

import {
  confidenceFor,
  describeSeveritySources,
  loadAdvisories,
  matchDependency,
  type Advisory,
} from '../../src/core/advisories.js';
import { cargoRequirementToRange, type DependencyVersion } from '../../src/core/dependencies.js';

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const { database, error } = loadAdvisories();

function advisoryById(id: string): Advisory {
  const found = database.advisories.find((candidate) => candidate.id === id);
  if (found === undefined) throw new Error(`advisory not in database: ${id}`);
  return found;
}

function dep(overrides: Partial<DependencyVersion> = {}): DependencyVersion {
  return {
    name: 'tauri',
    ecosystem: 'cargo',
    value: '2.0.0',
    source: 'lockfile',
    origin: 'Cargo.lock',
    ...overrides,
  };
}

describe('advisory database', () => {
  it('loads without error', () => {
    expect(error).toBeUndefined();
    expect(database.advisories.length).toBeGreaterThan(0);
  });

  it('validates against its own schema', () => {
    const ajv = new Ajv({ allErrors: true, strict: false, unicodeRegExp: false });
    addFormatsModule.default(ajv);
    const schema = JSON.parse(
      readFileSync(path.join(REPO_ROOT, 'advisories', 'schema.json'), 'utf8'),
    ) as object;
    const data = JSON.parse(
      readFileSync(path.join(REPO_ROOT, 'advisories', 'tauri-advisories.json'), 'utf8'),
    ) as unknown;

    const validate = ajv.compile(schema);
    expect(validate(data), JSON.stringify(validate.errors, null, 2)).toBe(true);
  });

  it('never marks an advisory with exemptions as high confidence', () => {
    // A published "not affected if..." means a version match cannot prove the
    // project is affected. This is a project invariant, enforced over the data.
    const violations = database.advisories
      .filter((advisory) => (advisory.exemptions ?? []).length > 0)
      .filter((advisory) => advisory.suggestedConfidence !== 'heuristic')
      .map((advisory) => advisory.id);
    expect(violations).toEqual([]);
  });

  it('records every published grading, not just one', () => {
    // Scores disagree across sources; quoting one would misrepresent the risk.
    for (const advisory of database.advisories) {
      expect(advisory.severitySources.length, advisory.id).toBeGreaterThan(0);
    }
    const contested = advisoryById('GHSA-2rcp-jvr4-r259');
    const sources = contested.severitySources.map((source) => source.source);
    expect(sources).toContain('GHSA');
    expect(sources).toContain('NVD');
    expect(sources.some((source) => source.startsWith('CNA'))).toBe(true);
  });

  it('keeps npm and cargo as separate package entries', () => {
    const shell = advisoryById('GHSA-c9pr-q8gx-3mgp');
    const ecosystems = shell.packages.map((entry) => entry.ecosystem);
    expect(ecosystems).toContain('npm');
    expect(ecosystems).toContain('cargo');
    expect(shell.packages.find((entry) => entry.ecosystem === 'npm')?.name).toBe(
      '@tauri-apps/plugin-shell',
    );
    expect(shell.packages.find((entry) => entry.ecosystem === 'cargo')?.name).toBe(
      'tauri-plugin-shell',
    );
  });
});

describe('stable and prerelease ranges never bleed into each other', () => {
  // CVE-2024-35222 affects tauri <=1.6.6 and the v2 BETAS only. If a stable v2
  // matched the beta range, every Tauri 2 application on earth would be flagged.
  const iframeBypass = 'GHSA-57fm-592m-34r7';

  it('does not match a stable 2.x against a beta-only range', () => {
    for (const version of ['2.0.0', '2.1.0', '2.10.3', '2.11.5']) {
      const matches = matchDependency(dep({ value: version }), database.advisories);
      expect(
        matches.map((match) => match.advisory.id),
        `tauri ${version} must not match ${iframeBypass}`,
      ).not.toContain(iframeBypass);
    }
  });

  it('matches a prerelease that is inside the beta range', () => {
    for (const version of ['2.0.0-beta.0', '2.0.0-beta.5', '2.0.0-beta.19']) {
      const matches = matchDependency(dep({ value: version }), database.advisories);
      expect(
        matches.map((match) => match.advisory.id),
        `tauri ${version} must match ${iframeBypass}`,
      ).toContain(iframeBypass);
    }
  });

  it('does not match a prerelease past the end of the beta range', () => {
    const matches = matchDependency(dep({ value: '2.0.0-beta.20' }), database.advisories);
    expect(matches.map((match) => match.advisory.id)).not.toContain(iframeBypass);
  });

  it('matches affected stable versions on the v1 line', () => {
    const matches = matchDependency(dep({ value: '1.6.6' }), database.advisories);
    expect(matches.map((match) => match.advisory.id)).toContain(iframeBypass);
  });

  it('does not match the patched v1 version', () => {
    const matches = matchDependency(dep({ value: '1.6.7' }), database.advisories);
    expect(matches.map((match) => match.advisory.id)).not.toContain(iframeBypass);
  });

  it('does not let a stable version match an alpha-only range', () => {
    // CVE-2023-46115 covers @tauri-apps/cli 1.x and the 2.0.0 ALPHAS.
    const stable = matchDependency(
      dep({ name: '@tauri-apps/cli', ecosystem: 'npm', value: '2.0.0', origin: 'package-lock.json' }),
      database.advisories,
    );
    expect(stable).toEqual([]);

    const alpha = matchDependency(
      dep({
        name: '@tauri-apps/cli',
        ecosystem: 'npm',
        value: '2.0.0-alpha.5',
        origin: 'package-lock.json',
      }),
      database.advisories,
    );
    expect(alpha.map((match) => match.advisory.id)).toContain('GHSA-2rcp-jvr4-r259');
  });

  it('reports which kind of range matched', () => {
    expect(matchDependency(dep({ value: '2.0.0-beta.5' }), database.advisories)[0]?.rangeKind).toBe(
      'prerelease',
    );
    expect(matchDependency(dep({ value: '1.6.6' }), database.advisories)[0]?.rangeKind).toBe(
      'stable',
    );
  });
});

describe('ecosystems are matched separately', () => {
  it('does not match an npm package name against a cargo advisory entry', () => {
    const wrongEcosystem = matchDependency(
      dep({ name: 'tauri-plugin-shell', ecosystem: 'npm', value: '2.2.0' }),
      database.advisories,
    );
    expect(wrongEcosystem).toEqual([]);
  });

  it('matches each ecosystem under its own name', () => {
    const cargo = matchDependency(
      dep({ name: 'tauri-plugin-shell', ecosystem: 'cargo', value: '2.2.0' }),
      database.advisories,
    );
    const npm = matchDependency(
      dep({ name: '@tauri-apps/plugin-shell', ecosystem: 'npm', value: '2.2.0' }),
      database.advisories,
    );
    expect(cargo.map((match) => match.advisory.id)).toContain('GHSA-c9pr-q8gx-3mgp');
    expect(npm.map((match) => match.advisory.id)).toContain('GHSA-c9pr-q8gx-3mgp');
  });
});

describe('lockfile-resolved versus manifest-inferred versions', () => {
  it('treats a lockfile version as resolved', () => {
    const match = matchDependency(
      dep({ name: 'tauri-plugin-shell', value: '2.2.0', source: 'lockfile' }),
      database.advisories,
    )[0];
    expect(match?.certainty).toBe('resolved');
  });

  it('does not flag a lockfile version that is patched', () => {
    expect(
      matchDependency(
        dep({ name: 'tauri-plugin-shell', value: '2.2.1', source: 'lockfile' }),
        database.advisories,
      ),
    ).toEqual([]);
  });

  it('treats a Cargo manifest requirement as caret, not exact', () => {
    // The trap: `tauri-plugin-shell = "2.2.0"` means ^2.2.0 and resolves to the
    // newest 2.x, very likely the patched 2.2.1. It can only ever be "possible".
    expect(cargoRequirementToRange('2.2.0')).toBe('^2.2.0');

    const match = matchDependency(
      dep({
        name: 'tauri-plugin-shell',
        value: '2.2.0',
        source: 'manifest',
        origin: 'src-tauri/Cargo.toml',
      }),
      database.advisories,
    )[0];

    expect(match?.certainty).toBe('possible');
  });

  it('leaves explicit cargo operators alone', () => {
    expect(cargoRequirementToRange('=2.2.0')).toBe('=2.2.0');
    expect(cargoRequirementToRange('>=1.0, <2.0')).toBe('>=1.0, <2.0');
    expect(cargoRequirementToRange('^2.2.0')).toBe('^2.2.0');
  });

  it('does not flag a manifest range that cannot include an affected version', () => {
    // ^2.3.0 can never resolve to <=2.2.0, so this is conclusively unaffected.
    expect(
      matchDependency(
        dep({ name: 'tauri-plugin-shell', value: '^2.3.0', source: 'manifest' }),
        database.advisories,
      ),
    ).toEqual([]);
  });

  it('flags a manifest range that could include an affected version', () => {
    const match = matchDependency(
      dep({ name: '@tauri-apps/plugin-shell', ecosystem: 'npm', value: '^2.0.0', source: 'manifest' }),
      database.advisories,
    )[0];
    expect(match?.certainty).toBe('possible');
  });
});

describe('confidence', () => {
  it('is heuristic for a manifest-inferred match, always', () => {
    const match = matchDependency(
      dep({ name: 'tauri-plugin-shell', value: '2.2.0', source: 'manifest' }),
      database.advisories,
    )[0];
    expect(match).toBeDefined();
    if (match !== undefined) expect(confidenceFor(match)).toBe('heuristic');
  });

  it('is heuristic even for a resolved match when the advisory has exemptions', () => {
    const match = matchDependency(
      dep({ name: 'tauri-plugin-shell', value: '2.2.0', source: 'lockfile' }),
      database.advisories,
    )[0];
    expect(match).toBeDefined();
    if (match !== undefined) expect(confidenceFor(match)).toBe('heuristic');
  });
});

describe('describeSeveritySources', () => {
  it('renders every disagreeing source in one line', () => {
    const rendered = describeSeveritySources(advisoryById('GHSA-2rcp-jvr4-r259'));
    expect(rendered).toContain('GHSA: Low');
    expect(rendered).toContain('NVD: 5.5');
    expect(rendered).toContain('8.4');
  });
});

describe('robustness', () => {
  it('does not throw on an unparseable version or range', () => {
    for (const value of ['', 'not-a-version', 'latest', '*', 'file:../x', 'workspace:*']) {
      expect(() =>
        matchDependency(dep({ name: 'tauri', value, source: 'manifest' }), database.advisories),
      ).not.toThrow();
    }
  });

  it('does not match an unknown package name', () => {
    expect(matchDependency(dep({ name: 'left-pad', ecosystem: 'npm' }), database.advisories)).toEqual(
      [],
    );
  });
});
