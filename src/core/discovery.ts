import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import fastGlob from 'fast-glob';

/** What role a discovered file plays in the analysis. */
export type FileKind =
  | 'tauri-config'
  | 'capability'
  | 'cargo-manifest'
  | 'package-manifest'
  | 'cargo-lock'
  | 'npm-lock'
  | 'pnpm-lock'
  | 'other-lock'
  | 'vite-config';

export interface DiscoveredFile {
  /** Absolute path. */
  path: string;
  kind: FileKind;
}

export interface DiscoveryResult {
  rootDir: string;
  files: DiscoveredFile[];
  /** Non-fatal problems worth telling the user about (oversized files, etc.). */
  warnings: string[];
}

export interface DiscoveryOptions {
  /** Skip files larger than this. Defaults to 2 MiB — no real config is close. */
  maxFileBytes?: number;
}

const DEFAULT_MAX_FILE_BYTES = 2 * 1024 * 1024;

/**
 * Directories that never contain a project's own configuration.
 *
 * `target/` and `node_modules/` matter most: both contain vendored copies of
 * other projects' Tauri configs, and analyzing those would attribute someone
 * else's settings to this project.
 */
const IGNORED_DIRECTORIES = [
  '**/node_modules/**',
  '**/.git/**',
  '**/target/**',
  '**/dist/**',
  '**/build/**',
  '**/out/**',
  '**/.next/**',
  '**/.nuxt/**',
  '**/.svelte-kit/**',
  '**/coverage/**',
];

/**
 * Glob patterns per file kind.
 *
 * Deliberately not anchored to `src-tauri/`: real projects put configs elsewhere.
 * yaak, for example, has no `src-tauri/` at all and carries two Tauri apps under
 * `crates-tauri/<app>/`. Anchoring would silently analyze nothing.
 */
const PATTERNS: Readonly<Record<FileKind, readonly string[]>> = {
  'tauri-config': [
    '**/tauri.conf.json',
    '**/tauri.conf.json5',
    // Platform/flavor overlays: tauri.macos.conf.json, tauri.windows.conf.json, ...
    '**/tauri.*.conf.json',
    '**/tauri.*.conf.json5',
    '**/Tauri.toml',
    '**/tauri.toml',
  ],
  capability: ['**/capabilities/*.json'],
  'cargo-manifest': ['**/Cargo.toml'],
  'package-manifest': ['**/package.json'],
  // Lockfiles carry the versions actually installed. A manifest only carries a
  // range, and a range that permits a vulnerable version usually resolves to a
  // fixed one — matching advisories against manifests alone is a false-positive
  // machine.
  'cargo-lock': ['**/Cargo.lock'],
  'npm-lock': ['**/package-lock.json'],
  'pnpm-lock': ['**/pnpm-lock.yaml'],
  // Recognized so we can say we cannot read them, rather than silently treating
  // the project as having no lockfile. yarn v1 uses a bespoke format and bun's
  // is partly binary; both are left for a later release.
  'other-lock': ['**/yarn.lock', '**/bun.lock', '**/bun.lockb'],
  'vite-config': ['**/vite.config.{js,mjs,cjs,ts,mts,cts}'],
};

/**
 * Finds the files tauri-audit knows how to reason about.
 *
 * Symbolic links are not followed. A link pointing outside the scan root would
 * let a crafted repository pull unrelated files into the report, and following
 * them buys nothing for real projects.
 */
export function discover(rootDir: string, options: DiscoveryOptions = {}): DiscoveryResult {
  const absoluteRoot = path.resolve(rootDir);
  const maxFileBytes = options.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES;
  const warnings: string[] = [];

  const seen = new Map<string, FileKind>();

  for (const [kind, patterns] of Object.entries(PATTERNS) as [FileKind, readonly string[]][]) {
    let matches: string[];
    try {
      matches = fastGlob.sync([...patterns], {
        cwd: absoluteRoot,
        absolute: true,
        onlyFiles: true,
        followSymbolicLinks: false,
        dot: false,
        suppressErrors: true,
        ignore: IGNORED_DIRECTORIES,
      });
    } catch (error) {
      // A glob failure on one kind must not lose the others — but it must not
      // pass unmentioned either. Losing the `capability` kind silently, for
      // example, makes rules that ask whether a permission is granted conclude
      // it is not, which suppresses real findings.
      warnings.push(
        `could not search for ${kind} files (${error instanceof Error ? error.message : String(error)}), ` +
          'so any of them were not analyzed',
      );
      continue;
    }

    for (const match of matches) {
      const normalized = path.resolve(match);

      // Defence in depth: `followSymbolicLinks: false` should already prevent
      // this, but a resolved path outside the root is never ours to report on.
      if (normalized !== absoluteRoot && !normalized.startsWith(absoluteRoot + path.sep)) {
        continue;
      }

      if (seen.has(normalized)) continue;

      let size: number;
      try {
        size = statSync(normalized).size;
      } catch {
        continue;
      }

      if (size > maxFileBytes) {
        warnings.push(
          `skipped ${path.relative(absoluteRoot, normalized)}: ${String(size)} bytes exceeds the ${String(maxFileBytes)} byte limit`,
        );
        continue;
      }

      seen.set(normalized, kind);
    }
  }

  const files = [...seen.entries()]
    .map(([filePath, kind]) => ({ path: filePath, kind }))
    .sort((a, b) => a.path.localeCompare(b.path));

  return { rootDir: absoluteRoot, files, warnings };
}

/**
 * Reads a discovered file as UTF-8, or returns `undefined`.
 *
 * Callers treat `undefined` as "unparsable, keep going". Binary content is not
 * rejected here — the parsers reject it, and doing it in one place is enough.
 */
export function readDiscoveredFile(filePath: string): string | undefined {
  try {
    return readFileSync(filePath, 'utf8');
  } catch {
    return undefined;
  }
}
