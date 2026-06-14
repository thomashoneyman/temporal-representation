import { describe, expect, it } from 'vitest';
import {
  equals,
  grainDelta,
  inAcceptableSet,
  intervalsEqual,
  iou,
  normalizeIntervals,
  offByOne,
  pointDeltaDays,
  setF1,
  type Interval,
  type Resolved,
} from '../src/scate-lite/interval.js';

const day = (d: string): Interval => ({
  start: `${d}T00:00:00-04:00`,
  end: nextDay(d),
});
function nextDay(d: string): string {
  const [y, m, dd] = d.split('-').map(Number);
  const n = new Date(Date.UTC(y, m - 1, dd + 1));
  return `${n.toISOString().slice(0, 10)}T00:00:00-04:00`;
}
const iv = (start: string, end: string): Interval => ({ start, end });

describe('normalizeIntervals', () => {
  it('merges genuine overlaps but never mere adjacency (weekends stay discrete)', () => {
    const sat = day('2026-03-07');
    const sun = day('2026-03-08'); // adjacent to sat
    expect(normalizeIntervals([sun, sat])).toHaveLength(2);
    const overlapping = [
      iv('2026-03-01T00:00:00-05:00', '2026-03-03T00:00:00-05:00'),
      iv('2026-03-02T00:00:00-05:00', '2026-03-04T00:00:00-05:00'),
    ];
    expect(normalizeIntervals(overlapping)).toEqual([
      iv('2026-03-01T00:00:00-05:00', '2026-03-04T00:00:00-05:00'),
    ]);
  });
});

describe('equality', () => {
  it('compares instants, not strings (offset notation differences are fine)', () => {
    expect(
      intervalsEqual(
        [iv('2026-03-04T00:00:00-05:00', '2026-03-05T00:00:00-05:00')],
        [iv('2026-03-04T05:00:00Z', '2026-03-05T05:00:00Z')],
      ),
    ).toBe(true);
  });
  it('is order-independent for sets', () => {
    expect(intervalsEqual([day('2026-06-12'), day('2026-06-08')], [day('2026-06-08'), day('2026-06-12')])).toBe(true);
  });
});

describe('iou — hand-worked examples', () => {
  it('G5-01: exclusive misread of "March 1 through 4" → IoU 0.75', () => {
    const key = iv('2026-03-01T00:00:00-05:00', '2026-03-05T00:00:00-05:00');
    const model = iv('2026-03-01T00:00:00-05:00', '2026-03-04T00:00:00-05:00');
    expect(iou([model], [key])).toBeCloseTo(0.75, 10);
  });
  it('N3-02: Sun-start "last week" vs Mon-start key → IoU 0.75', () => {
    const key = iv('2026-03-02T00:00:00-05:00', '2026-03-09T00:00:00-05:00');
    const model = iv('2026-03-01T00:00:00-05:00', '2026-03-08T00:00:00-05:00');
    expect(iou([model], [key])).toBeCloseTo(0.75, 10);
  });
  it('both empty (correct none) → 1', () => {
    expect(iou([], [])).toBe(1);
  });
});

describe('setF1 — the M6-03 hand-worked example', () => {
  it('collapsed bounding range over {Mon, Fri} points → P=0.4, R=1.0, F1≈0.57', () => {
    const key = [day('2026-06-08'), day('2026-06-12')];
    const model = [iv('2026-06-08T00:00:00-04:00', '2026-06-13T00:00:00-04:00')];
    const s = setF1(model, key);
    expect(s.precision).toBeCloseTo(0.4, 10);
    expect(s.recall).toBeCloseTo(1.0, 10);
    expect(s.f1).toBeCloseTo(0.571, 2);
    expect(s.countDelta).toBe(-1); // 1 piece instead of 2
  });
});

describe('point deltas / off-by-one', () => {
  it('R2-06 acceptable variant: Feb 10 vs key Feb 12 → Δ −2 days', () => {
    expect(pointDeltaDays(day('2026-02-10'), day('2026-02-12'))).toBe(-2);
  });
  it('off-by-one at day grain (the Sev-1 fencepost)', () => {
    expect(offByOne(day('2026-03-05'), day('2026-03-04'), 'day')).toBe(true);
    expect(offByOne(day('2026-03-06'), day('2026-03-04'), 'day')).toBe(false);
  });
  it('grainDelta works across DST (Mar 8 2026 spring-forward)', () => {
    // Mar 7 → Mar 9 spans the 23-hour Mar 8: still exactly 2 calendar days
    expect(Math.round(grainDelta(day('2026-03-09'), day('2026-03-07'), 'day'))).toBe(2);
  });
});

describe('inAcceptableSet', () => {
  it('matches any acceptable resolution (ambiguous slice)', () => {
    const feb10: Resolved = { cardinality: 'point', intervals: [day('2026-02-10')] };
    const feb12: Resolved = { cardinality: 'point', intervals: [day('2026-02-12')] };
    expect(inAcceptableSet(feb10, [feb12, feb10])).toBe(true);
    expect(equals(feb10, feb12)).toBe(false);
  });
});
