import path from 'node:path';

import semver from 'semver';

import { loadAdvisories } from './advisories.js';
import { detectConfigVersion, type ConfigVersionVerdict } from './configVersion.js';
import type { DependencyVersion, Ecosystem } from './dependencies.js';
import { discover, readDiscoveredFile, type DiscoveryOptions } from './discovery.js';
import { parseConfigDocument, type ParsedDocument } from './parse/index.js';
import { extractPnpmLock } from './pnpmLock.js';
import { schemaUnavailableReason, validateTauriConfig, type SchemaIssue } from './schemaValidate.js';

/**
 * Everything the rules get to see, assembled once.
 *
 * Files are read and parsed here and nowhere else, so a rule can never re-read or
 * re-parse the project — and adding a rule can never change how the project is
 * interpreted.
 */

export interface AnalyzedConfig {
  /** Absolute path. */
  file: string;
  doc: ParsedDocument;
  /** The parsed document root, when it is an object. */
  value: Record<string, unknown>;
  verdict: ConfigVersionVerdict;
  /** Empty when the version is `unknown`: no schema is applicable. */
  schemaIssues: SchemaIssue[];
}

export interface AnalyzedCapability {
  file: string;
  doc: ParsedDocument;
  value: Record<string, unknown>;
}

export interface AnalyzedTextFile {
  file: string;
  text: string;
}

