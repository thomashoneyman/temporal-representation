/**
 * Scoring-rubric tests, pinned to hand-worked examples plus the
 * gate-2 point rule (start-instant equality; grain as a separate flag) and the
 * Task 6/7/7b metrics on synthetic right/wrong outputs.
 */
import { describe, expect, it } from 'vitest';
import { ALL_CASES, anchorIso } from '../src/datasets/cases/index.js';
import type { CaseItem } from '../src/datasets/cases/lib/types.js';
import { DEFAULT_CONVENTIONS } from '../src/scate-lite/conventions.js';
import type { IsoValue } from '../src/scate-lite/iso.js';
import { scoreDecomposition } from '../src/scoring/decomposition.js';
import { classifyProbe } from '../src/scoring/interpretation.js';
import { driftCurve, scoreHop } from '../src/scoring/threading.js';
import { clarificationPRF, noTimePRF, resolveActual, scoreTranslation, type Envelope } from '../src/scoring/translation.js';

const item = (id: string): CaseItem => ALL_CASES.find((c) => c.id === id)!;
const ctxOf = (c: CaseItem) => ({
  anchor: anchorIso(c.anchor),
  conventions: { ...DEFAULT_CONVENTIONS, ...c.conventionsOverride },
  ...(c.customPresets ? { customPresets: c.customPresets } : {}),
  window: { backMonths: 12, forwardMonths: 12 },
});
const isoTime = (value: IsoValue, ambiguity = 2): Envelope => ({ kind: 'time', value, ambiguity, reasoning: 'test' });
const iv = (start: string, end: string) => ({ start, end });

describe('§12 worked scoring examples', () => {
  it('G5-01: exclusive misread → Sev 1 fencepost, IoU 0.75, not exact', () => {
    const s = scoreTranslation(
      isoTime({ cardinality: 'range', start: '2026-03-01T00:00:00-05:00', end: '2026-03-04T00:00:00-05:00', bounds: '[)' }),
      item('G5-01'), ctxOf(item('G5-01')), 'iso',
    );
    expect(s.exact).toBe(false);
    expect(s.severity).toBe(1);
    expect(s.iou).toBeCloseTo(0.75, 10);
    expect(s.tags).toContain('fencepost');
  });

  it('N3-02: Sun-start week → Sev 3 wrong-period, IoU 0.75', () => {
    const s = scoreTranslation(
      isoTime({ cardinality: 'range', start: '2026-03-01T00:00:00-05:00', end: '2026-03-08T00:00:00-05:00', bounds: '[)' }),
      item('N3-02'), ctxOf(item('N3-02')), 'iso',
    );
    expect(s.severity).toBe(3);
    // §12 says 0.75 counting days; measured in real hours across the Mar 8 DST change
    // it's 144h/191h ≈ 0.754 — the time-measured number is the more correct one.
    expect(s.iou).toBeCloseTo(0.75, 2);
    expect(s.tags).toContain('wrong-period');
  });

  it('M6-03: collapsed bounding range → F1≈0.57, tagged', () => {
    const s = scoreTranslation(
      isoTime({ cardinality: 'range', start: '2026-06-08T00:00:00-04:00', end: '2026-06-13T00:00:00-04:00', bounds: '[)' }),
      item('M6-03'), ctxOf(item('M6-03')), 'iso',
    );
    expect(s.set!.f1).toBeCloseTo(0.571, 2);
    expect(s.tags).toContain('collapsed-to-bounding-range');
  });

  it('R2-06: the 30-day reading → within acceptable (Sev 4), Δ = −2 days', () => {
    const s = scoreTranslation(
      isoTime({ cardinality: 'point', at: '2026-02-10' }),
      item('R2-06'), ctxOf(item('R2-06')), 'iso',
    );
    expect(s.exact).toBe(false);
    expect(s.withinAcceptable).toBe(true);
    expect(s.severity).toBe(4);
    expect(s.deltaDays).toBe(-2);
  });

  it('T7-01: hallucinated time on a no-time query → Sev 6, tagged', () => {
    const s = scoreTranslation(
      isoTime({ cardinality: 'range', start: '2026-06-02T00:00:00-04:00', end: '2026-06-09T00:00:00-04:00', bounds: '[)' }),
      item('T7-01'), ctxOf(item('T7-01')), 'iso',
    );
    expect(s.severity).toBe(6);
    expect(s.tags).toContain('hallucinated-time');
  });

  it('B8-04: "next Friday" → Jun 12, ambiguity 2, no clarify → correct, no over-flag', () => {
    const s = scoreTranslation(isoTime({ cardinality: 'point', at: '2026-06-12' }, 2), item('B8-04'), ctxOf(item('B8-04')), 'iso');
    expect(s.withinAcceptable).toBe(true);
    expect(s.clarifySignal).toBe(false);
    expect(s.tags).not.toContain('clarified-when-safe');
  });
});

