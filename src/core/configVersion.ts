import type { TauriConfigVersion } from './types.js';

/**
 * Decides whether a Tauri config document is v1 or v2.
 *
 * This runs before any rule does, and it is the single structural defence against
 * the largest false-positive source in a tool that supports both generations:
 * applying a v1 rule to a v2 config, or the reverse. The two formats share key
 * names (`security`, `csp`, `freezePrototype`) while meaning different things at
 * different paths, so a rule that merely "looks for its key" would fire on the
 * wrong generation.
 *
 * The engine — not each rule — filters rules by this verdict. A rule cannot
 * accidentally opt out.
 *
 * When the answer is not clear, the verdict is `unknown` and NO config rules run.
 * That is a deliberate false-negative: guessing here produces confident nonsense.
 */

export interface ConfigVersionVerdict {
  version: TauriConfigVersion;
  /** Human-readable justification, surfaced to the user when `unknown`. */
  reason: string;
  signals: { v1: string[]; v2: string[] };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Signals unique to the v1 schema.
 *
 * v1 nests everything app-related under a top-level `tauri` key and keeps
 * product metadata under `package`. Neither exists in v2.
 */
function collectV1Signals(root: Record<string, unknown>): string[] {
  const signals: string[] = [];

  if (isRecord(root['tauri'])) {
    signals.push('top-level `tauri` object');
    if (isRecord(root['tauri']['allowlist'])) {
      signals.push('`tauri.allowlist` (v1 opt-in API model)');
    }
  }
  if (isRecord(root['package'])) signals.push('top-level `package` object');

  const build = root['build'];
  if (isRecord(build)) {
    if ('distDir' in build) signals.push('`build.distDir` (renamed in v2)');
    if ('devPath' in build) signals.push('`build.devPath` (renamed in v2)');
    if ('withGlobalTauri' in build) signals.push('`build.withGlobalTauri` (moved in v2)');
  }

  return signals;
}

/**
 * Signals unique to the v2 schema.
 *
 * v2 hoists product metadata to the root, introduces `app`, and renames the
 * build keys.
 */
function collectV2Signals(root: Record<string, unknown>): string[] {
  const signals: string[] = [];

  if (isRecord(root['app'])) signals.push('top-level `app` object');
  if (typeof root['identifier'] === 'string') signals.push('top-level `identifier`');
  if (isRecord(root['bundle'])) signals.push('top-level `bundle` object');
  if (typeof root['mainBinaryName'] === 'string') signals.push('top-level `mainBinaryName`');

  const build = root['build'];
  if (isRecord(build)) {
    if ('frontendDist' in build) signals.push('`build.frontendDist` (v2 name)');
    if ('devUrl' in build) signals.push('`build.devUrl` (v2 name)');
  }

  const schema = root['$schema'];
  if (typeof schema === 'string' && /schema\.tauri\.app\/config\/2/.test(schema)) {
    signals.push('`$schema` points at a v2 config schema');
  }

  return signals;
}

export function detectConfigVersion(value: unknown): ConfigVersionVerdict {
  if (!isRecord(value)) {
    return {
      version: 'unknown',
      reason: 'document root is not a JSON object',
      signals: { v1: [], v2: [] },
    };
  }

  const v1 = collectV1Signals(value);
  const v2 = collectV2Signals(value);

  if (v1.length > 0 && v2.length === 0) {
    return { version: 'v1', reason: `v1 signals: ${v1.join(', ')}`, signals: { v1, v2 } };
  }
  if (v2.length > 0 && v1.length === 0) {
    return { version: 'v2', reason: `v2 signals: ${v2.join(', ')}`, signals: { v1, v2 } };
  }
  if (v1.length > 0 && v2.length > 0) {
    return {
      version: 'unknown',
      reason:
        `document mixes v1 and v2 markers (v1: ${v1.join(', ')}; v2: ${v2.join(', ')}). ` +
        'No config rules were applied. If this is a partially migrated project, ' +
        'finish the migration or split the overlay files.',
      signals: { v1, v2 },
    };
  }

  return {
    version: 'unknown',
    reason: 'no recognizable Tauri v1 or v2 markers',
    signals: { v1, v2 },
  };
}
