import { describe, expect, it } from 'vitest';

import { computeExitCode, resolveFailMode } from '../../src/cli/exitCode.js';
import { gatingFindings, isGatingFinding, type FailMode } from '../../src/core/gate.js';
import type { Confidence, Finding, Severity } from '../../src/core/types.js';

const SEVERITIES: readonly Severity[] = ['critical', 'high', 'medium', 'low', 'info'];
const CONFIDENCES: readonly Confidence[] = ['high', 'heuristic'];
const MODES: readonly FailMode[] = ['default', 'strict', 'none'];

function finding(severity: Severity, confidence: Confidence): Finding {
  return {
    ruleId: 'TA-TEST-000',
    severity,
    confidence,
    file: '/p/tauri.conf.json',
    line: 1,
    target: 't',
    whyDangerous: 'w',
    recommendation: 'r',
  };
}

/**
 * The specification, written out rather than recomputed.
 *
 * Deriving the expectation from the same formula the implementation uses would
 * make this test agree with any bug. Every one of the 30 combinations is stated
 * explicitly instead.
 */
const EXPECTED_GATING: Readonly<Record<FailMode, Readonly<Record<string, boolean>>>> = {
  default: {
    'critical/high': true,
    'critical/heuristic': false,
    'high/high': true,
    'high/heuristic': false,
    'medium/high': false,
    'medium/heuristic': false,
    'low/high': false,
    'low/heuristic': false,
    'info/high': false,
    'info/heuristic': false,
  },
  strict: {
    'critical/high': true,
    'critical/heuristic': true,
    'high/high': true,
    'high/heuristic': true,
    'medium/high': false,
    'medium/heuristic': false,
    'low/high': false,
    'low/heuristic': false,
    'info/high': false,
    'info/heuristic': false,
  },
  none: {
    'critical/high': false,
    'critical/heuristic': false,
    'high/high': false,
    'high/heuristic': false,
    'medium/high': false,
    'medium/heuristic': false,
    'low/high': false,
    'low/heuristic': false,
    'info/high': false,
    'info/heuristic': false,
  },
};

describe('gating predicate — full severity x confidence x mode matrix', () => {
  for (const mode of MODES) {
    for (const severity of SEVERITIES) {
      for (const confidence of CONFIDENCES) {
        const key = `${severity}/${confidence}`;
        const expected = EXPECTED_GATING[mode][key];
        it(`${mode}: ${key} -> ${expected === true ? 'gates' : 'does not gate'}`, () => {
          expect(isGatingFinding(finding(severity, confidence), mode)).toBe(expected);
        });
      }
    }
  }
});

describe('computeExitCode', () => {
  it('returns 0 for no findings in every mode', () => {
    for (const mode of MODES) expect(computeExitCode([], mode)).toBe(0);
  });

  it('fails on a high-confidence critical by default', () => {
    expect(computeExitCode([finding('critical', 'high')], 'default')).toBe(1);
  });

  it('does not fail on a heuristic critical by default', () => {
    // The headline promise: uncertainty never breaks someone's build unasked.
    expect(computeExitCode([finding('critical', 'heuristic')], 'default')).toBe(0);
  });

  it('fails on a heuristic critical under --strict', () => {
    expect(computeExitCode([finding('critical', 'heuristic')], 'strict')).toBe(1);
  });

  it('never fails under --no-fail, even with the worst finding', () => {
    expect(computeExitCode([finding('critical', 'high')], 'none')).toBe(0);
  });

  it('ignores medium and below regardless of confidence or mode', () => {
    const lesser = [
      finding('medium', 'high'),
      finding('low', 'high'),
      finding('info', 'high'),
    ];
    for (const mode of MODES) expect(computeExitCode(lesser, mode)).toBe(0);
  });

  it('gates on the worst finding in a mixed set', () => {
    const mixed = [finding('info', 'high'), finding('high', 'high'), finding('low', 'heuristic')];
    expect(computeExitCode(mixed, 'default')).toBe(1);
  });

  it('returns only 0 or 1, never a truthy count', () => {
    const many = Array.from({ length: 5 }, () => finding('critical', 'high'));
    expect(computeExitCode(many, 'default')).toBe(1);
  });
});

describe('unanalyzable is not clean', () => {
  // The invariant: a project we could not fully read must never report success.
  // Zero findings on an unparsed config is silence, not safety.
  it('exits 2 when the analysis was incomplete, even with no findings', () => {
    expect(computeExitCode([], 'default', ['tauri.conf.json: not valid JSON'])).toBe(2);
  });

  it('exits 2 rather than 1 when incomplete AND gating findings exist', () => {
    // Incompleteness dominates: the user must fix visibility before trusting
    // any verdict about what was found.
    expect(computeExitCode([finding('critical', 'high')], 'default', ['broken'])).toBe(2);
  });

  it('is not suppressed by --no-fail', () => {
    // --no-fail is a statement about findings, not a claim the run succeeded.
    expect(computeExitCode([], 'none', ['broken'])).toBe(2);
    expect(computeExitCode([finding('critical', 'high')], 'none', ['broken'])).toBe(2);
  });

  it('is not suppressed by --strict either', () => {
    expect(computeExitCode([], 'strict', ['broken'])).toBe(2);
  });

  it('exits 0 when the analysis was complete and nothing gated', () => {
    expect(computeExitCode([], 'default', [])).toBe(0);
  });

  it('treats an empty incomplete list the same as omitting it', () => {
    expect(computeExitCode([finding('high', 'high')], 'default', [])).toBe(
      computeExitCode([finding('high', 'high')], 'default'),
    );
  });
});

describe('gatingFindings', () => {
  it('returns the findings that caused the failure, for reporting', () => {
    const findings = [
      finding('critical', 'high'),
      finding('critical', 'heuristic'),
      finding('medium', 'high'),
    ];
    expect(gatingFindings(findings, 'default')).toHaveLength(1);
    expect(gatingFindings(findings, 'strict')).toHaveLength(2);
    expect(gatingFindings(findings, 'none')).toHaveLength(0);
  });
});

describe('resolveFailMode', () => {
  it('maps commander flags', () => {
    expect(resolveFailMode({})).toBe('default');
    expect(resolveFailMode({ strict: true })).toBe('strict');
    expect(resolveFailMode({ fail: false })).toBe('none');
  });

  it('lets --no-fail win over --strict', () => {
    // Asking for no failures and stricter failures at once is contradictory;
    // honouring the opt-out is the safer reading.
    expect(resolveFailMode({ fail: false, strict: true })).toBe('none');
  });
});
