import semver from 'semver';

/**
 * How we know a dependency's version — and how much that is worth.
 *
 * This distinction is the difference between a usable dependency rule and a
 * false-positive machine. A manifest records a *range*; a lockfile records what
 * is actually installed.
 *
 * The trap is Cargo: `tauri-plugin-shell = "2.2.0"` does not mean 2.2.0, it means
 * `^2.2.0`, which resolves to the newest 2.x — very likely the patched 2.2.1.
 * Reading that as "version 2.2.0, vulnerable" flags a project that is fine. npm
 * has the same shape with an explicit `^`.
 *
 * So a manifest can only ever answer "could this range include a vulnerable
 * version?", never "is this project vulnerable?".
 */

export type Ecosystem = 'npm' | 'cargo';

export type VersionSource = 'lockfile' | 'manifest';

export interface DependencyVersion {
  name: string;
  ecosystem: Ecosystem;
  /** The version string as resolved, or the range as declared. */
  value: string;
  source: VersionSource;
  /**
   * Where it came from, relative to the scan root. For display only.
   *
   * A finding's `file` must be absolute — reporters relativize it themselves,
   * SARIF against the checkout root rather than the scan root. Putting this
   * string there instead produced a SARIF URI missing its leading directories,
   * which GitHub accepted and then could not resolve to a file. Use `file`.
   */
  origin: string;
  /** Absolute path to the manifest or lockfile. This is what a finding reports. */
  file: string;
}

/**
 * Cargo defaults to caret semantics for a bare version requirement.
 *
 * `"2.2.0"` in Cargo.toml is `^2.2.0`. Treating it as an exact pin is the single
 * most likely way to produce a wrong dependency finding for a Rust project.
 */
export function cargoRequirementToRange(requirement: string): string {
  const trimmed = requirement.trim();
  if (trimmed === '') return '*';
  // A bare version, or a wildcard like `2.*`, carries implicit caret semantics.
  return /^\d/.test(trimmed) ? `^${trimmed}` : trimmed;
}

export function npmSpecifierToRange(specifier: string): string {
  return specifier.trim();
}

export function toRange(ecosystem: Ecosystem, specifier: string): string {
  return ecosystem === 'cargo'
    ? cargoRequirementToRange(specifier)
    : npmSpecifierToRange(specifier);
}

/** True when the string is a single concrete version rather than a range. */
export function isExactVersion(value: string): boolean {
  return semver.valid(value) !== null;
}
