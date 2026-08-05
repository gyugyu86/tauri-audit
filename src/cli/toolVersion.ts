import { readFileSync } from 'node:fs';

/**
 * The tool's own version, read from its package.json at runtime.
 *
 * One source for every place that reports it: `--version`, and SARIF's
 * `tool.driver.version`. Those disagreeing would be worse than either being
 * absent — a SARIF upload is how a scan is attributed to a tool build.
 *
 * The path is resolved from this module rather than the working directory,
 * because the CLI runs against someone else's project and `process.cwd()` is
 * their package.json, not ours.
 *
 * A failure here returns `0.0.0` rather than throwing: refusing to report
 * findings because a version string could not be read would be the wrong
 * trade. It is a deliberately impossible-looking sentinel, and
 * `toolVersion.test.ts` asserts the real version is what actually comes back,
 * so the fallback cannot quietly become the normal answer.
 */
export function readToolVersion(): string {
  try {
    const url = new URL('../../package.json', import.meta.url);
    const parsed = JSON.parse(readFileSync(url, 'utf8')) as { version?: unknown };
    return typeof parsed.version === 'string' ? parsed.version : '0.0.0';
  } catch {
    return '0.0.0';
  }
}
