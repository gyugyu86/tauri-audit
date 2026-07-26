import { readFileSync } from 'node:fs';

import semver from 'semver';

import { isExactVersion, toRange, type DependencyVersion, type Ecosystem } from './dependencies.js';

/**
 * Advisory matching.
 *
 * Two rules govern everything here, and both exist to avoid confidently wrong
 * findings:
 *
 * 1. Stable and prerelease versions are matched by separate comparators against
 *    separate range lists. A stable 2.x must never match a beta-only advisory.
 * 2. A version known only from a manifest is a range, not a version, and can only
 *    produce a "might be affected" answer.
 */

export interface SeveritySource {
  source: string;
  label?: string;
  score?: number;
  cvssVersion?: string;
  vector?: string;
  note?: string;
}

export interface Exemption {
  description: string;
  verify: string;
  staticallyCheckable: boolean;
}

export interface AffectedPackage {
  ecosystem: Ecosystem;
  name: string;
  stableRanges?: string[];
  prereleaseRanges?: string[];
  patched?: string[];
}

export interface Advisory {
  id: string;
  aliases?: string[];
  summary: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  severitySources: SeveritySource[];
  cwe?: string[];
  packages: AffectedPackage[];
  exemptions?: Exemption[];
  platforms?: string[];
  suggestedConfidence: 'high' | 'heuristic';
  deprecationNote?: string;
  references: string[];
}

export interface AdvisoryDatabase {
  updated: string;
  advisories: Advisory[];
}

export interface LoadedAdvisories {
  database: AdvisoryDatabase;
  /** Set when the database could not be loaded; dependency rules must degrade. */
  error?: string;
}

let cached: LoadedAdvisories | undefined;

export function loadAdvisories(): LoadedAdvisories {
  if (cached !== undefined) return cached;

  try {
    const url = new URL('../../advisories/tauri-advisories.json', import.meta.url);
    const parsed = JSON.parse(readFileSync(url, 'utf8')) as AdvisoryDatabase;
    if (!Array.isArray(parsed.advisories)) throw new Error('advisories is not an array');
    cached = { database: parsed };
  } catch (error) {
    // Losing the advisory database is a loss of analysis coverage, not a reason
    // to report a clean project — the caller degrades visibly.
    cached = {
      database: { updated: 'unknown', advisories: [] },
      error: error instanceof Error ? error.message : String(error),
    };
  }

  return cached;
}

/** Test seam: forces the next `loadAdvisories()` to re-read from disk. */
export function resetAdvisoryCache(): void {
  cached = undefined;
}

export type MatchCertainty =
  /** A lockfile pinned an affected version. */
  | 'resolved'
  /** A manifest range permits an affected version; what is installed is unknown. */
  | 'possible';

export interface AdvisoryMatch {
  advisory: Advisory;
  package: AffectedPackage;
  dependency: DependencyVersion;
  certainty: MatchCertainty;
  /** The advisory range that matched. */
  range: string;
  rangeKind: 'stable' | 'prerelease';
}

/**
 * Does a concrete version fall inside this package's affected ranges?
 *
 * Stable and prerelease versions are kept strictly apart:
 *
 * - A stable version is tested only against `stableRanges`, with semver's default
 *   behaviour, which excludes prereleases from ranges.
 * - A prerelease is tested only against `prereleaseRanges`, with
 *   `includePrerelease: true` — without that flag `satisfies` refuses to match a
 *   prerelease unless the range names the same major.minor.patch tuple, so
 *   `2.0.0-beta.5` would silently fail to match `>=2.0.0-beta.0 <=2.0.0-beta.19`.
 *
 * The separation is deliberate and asymmetric. CVE-2024-35222 affects Tauri v2
 * betas but not v2 stable; letting a stable version fall through to a prerelease
 * range would flag every v2 application in existence. The cost is a false
 * negative for a prerelease that upstream only documented as a stable range,
 * which is the trade this project always takes.
 */
