#!/usr/bin/env node
/**
 * Records and verifies that vendored corpus files are unmodified.
 *
 * The corpus is only evidence if it is genuinely what upstream ships. Its value
 * comes from having been written by people who had never heard of this tool, and
 * a single well-meaning edit — reformatting, "fixing" a config to make a test
 * pass — would quietly turn it into something we authored.
 *
 * Two layers guard that, deliberately separated by whether they need the network:
 *
 *   - `CHECKSUMS.txt` per application, verified by the offline test suite. This
 *     catches local modification, which is the realistic risk, and it runs on
 *     every `npm test` without violating the rule that analysis and tests never
 *     touch the network.
 *   - `--upstream`, which re-fetches each file at the commit recorded in
 *     PROVENANCE.md and compares. Stronger, but it needs the network and a
 *     GitHub token, so it is run on demand rather than in CI.
 *
 * Usage:
 *   node scripts/corpus-checksums.mjs --write      regenerate CHECKSUMS.txt
 *   node scripts/corpus-checksums.mjs              verify against them (offline)
 *   node scripts/corpus-checksums.mjs --upstream   re-fetch and compare
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CORPUS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'tests', 'corpus');
const GROUPS = ['clean', 'true-positive'];

/** Files that describe the vendoring rather than being vendored. */
const NOT_VENDORED = new Set(['CHECKSUMS.txt', 'PROVENANCE.md', 'LICENSE', 'README.md']);

function walk(dir, base = dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full, base));
    else if (!NOT_VENDORED.has(entry.name)) out.push(path.relative(base, full));
  }
  return out.sort();
}

function sha256(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

export function corpusApps() {
  return GROUPS.flatMap((group) =>
    readdirSync(path.join(CORPUS, group), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => ({ group, name: entry.name, dir: path.join(CORPUS, group, entry.name) })),
  );
}

export function verifyApp(app) {
  const manifestPath = path.join(app.dir, 'CHECKSUMS.txt');
  let manifest;
  try {
    manifest = readFileSync(manifestPath, 'utf8');
  } catch {
    return [`${app.group}/${app.name}: no CHECKSUMS.txt`];
  }

  const recorded = new Map(
    manifest
      .split('\n')
      .filter((line) => line.trim() !== '' && !line.startsWith('#'))
      .map((line) => {
        const [hash, ...rest] = line.split('  ');
        return [rest.join('  '), hash];
      }),
  );

  const problems = [];
  const present = new Set(walk(app.dir));

  for (const [file, hash] of recorded) {
    if (!present.has(file)) {
      problems.push(`${app.group}/${app.name}/${file}: recorded but missing`);
      continue;
    }
    if (sha256(path.join(app.dir, file)) !== hash) {
      problems.push(`${app.group}/${app.name}/${file}: MODIFIED since vendoring`);
    }
  }
  for (const file of present) {
    if (!recorded.has(file)) {
      problems.push(`${app.group}/${app.name}/${file}: present but not recorded`);
    }
  }
  return problems;
}

function write() {
  for (const app of corpusApps()) {
    const files = walk(app.dir);
    const lines = [
      '# sha256 of every vendored file, so local modification is detectable offline.',
      '# Regenerate with: node scripts/corpus-checksums.mjs --write',
      ...files.map((file) => `${sha256(path.join(app.dir, file))}  ${file}`),
    ];
    writeFileSync(path.join(app.dir, 'CHECKSUMS.txt'), `${lines.join('\n')}\n`);
    console.log(`  wrote ${app.group}/${app.name}/CHECKSUMS.txt (${String(files.length)} files)`);
  }
}

function provenanceCommit(app) {
  const text = readFileSync(path.join(app.dir, 'PROVENANCE.md'), 'utf8');
  const repo = /https:\/\/github\.com\/([^/\s)]+\/[^/\s)]+)/.exec(text)?.[1];
  const commit = /\| Commit \| `([0-9a-f]{7,40})`/.exec(text)?.[1];
  return { repo, commit };
}

function upstream() {
  let failures = 0;
  for (const app of corpusApps()) {
    const { repo, commit } = provenanceCommit(app);
    if (repo === undefined || commit === undefined) {
      console.log(`  ${app.group}/${app.name}: PROVENANCE has no repo/commit — skipped`);
      continue;
    }
    for (const file of walk(app.dir)) {
      // The vendored path mirrors upstream, so it is also the upstream path.
      let remote;
      try {
        remote = execFileSync(
          'gh',
          ['api', `repos/${repo}/contents/${file}?ref=${commit}`, '--jq', '.content'],
          { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
        );
      } catch {
        console.log(`  ${app.name}/${file}: could not fetch (path may differ upstream)`);
        continue;
      }
      const same =
        Buffer.from(remote.replace(/\n/g, ''), 'base64').toString('utf8') ===
        readFileSync(path.join(app.dir, file), 'utf8');
      if (!same) {
        console.log(`  ${app.name}/${file}: DIFFERS from upstream@${commit.slice(0, 8)}`);
        failures += 1;
      }
    }
    console.log(`  ${app.group}/${app.name}: checked against ${repo}@${commit.slice(0, 8)}`);
  }
  process.exitCode = failures > 0 ? 1 : 0;
}

const mode = process.argv[2];
if (mode === '--write') write();
else if (mode === '--upstream') upstream();
else {
  const problems = corpusApps().flatMap(verifyApp);
  if (problems.length > 0) {
    console.error('corpus integrity FAILED:');
    for (const problem of problems) console.error(`  ${problem}`);
    process.exitCode = 1;
  } else {
    console.log('corpus integrity: every vendored file matches its recorded checksum');
  }
}