describe('the gate-2 point rule', () => {
  it('exact start at minute precision is exact even when the grain is ambiguous', () => {
    // "in 90 minutes" key is the minute [16:00, 16:01); a model answering 16:00:00
    // (indistinguishable from an hour answer) is EXACT, grainMatch reported separately.
    const s = scoreTranslation(isoTime({ cardinality: 'point', at: '2026-03-12T16:00:00-04:00' }), item('R2-15'), ctxOf(item('R2-15')), 'iso');
    expect(s.exact).toBe(true);
    expect(s.severity).toBe(0);
    expect(s.grainMatch).toBe(true); // datetime answers resolve at minute grain, matching the minute key
  });

  it('minute instant inside the right day → Sev 3 grain-too-fine, timeCorrect (the H1 fix)', () => {
    // "three days ago" answered as the minute [Jun 6 11:00, 11:01): arithmetic right,
    // grain finer than the day-grain key. Was falling through to Sev 6 "wrong-month".
    const s = scoreTranslation(isoTime({ cardinality: 'point', at: '2026-06-06T11:00:00-04:00' }), item('R2-01'), ctxOf(item('R2-01')), 'iso');
    expect(s.exact).toBe(false);
    expect(s.severity).toBe(3);
    expect(s.tags).toContain('grain-too-fine');
    expect(s.timeCorrect).toBe(true);
  });

  it('whole day for an hour point → Sev 3 grain-too-coarse, not exact', () => {
    const s = scoreTranslation(isoTime({ cardinality: 'point', at: '2026-06-09' }), item('S1-04'), ctxOf(item('S1-04')), 'iso');
    expect(s.exact).toBe(false);
    expect(s.severity).toBe(3);
    expect(s.tags).toContain('grain-too-coarse');
  });

  it('wrong direction ("3 days ago" answered 3 days ahead) → Sev 5', () => {
    const s = scoreTranslation(isoTime({ cardinality: 'point', at: '2026-06-12' }), item('R2-01'), ctxOf(item('R2-01')), 'iso');
    expect(s.severity).toBe(5);
    expect(s.tags).toContain('wrong-direction');
  });

  it('IR arm: emitting the shift node scores exact (code does the math — H1)', () => {
    const s = scoreTranslation(
      { kind: 'time', value: { type: 'shift', base: { type: 'preset', name: 'today' }, by: 'P3D', direction: 'before' }, ambiguity: 1, reasoning: 't' },
      item('R2-01'), ctxOf(item('R2-01')), 'ir',
    );
    expect(s.exact).toBe(true);
  });

  it('IR arm: malformed IR → unresolvable, Sev 6', () => {
    const s = scoreTranslation(
      { kind: 'time', value: { type: 'ref', id: 'does-not-exist' }, ambiguity: 1, reasoning: 't' },
      item('R2-01'), ctxOf(item('R2-01')), 'ir',
    );
    expect(s.unresolvable).toBe(true);
    expect(s.severity).toBe(6);
  });
});

describe('coverage-equality for sets (translation)', () => {
  it('M6-07: six single days covering the key\'s two ranges exactly → exact', () => {
    const c = item('M6-07');
    const ends = { '2025-11-24': '2025-11-25', '2025-11-25': '2025-11-26', '2025-11-26': '2025-11-27', '2025-11-28': '2025-11-29', '2025-11-29': '2025-11-30', '2025-11-30': '2025-12-01' };
    const days = Object.entries(ends).map(([s2, e]) => ({ start: `${s2}T00:00:00-05:00`, end: `${e}T00:00:00-05:00` }));
    const s = scoreTranslation(isoTime({ cardinality: 'set', members: days }), c, ctxOf(c), 'iso');
    expect(s.exact).toBe(true);
  });
  it('M6-03: collapsed bounding range covers EXTRA time → still not exact', () => {
    const s = scoreTranslation(
      isoTime({ cardinality: 'range', start: '2026-06-08T00:00:00-04:00', end: '2026-06-13T00:00:00-04:00', bounds: '[)' }),
      item('M6-03'), ctxOf(item('M6-03')), 'iso',
    );
    expect(s.exact).toBe(false);
  });
});

