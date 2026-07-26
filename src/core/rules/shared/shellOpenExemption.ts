import type { TauriProject } from '../../projectContext.js';

/**
 * The published exemptions for CVE-2025-31477, checked against the project.
 *
 * The advisory names three ways to not be affected. Two are configuration, one
 * is reachability:
 *
 *   "You are not affected if you have explicitly configured a validation regex
 *    or manually set the `open` endpoint to `true` in the plugin configuration."
 *
 *   "- Defining a non matching regex like `tauri^` in the plugin configuration
 *    - Removing `shell:default` and all instances of `shell:allow-open` from the
 *      capabilities"
 *
 * The polarity is the opposite of every configuration rule in this project:
 * **an unset `open` is the affected state.** The bug was in the default
 * validation that an unset value implies, so writing the value down — to `true`,
 * to a regex, or to `false` — is what makes an application safe. Assuming the
 * familiar "absent means default means fine" would miss exactly the population
 * the advisory is about.
 *
 * An exemption suppresses a finding, so an exemption we cannot verify must never
 * count as satisfied. Every check here reports *unknown* separately from *no*,
 * and only a confirmed exemption suppresses.
 */

export interface ExemptionCheck {
  /** `true` only when the exemption is positively confirmed. */
  satisfied: boolean;
  /** What was examined, for the finding text. */
  detail: string;
}

export interface ShellOpenAssessment {
  configExemption: ExemptionCheck;
  reachability: ExemptionCheck;
  /** True when any exemption is confirmed, so no finding should be reported. */
  exempt: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Is `plugins.shell.open` written down in every v2 config?
 *
 * `PluginConfig` is `additionalProperties: true` in the official schema with no
 * inner shape, so nothing here is schema-validated and every level has to be
 * read defensively.
 */
function checkConfigExemption(project: TauriProject): ExemptionCheck {
  const v2Configs = project.configs.filter((config) => config.verdict.version === 'v2');

  if (v2Configs.length === 0) {
    return {
      satisfied: false,
      detail:
        'no v2 configuration was analyzed, so the shell plugin configuration could not be ' +
        'checked',
    };
  }

  const unset: string[] = [];
  const set: string[] = [];

  for (const config of v2Configs) {
    const plugins = config.value['plugins'];
    const shell = isRecord(plugins) ? plugins['shell'] : undefined;
    const open = isRecord(shell) ? shell['open'] : undefined;

    // `undefined` covers every path that never reaches a value: no plugins
    // table, no shell entry, no open key. All of them mean the default applies,
    // and the default is the vulnerability.
    if (open === undefined) unset.push(config.file);
    else set.push(`${config.file} (open: ${JSON.stringify(open)})`);
  }

  if (unset.length === 0) {
    return {
      satisfied: true,
      detail: `plugins.shell.open is set explicitly in every analyzed config: ${set.join('; ')}`,
    };
  }

  return {
    satisfied: false,
    detail: `plugins.shell.open is not set in ${unset.length} of ${v2Configs.length} analyzed config(s), so the broken default validation applies`,
  };
}

/** Permission identifiers that make the `open` endpoint reachable. */
const OPEN_GRANTING_PERMISSIONS = new Set(['shell:default', 'shell:allow-open']);

/** Reads a permission entry, which may be a bare string or an object. */
function permissionIdentifier(entry: unknown): string | undefined {
  if (typeof entry === 'string') return entry;
  if (isRecord(entry) && typeof entry['identifier'] === 'string') return entry['identifier'];
  return undefined;
}

/**
 * Can the frontend reach `shell|open` at all?
 *
 * Suppression requires proving a negative, so this only reports `satisfied` when
 * every capability was readable and none of them granted the endpoint.
 *
 * Absence of capability files is deliberately not treated as proof. Capabilities
 * can be registered from Rust at runtime, so an empty `capabilities/` directory
 * does not establish that no permission is granted — it establishes that we
 * cannot see them.
 */
function checkReachability(project: TauriProject): ExemptionCheck {
  if (project.incomplete.length > 0) {
    return {
      satisfied: false,
      detail:
        'part of the project could not be analyzed, so the capabilities could not be ' +
        'enumerated with confidence',
    };
  }

  if (project.capabilities.length === 0) {
    return {
      satisfied: false,
      detail:
        'no capability files were found. That is not proof the endpoint is unreachable — ' +
        'capabilities can also be registered from Rust at runtime',
    };
  }

  const granting: string[] = [];

  for (const capability of project.capabilities) {
    const permissions = capability.value['permissions'];
    if (!Array.isArray(permissions)) {
      return {
        satisfied: false,
        detail: `${capability.file}: its permissions list could not be read, so the endpoint may still be granted`,
      };
    }

    for (const entry of permissions) {
      const identifier = permissionIdentifier(entry);
      if (identifier === undefined) {
        return {
          satisfied: false,
          detail: `${capability.file}: a permission entry could not be read, so the endpoint may still be granted`,
        };
      }
      if (OPEN_GRANTING_PERMISSIONS.has(identifier)) granting.push(`${capability.file} (${identifier})`);
    }
  }

  if (granting.length === 0) {
    return {
      satisfied: true,
      detail: `no capability grants shell:default or shell:allow-open (checked ${String(project.capabilities.length)} capability file(s))`,
    };
  }

  return {
    satisfied: false,
    detail: `the open endpoint is granted by ${granting.join('; ')}`,
  };
}

export function assessShellOpen(project: TauriProject): ShellOpenAssessment {
  const configExemption = checkConfigExemption(project);
  const reachability = checkReachability(project);

  return {
    configExemption,
    reachability,
    exempt: configExemption.satisfied || reachability.satisfied,
  };
}
