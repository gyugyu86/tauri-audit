import { TA_CONF_002_V1, TA_CONF_002_V2 } from './TA-CONF-002.js';
import { TA_DEP_001 } from './TA-DEP-001.js';
import { TA_V1_001 } from './TA-V1-001.js';
import { TA_V1_002 } from './TA-V1-002.js';
import { TA_V1_003 } from './TA-V1-003.js';
import { TA_VITE_001 } from './TA-VITE-001.js';

import type { Rule } from './types.js';

/**
 * Every active rule, in one hand-maintained list.
 *
 * Registration is explicit rather than filesystem-driven so that the active rule
 * set is readable in one place, and so the CLI and every corpus test are provably
 * running the same rules. A rule added here is automatically covered by the
 * clean-corpus false-positive test.
 *
 * TA-CONF-002 appears twice because its field exists in both config generations
 * at different paths while `appliesTo` names a single generation. Both entries
 * share one rule ID and one implementation, and the engine's `appliesTo` filter
 * guarantees at most one of them sees any given document.
 */
export const ALL_RULES: readonly Rule[] = [
  TA_CONF_002_V2,
  TA_CONF_002_V1,
  TA_V1_001,
  TA_V1_002,
  TA_V1_003,
  TA_DEP_001,
  TA_VITE_001,
];