export interface TauriProject {
  rootDir: string;
  /** Only configs the discriminator placed as v1 or v2. */
  configs: AnalyzedConfig[];
  /** Configs it could not place. No config rule runs against these. */
  unplacedConfigs: AnalyzedConfig[];
  capabilities: AnalyzedCapability[];
  /**
   * Dependency name -> version, merged across manifests and lockfiles.
   *
   * A lockfile entry always replaces a manifest entry for the same package: the
   * manifest holds a range and the lockfile holds what is installed. See
   * `dependencies.ts` for why conflating the two produces false positives.
   */
  npmDependencies: Map<string, DependencyVersion>;
  cargoDependencies: Map<string, DependencyVersion>;
  viteConfigs: AnalyzedTextFile[];
  /** Everything worth telling the user, including every `incomplete` reason. */
  warnings: string[];
  /**
   * Reasons the analysis did not fully cover this project.
   *
   * Unanalyzable is not the same as clean. When a config cannot be parsed, placed
   * as v1/v2, or schema-checked, rules did not run over it — so "zero findings"
   * says nothing about it. This list is what stops that silence from being read
   * as safety: it is surfaced to the user and carried through to the exit code.
   */
  incomplete: string[];
  filesUnparsable: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Warnings name files relative to the scan root, never absolutely.
 *
 * Absolute paths leak the machine's directory layout into CI artifacts and make
 * otherwise identical reports differ between machines. Findings are relativized
 * by the formatters; warnings are prose, so they are built relative from the
 * start.
 */
function relativeTo(rootDir: string, filePath: string): string {
  const relative = path.relative(rootDir, filePath);
  return relative === '' ? path.basename(filePath) : relative;
}

/** Collapses repeated parse complaints — a broken file emits the same code many times. */
function summarizeSyntaxWarnings(warnings: readonly string[]): string {
  const counts = new Map<string, number>();
  for (const warning of warnings) counts.set(warning, (counts.get(warning) ?? 0) + 1);
  return [...counts.entries()]
    .map(([warning, count]) => (count > 1 ? `${warning} (x${String(count)})` : warning))
    .join('; ');
}

/**
 * Records a dependency, resolving collisions conservatively.
 *
 * A lockfile always displaces a manifest: one holds a range, the other holds what
 * is installed.
 *
 * When two *lockfile* entries name the same package — which npm produces
 * routinely, hoisting one version to the top level and nesting another under a
 * dependency — the lower version wins. Both are genuinely installed, so keeping
 * the higher one would silently hide a vulnerable copy that is really on disk.
 * Preferring the lower version turns that false negative into a report the user
 * can dismiss after checking which copy their code actually loads.
 *
 * Between two manifest entries, first writer wins: in a workspace the root
 * manifest usually pins, and overwriting would make results depend on glob order.
 */
function record(into: Map<string, DependencyVersion>, dependency: DependencyVersion): void {
  const existing = into.get(dependency.name);
  if (existing === undefined) {
    into.set(dependency.name, dependency);
    return;
  }

  if (existing.source === 'manifest' && dependency.source === 'lockfile') {
    into.set(dependency.name, dependency);
    return;
  }

  if (existing.source === 'lockfile' && dependency.source === 'lockfile') {
    const current = semver.valid(existing.value);
    const incoming = semver.valid(dependency.value);
    if (current !== null && incoming !== null && semver.lt(incoming, current)) {
      into.set(dependency.name, dependency);
    }
  }
}

/** npm: `"dep": "^1.2.3"`. */
function npmSpecifier(entry: unknown): string | undefined {
  return typeof entry === 'string' ? entry : undefined;
}

/** cargo: `dep = "1.2.3"` or `dep = { version = "1.2.3", features = [...] }`. */
function cargoSpecifier(entry: unknown): string | undefined {
  if (typeof entry === 'string') return entry;
  if (isRecord(entry) && typeof entry['version'] === 'string') return entry['version'];
  return undefined;
}

function collectManifestDependencies(
  table: unknown,
  into: Map<string, DependencyVersion>,
  ecosystem: Ecosystem,
  origin: string,
  readSpecifier: (entry: unknown) => string | undefined,
): void {
  if (!isRecord(table)) return;
  for (const [name, entry] of Object.entries(table)) {
    const value = readSpecifier(entry);
    if (value === undefined) continue;
    record(into, { name, ecosystem, value, source: 'manifest', origin });
  }
}

/** `Cargo.lock` is TOML with a repeated `[[package]]` table. */
function collectCargoLock(
  value: unknown,
  into: Map<string, DependencyVersion>,
  origin: string,
): void {
  if (!isRecord(value)) return;
  const packages = value['package'];
  if (!Array.isArray(packages)) return;

  for (const entry of packages) {
    if (!isRecord(entry)) continue;
    const name = entry['name'];
    const version = entry['version'];
    if (typeof name !== 'string' || typeof version !== 'string') continue;
    record(into, { name, ecosystem: 'cargo', value: version, source: 'lockfile', origin });
  }
}

/**
 * `package-lock.json`, both layouts.
 *
 * v2/v3 key `packages` by install path (`node_modules/pkg`, and nested paths for
 * duplicated versions); v1 nests `dependencies`. Both are walked so the tool
 * works with whatever npm the project last used.
 */
function collectNpmLock(value: unknown, into: Map<string, DependencyVersion>, origin: string): void {
  if (!isRecord(value)) return;

  const packages = value['packages'];
  if (isRecord(packages)) {
    for (const [installPath, entry] of Object.entries(packages)) {
      if (!isRecord(entry)) continue;
      const version = entry['version'];
      if (typeof version !== 'string') continue;
      const marker = installPath.lastIndexOf('node_modules/');
      if (marker === -1) continue;
      const name = installPath.slice(marker + 'node_modules/'.length);
      if (name === '') continue;
      record(into, { name, ecosystem: 'npm', value: version, source: 'lockfile', origin });
    }
  }

  const walkV1 = (table: unknown): void => {
    if (!isRecord(table)) return;
    for (const [name, entry] of Object.entries(table)) {
      if (!isRecord(entry)) continue;
      const version = entry['version'];
      if (typeof version === 'string') {
        record(into, { name, ecosystem: 'npm', value: version, source: 'lockfile', origin });
      }
      walkV1(entry['dependencies']);
    }
  };
  walkV1(value['dependencies']);
}

export function buildProjectContext(rootDir: string, options: DiscoveryOptions = {}): TauriProject {
  const discovery = discover(rootDir, options);

  const project: TauriProject = {
    rootDir: discovery.rootDir,
    configs: [],
    unplacedConfigs: [],
    capabilities: [],
    npmDependencies: new Map(),
    cargoDependencies: new Map(),
    viteConfigs: [],
    warnings: [],
    incomplete: [],
    filesUnparsable: 0,
  };

  /** Records a loss of analysis coverage: shown to the user AND reflected in the exit code. */
  const degrade = (reason: string): void => {
    project.warnings.push(reason);
    project.incomplete.push(reason);
  };

  // A file skipped for size was found and then not analyzed — coverage lost.
  for (const warning of discovery.warnings) degrade(warning);

  // Schema validation degrading to nothing is invisible otherwise: it returns an
  // empty issue list, which is exactly what a clean config returns. Say so.
  for (const version of ['v1', 'v2'] as const) {
    const reason = schemaUnavailableReason(version);
    if (reason !== undefined) {
      degrade(
        `schema validation unavailable for ${version} configs (${reason}); ` +
          'security rules still ran, but schema conformance was not checked',
      );
    }
  }

  for (const file of discovery.files) {
    const shortPath = relativeTo(project.rootDir, file.path);

    const text = readDiscoveredFile(file.path);
    if (text === undefined) {
      project.filesUnparsable += 1;
      degrade(`${shortPath}: could not be read, so it was not analyzed`);
      continue;
    }

    if (file.kind === 'vite-config') {
      project.viteConfigs.push({ file: file.path, text });
      continue;
    }

    if (file.kind === 'other-lock') {
      // pnpm, yarn and bun lockfiles need a YAML or bespoke parser we do not
      // carry. A plain warning, not a coverage loss: without resolved versions
      // we fall back to matching the manifest range, which over-reports rather
      // than under-reports, and every such finding says the version is unknown.
      project.warnings.push(
        `${shortPath}: lockfile format not supported, so resolved dependency versions could ` +
          'not be read. Dependency findings fall back to the version ranges declared in the ' +
          'manifest and are reported as possible rather than confirmed.',
      );
      continue;
    }

    const doc = parseConfigDocument(file.path, text);
    if (doc === undefined) {
      project.filesUnparsable += 1;
      degrade(`${shortPath}: could not be parsed, so it was not analyzed`);
      continue;
    }

    // jsonc-parser recovers from malformed input rather than failing, which keeps
    // one broken file from hiding every other finding. But silence here is
    // actively misleading: a file recovered from garbage becomes an empty object,
    // and the user would be told "could not determine config version" when the
    // real problem is that the file is not valid JSON at all. Say the real thing.
    if (doc.syntaxWarnings.length > 0) {
      degrade(
        `${shortPath}: not valid JSON (${summarizeSyntaxWarnings(doc.syntaxWarnings)}). ` +
          'Tauri may fail to load this file; analysis continued on what could be recovered',
      );
    }

    switch (file.kind) {
      case 'tauri-config': {
        if (!isRecord(doc.value)) {
          // Valid JSON that is not an object — an array, a bare string, `null`.
          // Counting it and moving on would leave the run reporting zero findings
          // and exiting 0, which reads as "this config is fine" when in truth no
          // rule ever saw it.
          project.filesUnparsable += 1;
          degrade(
            `${shortPath}: parsed, but its root is not an object, so no config rules ran ` +
              'over it',
          );
          break;
        }
        const verdict = detectConfigVersion(doc.value);
        const analyzed: AnalyzedConfig = {
          file: file.path,
          doc,
          value: doc.value,
          verdict,
          schemaIssues:
            verdict.version === 'unknown' ? [] : validateTauriConfig(doc.value, verdict.version),
        };
        if (verdict.version === 'unknown') {
          project.unplacedConfigs.push(analyzed);
          degrade(
            `${shortPath}: could not determine Tauri config version, so no config rules ran ` +
              `(${verdict.reason})`,
          );
        } else {
          project.configs.push(analyzed);
        }
        break;
      }
      case 'capability': {
        if (isRecord(doc.value)) {
          project.capabilities.push({ file: file.path, doc, value: doc.value });
        } else {
          // A capability that cannot be read is worse than a missing rule: rules
          // that check whether a permission is *absent* would conclude it is not
          // granted and suppress a real finding. Silence here turns into a false
          // negative elsewhere, so it has to be visible.
          project.filesUnparsable += 1;
          degrade(
            `${shortPath}: parsed, but its root is not an object, so the permissions it ` +
              'grants could not be determined',
          );
        }
        break;
      }
      case 'package-manifest': {
        if (isRecord(doc.value)) {
          for (const table of ['dependencies', 'devDependencies']) {
            collectManifestDependencies(
              doc.value[table],
              project.npmDependencies,
              'npm',
              shortPath,
              npmSpecifier,
            );
          }
        }
        break;
      }
      case 'cargo-manifest': {
        if (isRecord(doc.value)) {
          for (const table of ['dependencies', 'build-dependencies']) {
            collectManifestDependencies(
              doc.value[table],
              project.cargoDependencies,
              'cargo',
              shortPath,
              cargoSpecifier,
            );
          }
        }
        break;
      }
      case 'cargo-lock': {
        collectCargoLock(doc.value, project.cargoDependencies, shortPath);
        break;
      }
      case 'npm-lock': {
        collectNpmLock(doc.value, project.npmDependencies, shortPath);
        break;
      }
      case 'pnpm-lock': {
        const extracted = extractPnpmLock(doc.value, shortPath);
        if (extracted.unsupportedReason !== undefined) {
          // Do not guess at an unrecognized key format: attributing a wrong
          // version to a package is worse than admitting we cannot read it.
          project.warnings.push(
            `${shortPath}: ${extracted.unsupportedReason}. Dependency findings fall back to ` +
              'the version ranges declared in package.json and are reported as possible ' +
              'rather than confirmed.',
          );
        }
        for (const dependency of extracted.dependencies) {
          record(project.npmDependencies, dependency);
        }
        break;
      }
    }
  }

  // A Tauri application is a Rust application, so a placed config with no
  // dependency manifest anywhere in scope means the dependency rules examined
  // nothing at all. Reporting that as "no vulnerable dependencies" would be the
  // same silence this project refuses everywhere else — and it is not
  // hypothetical: it happens whenever the scan is pointed at a subdirectory
  // whose manifest lives a level up, and it is true of Tauri's own v1 examples,
  // which carry a tauri.conf.json and no Cargo.toml of their own.
  const hasCargoManifest = discovery.files.some((file) => file.kind === 'cargo-manifest');
  const hasNpmManifest = discovery.files.some((file) => file.kind === 'package-manifest');
  if (project.configs.length > 0 && !hasCargoManifest && !hasNpmManifest) {
    degrade(
      'a Tauri configuration was analyzed but no Cargo.toml or package.json was found, so no ' +
        'dependency was checked against known vulnerabilities. If the manifest lives outside ' +
        'the scanned directory, scan from the directory that contains it',
    );
  } else if (project.configs.length > 0 && !hasCargoManifest) {
    // A warning rather than a coverage loss: npm dependencies were checked, so
    // "no vulnerable dependency" is imprecise here rather than empty. Only the
    // case where *nothing* was checked earns exit 2 — a partial answer is still
    // an answer, and treating it otherwise would fail every project whose Rust
    // manifest sits outside the scanned directory.
    project.warnings.push(
      'no Cargo.toml was found, so no Rust dependency was checked against known ' +
        'vulnerabilities. npm dependencies were checked',
    );
  }

  // Losing the advisory database silently would be the worst kind of clean
  // result: every dependency rule would return nothing, and the run would exit 0
  // reporting no known-vulnerable dependencies when in fact none were checked.
  // `loadAdvisories` records why it failed precisely so this can be said out loud.
  const advisoryLoad = loadAdvisories();
  if (advisoryLoad.error !== undefined) {
    degrade(
      `the advisory database could not be loaded (${advisoryLoad.error}), so no dependency ` +
        'was checked against known vulnerabilities',
    );
  }

  return project;
}
