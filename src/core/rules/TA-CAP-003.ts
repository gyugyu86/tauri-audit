import {
  isFilesystemWide,
  isRecursive,
  leadingVariable,
  PATH_VARIABLES,
  type PathScope,
} from './shared/pathVariables.js';

import type { Finding } from '../types.js';
import type { CapabilityRule } from './types.js';

/**
 * TA-CAP-003 — a filesystem scope reaching well beyond the application.
 *
 * Polarity here is the ordinary one: an explicitly written broad pattern is the
 * dangerous state, and an absent scope grants nothing. (TA-DEP-001 in this same
 * release is the inverse, which is exactly why each rule establishes its own
 * polarity rather than inheriting the previous one.)
 *
 * Deliberately no generalized "breadth score". Scope breadth is not orderable in
 * a way that survives contact with real configurations — `$APPDATA/**` is
 * broader in glob terms than `$HOME/.ssh/*` and far safer in practice. Instead a
 * short list of patterns that are unarguably too wide is enumerated, and
 * everything else is left alone. Growing that list is a deliberate act with its
 * own fixtures.
 *
 * Nothing here is schema-protected. A capability's `allow`/`deny` entries are
 * `Value`, which the schema defines as arbitrary JSON, because the shape belongs
 * to whichever plugin consumes it. Every level is read defensively.
 */

const REFERENCES = [
  'https://v2.tauri.app/security/capabilities/',
  'https://v2.tauri.app/plugin/file-system/#scopes',
];

/** Permission identifiers whose scope entries are filesystem paths. */
function isFilesystemPermission(identifier: string): boolean {
  return identifier.startsWith('fs:') || identifier.startsWith('asset:');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Pulls path strings out of a scope entry.
 *
 * The fs plugin accepts both a bare string and an object carrying `path`, and a
 * plugin is free to define something else entirely. Anything unrecognized yields
 * nothing rather than a guess.
 */
function scopePaths(entry: unknown): string[] {
  if (typeof entry === 'string') return [entry];
  if (isRecord(entry) && typeof entry['path'] === 'string') return [entry['path']];
  return [];
}

function readScopeList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(scopePaths);
}

interface Judgement {
  reach: string;
  detail: string;
}

/** Only patterns that are too wide under any reading are named here. */
function judge(pattern: string): Judgement | undefined {
  if (isFilesystemWide(pattern)) {
    return {
      reach: 'the entire filesystem',
      detail: `\`${pattern}\` is not anchored to any directory, so it matches every path the process can reach`,
    };
  }

  const variable = leadingVariable(pattern);
  if (variable === undefined) return undefined;

  const scope: PathScope | undefined = PATH_VARIABLES[variable];
  // An unrecognized variable is not assumed to be dangerous. The fs plugin would
  // reject it anyway, and guessing would flag configurations we cannot read.
  if (scope === undefined) return undefined;

  // Without `**` the pattern stays inside one directory level, which is a
  // deliberately shallow grant rather than an over-broad one.
  if (!isRecursive(pattern)) return undefined;

  switch (scope) {
    case 'user-home':
      return {
        reach: "the user's entire home directory",
        detail: `\`${pattern}\` recurses through everything the user owns — documents, keys, browser profiles, other applications' data`,
      };
    case 'cross-application':
      return {
        reach: "every application's data, not just this one's",
        detail:
          `\`${pattern}\` is anchored at \`$${variable}\`, which is the directory *containing* ` +
          `per-application folders. The application's own area is \`$APP${variable}\` — one ` +
          'identifier deeper. As written this reaches every other application stored there',
      };
    case 'user-data':
      return {
        reach: "a directory of the user's personal files",
        detail: `\`${pattern}\` recurses through \`$${variable}\`, which holds the user's own documents rather than application data`,
      };
    // 'app-owned' is the fs plugin working as intended, and 'other' covers
    // directories that are not a privacy boundary by themselves.
    case 'app-owned':
    case 'other':
      return undefined;
  }
}

/** Sensitive paths a deny list commonly carves out, worth crediting. */
const SENSITIVE_HINTS = ['.ssh', '.env', '.aws', '.gnupg', 'id_rsa', 'credential', 'secret', '.git'];