describe('Task 6 aggregates', () => {
  it('clarification P/R counts shouldClarify hits and over-flagging', () => {
    const rows = [
      { item: item('B8-01'), signaled: true },   // TP
      { item: item('B8-02'), signaled: false },  // FN
      { item: item('B8-14'), signaled: true },   // FP (over-clarify control)
      { item: item('B8-04'), signaled: false },  // TN
      { item: item('B8-06'), signaled: false },  // clarifyOptional → excluded
    ];
    const { precision, recall } = clarificationPRF(rows);
    expect(precision).toBeCloseTo(0.5, 10);
    expect(recall).toBeCloseTo(0.5, 10);
  });

  it('no-time P/R: abstaining on temporal items is the precision failure', () => {
    const rows = [
      { item: item('T7-01'), answeredNone: true },  // TP
      { item: item('T7-02'), answeredNone: false }, // FN
      { item: item('R2-01'), answeredNone: true },  // FP (temporal answered none)
      { item: item('N3-01'), answeredNone: false }, // TN
    ];
    const { precision, recall } = noTimePRF(rows);
    expect(precision).toBeCloseTo(0.5, 10);
    expect(recall).toBeCloseTo(0.5, 10);
  });
});

describe('Task 7/7b primitives', () => {
  const day = (d: string) => iv(`${d}T00:00:00-04:00`, nextDay(d));
  function nextDay(d: string): string {
    const [y, m, dd] = d.split('-').map(Number);
    return `${new Date(Date.UTC(y, m - 1, dd + 1)).toISOString().slice(0, 10)}T00:00:00-04:00`;
  }

  it('scoreHop separates arithmetic vs anchor-binding vs wrong-operation', () => {
    const key = {
      expected: [day('2026-06-17')],
      distractors: { milestone_1: [day('2026-06-12')] },
    };
    expect(scoreHop([day('2026-06-17')], key).correct).toBe(true);
    expect(scoreHop([day('2026-06-18')], key).errorClass).toBe('arithmetic');
    expect(scoreHop([day('2026-06-12')], key)).toMatchObject({ errorClass: 'anchor-binding', boundTo: 'milestone_1' });
    expect(scoreHop([day('2026-09-17')], key).errorClass).toBe('wrong-operation');
  });

  it('driftCurve groups accuracy by chain depth', () => {
    const curve = driftCurve([
      { depth: 1, correct: true }, { depth: 1, correct: true },
      { depth: 2, correct: true }, { depth: 2, correct: false },
      { depth: 3, correct: false },
    ]);
    expect(curve).toEqual([
      { depth: 1, accuracy: 1, n: 2 },
      { depth: 2, accuracy: 0.5, n: 2 },
      { depth: 3, accuracy: 0, n: 1 },
    ]);
  });

  it('scoreDecomposition: M6-04 collapsed to one bounding call', () => {
    const expected = [
      iv('2026-03-01T00:00:00-05:00', '2026-04-01T00:00:00-04:00'),
      iv('2026-05-01T00:00:00-04:00', '2026-06-01T00:00:00-04:00'),
    ];
    const s = scoreDecomposition([iv('2026-03-01T00:00:00-05:00', '2026-06-01T00:00:00-04:00')], expected);
    expect(s.exact).toBe(false);
    expect(s.failures).toContain('collapsed-to-bounding-range');
    expect(s.recall).toBe(1);
    expect(s.precision).toBeLessThan(0.7);
  });

  it('scoreDecomposition: exact set of calls', () => {
    const expected = [day('2026-06-08'), day('2026-06-12')];
    const s = scoreDecomposition([day('2026-06-12'), day('2026-06-08')], expected);
    expect(s.exact).toBe(true);
    expect(s.failures).toEqual([]);
  });
});

describe('Phase-1 probe classification', () => {
  it('classifies R2-06 readings as pinned / calendar30 / other', () => {
    const c = item('R2-06');
    const ctx = ctxOf(c);
    const pinned = resolveActual('iso', { cardinality: 'point', at: '2026-02-12' }, ctx);
    const cal30 = resolveActual('iso', { cardinality: 'point', at: '2026-02-10' }, ctx);
    const other = resolveActual('iso', { cardinality: 'point', at: '2026-02-11' }, ctx);
    expect(classifyProbe(pinned, c)).toBe('pinned');
    expect(classifyProbe(cal30, c)).toBe('calendar30');
    expect(classifyProbe(other, c)).toBe('other');
  });

  it('containment: a minute-instant inside a day candidate counts as that reading', () => {
    const c = item('R2-06');
    const instant = resolveActual('iso', { cardinality: 'point', at: '2026-02-12T14:30:00-05:00' }, ctxOf(c));
    expect(classifyProbe(instant, c)).toBe('pinned');
  });
});
