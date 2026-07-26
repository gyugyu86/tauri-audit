import type { Rule } from './types.js';

/**
 * Every active rule, in one hand-maintained list.
 *
 * Registration is explicit rather than filesystem-driven so that the active rule
 * set is readable in one place, and so the CLI and every corpus test are provably
 * running the same rules. A rule added here is automatically covered by the
 * clean-corpus false-positive test.
 *
 * Rules land in S4 onwards: the deterministic high-confidence rules first, to
 * establish the zero-false-positive pipeline, then CVE-derived and
 * context-dependent rules as `heuristic`.
 */
export const ALL_RULES: readonly Rule[] = [];