function describeDeny(denied: readonly string[]): string {
  if (denied.length === 0) {
    return 'No `deny` entries narrow it. Note that `deny` takes precedence over `allow`, so ' +
      'carving out the paths that matter is a supported way to keep a broad allow usable.';
  }

  const sensitive = denied.filter((pattern) =>
    SENSITIVE_HINTS.some((hint) => pattern.toLowerCase().includes(hint)),
  );

  const base = `A \`deny\` list is present (${denied.map((entry) => `\`${entry}\``).join(', ')}) and takes precedence over \`allow\`.`;

  return sensitive.length > 0
    ? `${base} It already excludes what look like sensitive paths, which reduces the exposure — check that it covers every such path under the allowed root, since anything not denied remains reachable.`
    : `${base} None of those entries look like the sensitive paths usually worth excluding, so the broad allow is largely unnarrowed.`;
}

export const TA_CAP_003: CapabilityRule = {
  id: 'TA-CAP-003',
  kind: 'capability',
  severity: 'medium',
  // Fires on Paperling, which declares fs:scope over `**`.
  evidence: 'real-world',
  target: 'capability filesystem scope reaching beyond the application',
  whyDangerous:
    'A filesystem permission scoped to the user home, to a personal data directory, or to the ' +
    "root holding every application's data grants far more than the application needs.",
  recommendation:
    'Anchor the scope at the application\'s own directory ($APPDATA, $APPCONFIG, ' +
    '$APPLOCALDATA, $RESOURCE) or at specific paths, and use `deny` for anything sensitive ' +
    'that must stay unreachable.',
  references: REFERENCES,
  check(context) {
    const findings: Finding[] = [];
    const permissions = context.capability.value['permissions'];
    if (!Array.isArray(permissions)) return [];

    permissions.forEach((permission, index) => {
      // A bare string permission carries no scope of its own.
      if (!isRecord(permission)) return;

      const identifier = permission['identifier'];
      if (typeof identifier !== 'string' || !isFilesystemPermission(identifier)) return;

      const allowed = readScopeList(permission['allow']);
      const denied = readScopeList(permission['deny']);

      for (const pattern of allowed) {
        const judgement = judge(pattern);
        if (judgement === undefined) continue;

        findings.push({
          ruleId: 'TA-CAP-003',
          severity: 'medium',
          confidence: 'heuristic',
          file: context.capability.file,
          line: context.capability.doc.lineOf(['permissions', index]),
          target: `${identifier} allows \`${pattern}\` — ${judgement.reach}`,
          whyDangerous:
            `This capability grants \`${identifier}\` over ${judgement.reach}. ${judgement.detail}.\n\n` +
            'Anything the frontend can be made to do with the filesystem, it can do across that ' +
            'whole area, so an injected script or a mishandled path reaches well past the ' +
            "application's own files.\n\n" +
            `${describeDeny(denied)}\n\n` +
            'This is reported as heuristic because a broad scope is sometimes the actual ' +
            'requirement — a file manager or an editor genuinely needs one. What cannot be ' +
            'determined from configuration alone is whether this application is that kind of ' +
            'application.',
          recommendation:
            'If the application only needs its own storage, anchor the scope there: ' +
            '`$APPDATA`, `$APPCONFIG`, `$APPLOCALDATA`, `$APPCACHE` and `$RESOURCE` all resolve ' +
            'to directories belonging to this application, and recursing through them is ' +
            'ordinary.\n\n' +
            'Watch the pair that differs by one prefix: `$CONFIG` and `$DATA` are the roots ' +
            "that *contain* every application's folder, while `$APPCONFIG` and `$APPDATA` are " +
            'this application\'s folder inside them. The first is almost never what is meant.\n\n' +
            'If the breadth is genuinely required — a file manager, an editor, a backup tool — ' +
            'add a `deny` list for the paths that must never be reachable (`$HOME/.ssh/**`, ' +
            '`$HOME/.aws/**`, `**/.env`). `deny` takes precedence over `allow`.\n\n' +
            'To confirm what is actually needed, narrow the scope and exercise the features ' +
            'that touch files: a call outside the scope fails visibly rather than silently.',
          references: REFERENCES,
        });
      }
    });

    return findings;
  },
};
