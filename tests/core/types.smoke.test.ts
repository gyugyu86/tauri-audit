import { describe, expect, it } from 'vitest';

import type { Confidence, Finding, Severity, TauriConfigVersion } from '../../src/core/types.js';

/**
 * Shape contract for the core model. This test does almost nothing at runtime —
 * its job is to make `npm test` fail loudly if the Finding signature drifts,
 * since every rule and every reporter is built against it.
 */
describe('core model', () => {
  it('constructs a Finding with severity and confidence as independent axes', () => {
    const severity: Severity = 'critical';
    const confidence: Confidence = 'heuristic';

    const finding: Finding = {
      ruleId: 'TA-TEST-000',
      severity,
      confidence,
      file: '/tmp/tauri.conf.json',
      line: 1,
      target: 'example',
      whyDangerous: 'example',
      recommendation: 'example',
      references: ['https://example.invalid/'],
    };

    // A critical finding may legitimately be heuristic: severity answers "how bad
    // if real", confidence answers "how sure are we". They never collapse.
    expect(finding.severity).toBe('critical');
    expect(finding.confidence).toBe('heuristic');
  });

  it('treats an unplaceable config document as an explicit unknown', () => {
    const version: TauriConfigVersion = 'unknown';
    expect(version).toBe('unknown');
  });
});
