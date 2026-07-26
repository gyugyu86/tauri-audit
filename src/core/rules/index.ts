import { TA_CAP_003 } from './TA-CAP-003.js';
import { TA_CONF_001_V1, TA_CONF_001_V2 } from './TA-CONF-001.js';
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
 * TA-CONF-001 and TA-CONF-002 each appear twice because their fields exist in
 * both config generations at different paths while `appliesTo` names a single
 * generation. Each pair shares one rule ID and one implementation, and the
 * engine's `appliesTo` filter guarantees at most one of them sees any given
 * document.
 *
 * The list mixes both polarities on purpose: TA-CONF-001 fires when a value is
 * absent, everything else fires when one is present. Each rule establishes that
 * from its own primary source — see docs/CONVENTIONS.md.
 */
export const ALL_RULES: readonly Rule[] = [
  TA_CONF_001_V2,
  TA_CONF_001_V1,
  TA_CONF_002_V2,
  TA_CONF_002_V1,
  TA_V1_001,
  TA_V1_002,
  TA_V1_003,
  TA_CAP_003,
  TA_DEP_001,
  TA_VITE_001,
];
