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
- **A silent failure inside what the tool claims to cover.** If a rule that should have
  fired did not, and the reason is a defect rather than a documented limit, that is a
  security bug here rather than a quality one — the whole value of the tool is that its
  silence means something. Concretely: a rule with inverted polarity, an exemption check
  that wrongly suppresses a finding, a config that fails to parse while the run still
  reports success, or any path where analysis does not happen and the exit code does not
  say so.

## What does not

**Anything outside what the tool claims to analyze.** This matters more here than it
usually would, because tauri-audit accepts false negatives by design — it would rather miss
a finding than invent one. It ships eight configuration rules, has no dataflow analysis at
all, and does not read Rust or JavaScript source yet. So "it did not detect X" is only a
security report when X is inside the documented scope; otherwise it is a feature request,
and a welcome one. [Honest limitations](README.md#honest-limitations) and the
[roadmap](README.md#roadmap) are the boundary, and they are kept current deliberately so
this distinction stays checkable rather than being a matter of opinion.

An unbounded promise is one nobody can keep, and a promise broken later costs more trust
than a narrow one made honestly at the start.

Also not security reports:

- **Findings you disagree with.** A false positive is a normal bug — please open a regular
  issue. It helps enormously to include the configuration.
- **Vulnerabilities in the applications in `tests/corpus/`.** Those are third-party
  configuration files vendored as test data. Report those to the projects themselves.
- **Vulnerabilities in Tauri.** Report those to
  [the Tauri project](https://github.com/tauri-apps/tauri/security).

## Supported versions

Pre-release. Only the latest published version is supported; there are no maintained
release branches yet.
