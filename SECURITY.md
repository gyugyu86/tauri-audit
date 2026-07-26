# Security policy

## Reporting a vulnerability in tauri-audit

Please report privately through
[GitHub's private vulnerability reporting](https://github.com/gyugyu86/tauri-audit/security/advisories/new)
rather than opening a public issue.

Include what you did, what happened, and what you expected. A configuration that triggers
the problem is the most useful thing you can attach — this tool only ever reads files, so a
reproduction is usually a directory of small text files.

I will acknowledge within a week. This is a personal project, so I cannot promise a fixed
turnaround beyond that, but I will keep you informed rather than go quiet.

## What counts

The realistic risks in a tool like this one are not memory corruption. They are:

- **Arbitrary code execution while scanning.** tauri-audit is designed never to execute the
  project it analyzes, reach the network, or start a subprocess. Anything that breaks that —
  a config or lockfile that causes code to run — is the most serious class of bug here.
- **Path escape.** Reading or writing outside the directory it was pointed at, for example
  through a crafted symlink or path in a scanned file.
- **A crash on hostile input**, since this runs in CI where a crash blocks a pipeline.
- **A wrong verdict that hides a real problem** — a config that makes the tool report
  success while an issue goes unreported. Given what this tool is for, a silent false
  negative is a security bug, not a quality one.

## What does not

- **Findings you disagree with.** A false positive or a missed detection is a normal bug —
  please open a regular issue. It helps enormously to include the configuration.
- **Vulnerabilities in the applications in `tests/corpus/`.** Those are third-party
  configuration files vendored as test data. Report those to the projects themselves.
- **Vulnerabilities in Tauri.** Report those to
  [the Tauri project](https://github.com/tauri-apps/tauri/security).

## Supported versions

Pre-release. Only the latest published version is supported; there are no maintained
release branches yet.