function matchConcreteVersion(
  version: string,
  affected: AffectedPackage,
): { range: string; kind: 'stable' | 'prerelease' } | undefined {
  const parsed = semver.parse(version);
  if (parsed === null) return undefined;

  if (parsed.prerelease.length > 0) {
    for (const range of affected.prereleaseRanges ?? []) {
      if (semver.satisfies(parsed, range, { includePrerelease: true })) {
        return { range, kind: 'prerelease' };
      }
    }
    return undefined;
  }

  for (const range of affected.stableRanges ?? []) {
    if (semver.satisfies(parsed, range)) return { range, kind: 'stable' };
  }
  return undefined;
}

/**
 * Could anything this declared range permits be affected?
 *
 * Used when only a manifest is available. `intersects` is the right question:
 * `^2.2.0` overlaps `<=2.2.0` (it permits exactly 2.2.0) even though it will
 * almost certainly install 2.2.1. A range that does not intersect is
 * conclusively unaffected; one that does is merely suspicious.
 */
function matchDeclaredRange(
  declared: string,
  affected: AffectedPackage,
): { range: string; kind: 'stable' | 'prerelease' } | undefined {
  for (const range of affected.stableRanges ?? []) {
    try {
      if (semver.intersects(declared, range)) return { range, kind: 'stable' };
    } catch {
      continue;
    }
  }
  for (const range of affected.prereleaseRanges ?? []) {
    try {
      if (semver.intersects(declared, range, { includePrerelease: true })) {
        return { range, kind: 'prerelease' };
      }
    } catch {
      continue;
    }
  }
  return undefined;
}

export function matchDependency(
  dependency: DependencyVersion,
  advisories: readonly Advisory[],
): AdvisoryMatch[] {
  const matches: AdvisoryMatch[] = [];

  for (const advisory of advisories) {
    for (const affected of advisory.packages) {
      if (affected.ecosystem !== dependency.ecosystem) continue;
      if (affected.name !== dependency.name) continue;

      const concrete =
        dependency.source === 'lockfile' && isExactVersion(dependency.value)
          ? matchConcreteVersion(dependency.value, affected)
          : undefined;

      if (concrete !== undefined) {
        matches.push({
          advisory,
          package: affected,
          dependency,
          certainty: 'resolved',
          range: concrete.range,
          rangeKind: concrete.kind,
        });
        continue;
      }

      if (dependency.source === 'lockfile') continue;

      const declared = matchDeclaredRange(
        toRange(dependency.ecosystem, dependency.value),
        affected,
      );
      if (declared !== undefined) {
        matches.push({
          advisory,
          package: affected,
          dependency,
          certainty: 'possible',
          range: declared.range,
          rangeKind: declared.kind,
        });
      }
    }
  }

  return matches;
}

/**
 * The confidence a finding for this match should carry.
 *
 * Never stronger than the advisory's own `suggestedConfidence`, which is
 * `heuristic` for anything with a published exemption. A version match cannot
 * prove a project is affected when the advisory itself says "not affected
 * if…" — and it cannot prove it either when we only inferred the version from a
 * range.
 */
export function confidenceFor(match: AdvisoryMatch): 'high' | 'heuristic' {
  if (match.certainty === 'possible') return 'heuristic';
  return match.advisory.suggestedConfidence;
}

/** Renders every published grading, since they routinely disagree. */
export function describeSeveritySources(advisory: Advisory): string {
  return advisory.severitySources
    .map((source) => {
      const parts = [source.label, source.score === undefined ? undefined : String(source.score)]
        .filter((part) => part !== undefined)
        .join(' ');
      const scored = parts === '' ? '' : `: ${parts}`;
      const cvss = source.cvssVersion === undefined ? '' : ` (CVSS ${source.cvssVersion})`;
      return `${source.source}${scored}${cvss}`;
    })
    .join(' / ');
}
