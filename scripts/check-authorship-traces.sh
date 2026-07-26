#!/usr/bin/env bash
#
# Checks that nothing in this repository describes how it was authored.
#
# WHY tests/corpus/ IS EXCLUDED
#
# The question this script answers is "did anything about how I built this leak
# into the repository". Files under tests/corpus/ are not written here — they are
# third-party configuration retrieved verbatim from upstream projects, so the
# words inside them say nothing about this project's authorship. Paperling's
# Cargo.toml, for instance, carries its own comments about the AI-related
# dependencies that application uses. Scanning them is a category error, and it
# is also unwinnable: which words a third party puts in their config is not
# something this project controls, so every future corpus addition would risk a
# spurious hit.
#
# What actually matters about the corpus is the opposite property — that it has
# not been edited — and that is checked separately and more strongly by
# `npm run verify:corpus`, which compares every vendored file against a recorded
# checksum. "Unmodified" is a stronger guarantee than "contains no particular
# word", and it is decidable.
#
# Usage: scripts/check-authorship-traces.sh
# Exit:  0 clean, 1 if anything matched.

set -uo pipefail

PATTERN='claude|anthropic|copilot|chatgpt|openai|gpt-4|gpt-5|\bllm\b|生成AI|人工知能|co-authored|ai-generated|ai-assisted|gemini|codex'

fail=0

report() { # label, output
  local count
  count=$(printf '%s' "$2" | grep -c . || true)
  printf '  %-22s %s\n' "$1" "$count"
  if [ "$count" -gt 0 ]; then
    printf '%s\n' "$2" | sed 's/^/      /'
    fail=1
  fi
}

echo "Authorship-trace scan (tests/corpus/ excluded by design — see header)"

# This script is excluded from its own scan: it is the one file that must contain
# every word being searched for, and matching its own pattern definition is a
# self-reference rather than a finding.
report "tracked files" \
  "$(git grep -inE "$PATTERN" -- . ':(exclude)tests/corpus' ':(exclude)scripts/check-authorship-traces.sh' 2>/dev/null || true)"
report "commit messages" "$(git log --format='%H %s%n%b' | grep -inE "$PATTERN" || true)"
report "file names" "$(git ls-files | grep -inE "$PATTERN" || true)"
report "authors" "$(git log --format='%an <%ae>%n%cn <%ce>' | sort -u | grep -inE "$PATTERN" || true)"

if [ "$fail" -eq 0 ]; then
  echo "clean"
else
  echo "FOUND — do not publish until resolved"
fi
exit "$fail"
