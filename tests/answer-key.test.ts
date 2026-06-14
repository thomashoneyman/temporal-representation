/**
 * The answer-key acceptance suite (the heart of the step-2 review gate): for every
 * gradeable item in the 116-item dataset, resolving its hand-authored canonical IR
 * against its anchor must reproduce the expected intervals EXACTLY — plus structural
 * checks (slice counts, set sizes, half-open sanity).
 */
import { DateTime } from 'luxon';
import { describe, expect, it } from 'vitest';
import { ALL_CASES, SLICES, anchorIso } from '../src/datasets/cases/index.js';
import type { CaseItem } from '../src/datasets/cases/lib/types.js';
import { DEFAULT_CONVENTIONS } from '../src/scate-lite/conventions.js';
import { ZONE, ms } from '../src/scate-lite/interval.js';
import { resolveIR, type ResolveCtx } from '../src/scate-lite/resolver.js';

const ctxFor = (item: CaseItem): ResolveCtx => ({
  anchor: anchorIso(item.anchor),
  conventions: { ...DEFAULT_CONVENTIONS, ...item.conventionsOverride },
  ...(item.customPresets ? { customPresets: item.customPresets } : {}),
  window: { backMonths: 12, forwardMonths: 12 },
});

const wall = (s: string): number => {
  const dt = DateTime.fromISO(s, { zone: ZONE });
  if (!dt.isValid) throw new Error(`bad fixture instant: ${s}`);
  return dt.toMillis();
};

const gradeable = ALL_CASES.filter((c) => c.canonicalIR !== null && c.expected !== null);

describe('answer key: resolver reproduces every gradeable item', () => {
  it.each(gradeable.map((c) => [c.id, c] as const))('%s', (_id, item) => {
    const resolved = resolveIR(item.canonicalIR!, ctxFor(item));
    const actual = resolved.intervals.map((iv) => [ms(iv.start), ms(iv.end)]);
    const expected = item.expected!.map(([s, e]) => [wall(s), wall(e)]);
    expect(actual).toEqual(expected);
    expect(resolved.cardinality).toBe(item.cardinality);
    expect(resolved.open ?? false).toBe(item.open ?? false);
  });
});

describe('dataset structure (expected slice counts)', () => {
  it('has 116 items with the authored per-slice sizes', () => {
    expect(SLICES.specific).toHaveLength(15);
    expect(SLICES.relative).toHaveLength(34);
    expect(SLICES.named).toHaveLength(23);
    expect(SLICES.custom).toHaveLength(12);
    expect(SLICES.ranges).toHaveLength(19);
    expect(SLICES.multipart).toHaveLength(14);
    expect(SLICES.notime).toHaveLength(8);
    expect(SLICES.ambiguous).toHaveLength(14);
    expect(ALL_CASES).toHaveLength(139);
  });

  it('has unique ids', () => {
    expect(new Set(ALL_CASES.map((c) => c.id)).size).toBe(139);
  });

  it('sanity-checks the §13 set counts: G5-04=9, M6-01=12, M6-06=22, M6-08=21, M6-12=10', () => {
    const sizes = Object.fromEntries(
      ['G5-04', 'M6-01', 'M6-06', 'M6-08', 'M6-12'].map((id) => [id, ALL_CASES.find((c) => c.id === id)!.expected!.length]),
    );
    expect(sizes).toEqual({ 'G5-04': 9, 'M6-01': 12, 'M6-06': 22, 'M6-08': 21, 'M6-12': 10 });
  });

  it('every expected interval is half-open and non-empty (start < end)', () => {
    for (const c of gradeable) {
      for (const [s, e] of c.expected!) {
        expect(wall(s), `${c.id} [${s}, ${e})`).toBeLessThan(wall(e));
      }
    }
  });

  it('no-time items carry no key; ambiguous items carry an acceptable set or region', () => {
    for (const c of SLICES.notime) expect(c.isNoTime).toBe(true);
    for (const c of SLICES.ambiguous) expect(Boolean(c.acceptable || c.region)).toBe(true);
  });

  it('clarify expectations: amb ≥ 4 ⟺ shouldClarify, except annotated optionals', () => {
    for (const c of ALL_CASES.filter((c) => !c.clarifyOptional && c.slice !== 'notime')) {
      expect(c.shouldClarify, c.id).toBe(c.expectedAmbiguity >= 4);
    }
  });
});

describe('DST boundaries inside the key', () => {
  it('N3-02 "last week" crosses spring-forward: EST start, EDT end', () => {
    const item = ALL_CASES.find((c) => c.id === 'N3-02')!;
    const r = resolveIR(item.canonicalIR!, ctxFor(item));
    expect(r.intervals[0].start).toBe('2026-03-02T00:00:00-05:00');
    expect(r.intervals[0].end).toBe('2026-03-09T00:00:00-04:00');
  });

  it('G5-04: the Mar 8 weekend day is 23 hours long, never assumed 24h', () => {
    const item = ALL_CASES.find((c) => c.id === 'G5-04')!;
    const r = resolveIR(item.canonicalIR!, ctxFor(item));
    const mar8 = r.intervals.find((iv) => iv.start.startsWith('2026-03-08'))!;
    expect((ms(mar8.end) - ms(mar8.start)) / 3_600_000).toBe(23);
  });
});
