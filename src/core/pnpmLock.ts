import type { DependencyVersion } from './dependencies.js';

/**
 * Extracts resolved package versions from `pnpm-lock.yaml`.
 *
 * pnpm is the majority package manager in the Tauri ecosystem, so falling back
 * to manifest ranges here would mean dependency findings are permanently
 * "possible" for most users.
 *
 * The `packages` map is the extraction target rather than `dependencies` or
 * `importers`, because it is the one section present in every lockfile version
 * and it lists every installed version including transitive ones. Its key
 * encodes name and version, in a format that changed twice.
 */

/**
 * Lockfile versions this parser understands.
 *
 * pnpm went 5 -> 6 -> 9; majors 7 and 8 were never used. An unrecognized version
 * is reported and the caller falls back to manifest ranges — guessing at an
 * unknown key format would silently attribute wrong versions to packages, which
 * is worse than admitting we cannot read it.
 */
const SUPPORTED_MAJORS = new Set([5, 6, 9]);

export interface PnpmLockResult {
  dependencies: DependencyVersion[];
  /** Set when the lockfile could not be read; the caller warns and falls back. */
  unsupportedReason?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** `lockfileVersion` is a number in v5 and a quoted string from v6 onwards. */
function readMajor(value: unknown): number | undefined {
  if (typeof value === 'number') return Math.floor(value);
  if (typeof value === 'string') {
    const major = Number.parseInt(value, 10);
    return Number.isNaN(major) ? undefined : major;
  }
  return undefined;
}

/**
 * Splits a `packages` key into name and version.
 *
 * Three shapes are in the wild:
 *
 *   v5  `/@scope/name/1.2.3`   `/name/1.2.3`
 *   v6  `/@scope/name@1.2.3`   `/name@1.2.3`
 *   v9  `@scope/name@1.2.3`    `name@1.2.3`
 *
 * Any of them may carry a peer-dependency suffix in parentheses, e.g.
 * `/name@1.2.3(react@18.0.0)`, which is stripped first — otherwise the peer's
 * version would be parsed as the package's own.
 */
export function parsePackageKey(key: string): { name: string; version: string } | undefined {
  const withoutPeers = key.replace(/\(.*\)$/, '');
  const body = withoutPeers.startsWith('/') ? withoutPeers.slice(1) : withoutPeers;
  if (body === '') return undefined;

  // v6 / v9: the version follows the last '@', which is never at index 0 (that
  // '@' would be the scope marker).
  const at = body.lastIndexOf('@');
  if (at > 0) {
    const name = body.slice(0, at);
    const version = body.slice(at + 1);
    if (name !== '' && /^\d/.test(version)) return { name, version };
  }

  // v5: the version follows the last '/'.
  const slash = body.lastIndexOf('/');
  if (slash > 0) {
    const name = body.slice(0, slash);
    const version = body.slice(slash + 1);
    if (name !== '' && /^\d/.test(version)) return { name, version };
  }

  return undefined;
}

export function extractPnpmLock(value: unknown, origin: string, file: string): PnpmLockResult {
  if (!isRecord(value)) {
    return { dependencies: [], unsupportedReason: 'lockfile root is not a mapping' };
  }

  const major = readMajor(value['lockfileVersion']);
  if (major === undefined) {
    return { dependencies: [], unsupportedReason: 'no readable lockfileVersion' };
  }
  if (!SUPPORTED_MAJORS.has(major)) {
    return {
      dependencies: [],
      unsupportedReason: `lockfileVersion ${String(major)}.x is not supported (supported: ${[...SUPPORTED_MAJORS].join(', ')}.x)`,
    };
  }

  const packages = value['packages'];
  if (!isRecord(packages)) {
    return { dependencies: [], unsupportedReason: 'no packages section' };
  }

  const dependencies: DependencyVersion[] = [];
  for (const key of Object.keys(packages)) {
    const parsed = parsePackageKey(key);
    if (parsed === undefined) continue;
    dependencies.push({
      name: parsed.name,
      ecosystem: 'npm',
      value: parsed.version,
      source: 'lockfile',
      origin,
      file,
    });
  }

  return { dependencies };
}
