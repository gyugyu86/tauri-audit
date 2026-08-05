#!/usr/bin/env node
import { statSync } from 'node:fs';

import { Command } from 'commander';

import { computeExitCode, resolveFailMode } from './exitCode.js';
import { formatJson } from './formatters/json.js';
import { formatMarkdown } from './formatters/markdown.js';
import type { ReportMeta } from './formatters/reportModel.js';
import { formatSarif } from './formatters/sarif.js';
import { formatTerminal, formatWarnings } from './formatters/terminal.js';
import { messages } from './messages.js';
import { readToolVersion } from './toolVersion.js';

import { buildProjectContext } from '../core/projectContext.js';
import { runRules } from '../core/ruleEngine.js';
import { ALL_RULES } from '../core/rules/index.js';

interface CliOptions {
  json?: boolean;
  markdown?: boolean;
  sarif?: boolean;
  category?: string;
  strict?: boolean;
  fail?: boolean;
}

function fatal(message: string): never {
  console.error(`tauri-audit: ${message}`);
  process.exit(2);
}

function runAudit(targetPath: string, options: CliOptions): void {
  try {
    if (!statSync(targetPath).isDirectory()) fatal(messages.notADirectory(targetPath));
  } catch {
    fatal(messages.notADirectory(targetPath));
  }

  const project = buildProjectContext(targetPath);
  const result = runRules(project, ALL_RULES);

  // Analyzing nothing is the strongest case of all for "unanalyzable is not
  // clean": with no config found, zero findings is a statement about the target
  // being wrong, not about the project being safe.
  if (result.configsAnalyzed === 0 && result.configsUnplaced === 0) {
    result.incomplete.push(messages.noTauriProject(targetPath));
    result.warnings.push(messages.noTauriProject(targetPath));
  }

  const meta: ReportMeta = {
    rootDir: project.rootDir,
    configsAnalyzed: result.configsAnalyzed,
    configsUnplaced: result.configsUnplaced,
    capabilitiesAnalyzed: result.capabilitiesAnalyzed,
    filesUnparsable: result.filesUnparsable,
    warnings: result.warnings,
  };

  // Warnings and notices go to stderr so stdout stays a clean stream for
  // `--json` and `--sarif`, which are routinely piped or redirected to a file.
  if (result.warnings.length > 0) console.error(formatWarnings(result.warnings));

  if (options.sarif === true) {
    console.log(formatSarif(result.findings, meta, { category: options.category }));
  } else if (options.json === true) {
    console.log(formatJson(result.findings, meta));
  } else if (options.markdown === true) {
    console.log(formatMarkdown(result.findings, meta));
  } else {
    console.log(formatTerminal(result.findings, meta));
    if (ALL_RULES.length === 0) console.error(`\ntauri-audit: ${messages.noRulesYet}`);
  }

  if (result.incomplete.length > 0) console.error(`\ntauri-audit: ${messages.incompleteAnalysis}`);

  // process.exitCode, not process.exit: buffered stdout must flush completely
  // before the process ends, or a large SARIF document gets truncated.
  process.exitCode = computeExitCode(result.findings, resolveFailMode(options), result.incomplete);
}

const program = new Command();

program
  .name('tauri-audit')
  .description(messages.cliDescription)
  .version(readToolVersion(), '-V, --version', messages.optVersion)
  .argument('<target-path>', messages.argTargetPath)
  .option('--json', messages.optJson)
  .option('--markdown', messages.optMarkdown)
  .option('--sarif', messages.optSarif)
  .option('--category <id>', messages.optCategory)
  .option('--strict', messages.optStrict)
  .option('--no-fail', messages.optNoFail)
  .action(runAudit);

await program.parseAsync();
