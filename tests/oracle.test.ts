/**
 * The grammar-level smoke oracle: 40 cases hand-checked in a pre-build lab exercise
 * (anchors Jun 11 / Jun 16 / Feb 19 2026), transcribed as data-driven fixtures.
 *
 * Documented divergences from that lab table, all places where the lab predates the
 * locked conventions and the conventions win by rule:
 *  1. DST: the lab fixed every offset at -04:00; the experiment key is DST-correct.
 *     Expected values here are NY wall-clock instants, so offsets fall out correctly.
 *  2. ytd/qtd END: lab used the anchor instant; convention C8 includes today as a whole
 *     day (end = next midnight). N3-09/10/11 in the answer key encode C8.
 *  3. Cardinality column: the lab tagged week-or-coarser single units "point"; the
 *     final rule (week-grain-or-coarser → range) postdates it and is what we assert.
 * (`notime-report` is an envelope-level case, not a TimeExpr — covered by the
 *  translation scoring tests instead.)
 */
import { DateTime } from 'luxon';
import { describe, expect, it } from 'vitest';
import type { Conventions } from '../src/scate-lite/conventions.js';
import { DEFAULT_CONVENTIONS } from '../src/scate-lite/conventions.js';
import type { TimeExpr } from '../src/scate-lite/ir.js';
import { ZONE, type Cardinality } from '../src/scate-lite/interval.js';
import { resolveIR, type ResolveCtx } from '../src/scate-lite/resolver.js';

const A_JUN11 = '2026-06-11T14:30:00-04:00'; // Thu
const A_JUN16 = '2026-06-16T09:00:00-04:00'; // Tue (business-day demo)
const A_FEB19 = '2026-02-19T10:00:00-05:00'; // Thu (March/May upcoming, year-clean)

// The Appendix C lab oracle was authored under the PROVISIONAL v0.1 conventions
// (bare dates → next occurrence). Task 3 locked the experiment default to 'nearest';
// this suite pins 'next' because it validates NODE SEMANTICS against the lab fixtures,
// not the experiment key (which tests/answer-key.test.ts covers under the live default).
const conventions: Conventions = { ...DEFAULT_CONVENTIONS, datePolicy: 'next' };
const ctxFor = (anchor: string, customPresets?: Record<string, TimeExpr>): ResolveCtx => ({
  anchor,
  conventions,
  ...(customPresets ? { customPresets } : {}),
  window: { backMonths: 12, forwardMonths: 12 },
});

/** NY wall-clock → millis; date-only means midnight. */
const wall = (s: string): number => {
  const dt = DateTime.fromISO(s, { zone: ZONE });
  if (!dt.isValid) throw new Error(`bad fixture instant: ${s}`);
  return dt.toMillis();
};
const days = (...ds: string[]): Array<[string, string]> =>
  ds.map((d) => [d, DateTime.fromISO(d, { zone: ZONE }).plus({ days: 1 }).toISODate()!]);

interface Row {
  id: string;
  anchor: string;
  ir: TimeExpr;
  presets?: Record<string, TimeExpr>;
  expected: Array<[string, string]>; // NY wall-clock [start, end) pairs
  card: Cardinality;
  open?: boolean;
}

const maintenance_window: TimeExpr = { type: 'nth', n: 2, unit: 'sat', of: { type: 'preset', name: 'this_month' } };
const current_sprint: TimeExpr = {
  type: 'range',
  from: { type: 'date', year: 2026, month: 6, day: 1 },
  to: { type: 'date', year: 2026, month: 6, day: 14 },
};

const ROWS: Row[] = [
  // ── specific ──
  { id: 'spec-march4', anchor: A_JUN11, ir: { type: 'date', month: 3, day: 4 }, expected: [['2027-03-04', '2027-03-05']], card: 'point' },
  { id: 'spec-tue-3pm', anchor: A_JUN11, ir: { type: 'weekday', day: 'tue', which: 'next', hour: 15 }, expected: [['2026-06-16T15:00', '2026-06-16T16:00']], card: 'point' },
  { id: 'spec-full-date', anchor: A_JUN11, ir: { type: 'date', year: 2025, month: 3, day: 4 }, expected: [['2025-03-04', '2025-03-05']], card: 'point' },
  { id: 'spec-march4-this', anchor: A_JUN11, ir: { type: 'date', month: 3, day: 4, which: 'this' }, expected: [['2026-03-04', '2026-03-05']], card: 'point' },
  { id: 'spec-q3-2025', anchor: A_JUN11, ir: { type: 'nth', n: 3, unit: 'quarter', of: { type: 'date', year: 2025 } }, expected: [['2025-07-01', '2025-10-01']], card: 'range' },
  // ── relative ──
  { id: 'rel-3days-ago', anchor: A_JUN11, ir: { type: 'shift', base: { type: 'preset', name: 'today' }, by: 'P3D', direction: 'before' }, expected: [['2026-06-08', '2026-06-09']], card: 'point' },
  { id: 'rel-30min-ago', anchor: A_JUN11, ir: { type: 'shift', base: { type: 'now' }, by: 'PT30M', direction: 'before' }, expected: [['2026-06-11T14:00', '2026-06-11T14:01']], card: 'point' },
  { id: 'rel-2wk-from-tomorrow', anchor: A_JUN11, ir: { type: 'shift', base: { type: 'preset', name: 'tomorrow' }, by: 'P2W', direction: 'after' }, expected: [['2026-06-26', '2026-06-27']], card: 'point' },
  { id: 'rel-month-ago-cal', anchor: A_JUN11, ir: { type: 'shift', base: { type: 'preset', name: 'today' }, by: 'P1M', direction: 'before' }, expected: [['2026-05-11', '2026-05-12']], card: 'point' },
  { id: 'rel-month-ago-roll', anchor: A_JUN11, ir: { type: 'shift', base: { type: 'preset', name: 'today' }, by: 'P30D', direction: 'before' }, expected: [['2026-05-12', '2026-05-13']], card: 'point' },
  { id: 'rel-3days-after-that', anchor: A_JUN11, ir: { type: 'shift', base: { type: 'iso', start: '2026-06-14T00:00:00-04:00', end: '2026-06-15T00:00:00-04:00' }, by: 'P3D', direction: 'after' }, expected: [['2026-06-17', '2026-06-18']], card: 'range' },
  { id: 'rel-3days-after-nth', anchor: A_JUN11, ir: { type: 'shift', base: { type: 'nth', n: 3, unit: 'thu', of: { type: 'date', month: 6 } }, by: 'P3D', direction: 'after' }, expected: [['2026-06-21', '2026-06-22']], card: 'point' },
  { id: 'rel-3bizdays-ago', anchor: A_JUN16, ir: { type: 'shift', base: { type: 'preset', name: 'today' }, by: 'P3D', direction: 'before', businessDays: true }, expected: [['2026-06-11', '2026-06-12']], card: 'point' },
  // ── named presets ──
  { id: 'named-today', anchor: A_JUN11, ir: { type: 'preset', name: 'today' }, expected: [['2026-06-11', '2026-06-12']], card: 'point' },
  { id: 'named-yesterday', anchor: A_JUN11, ir: { type: 'preset', name: 'yesterday' }, expected: [['2026-06-10', '2026-06-11']], card: 'point' },
  { id: 'named-last-week', anchor: A_JUN11, ir: { type: 'preset', name: 'last_week' }, expected: [['2026-06-01', '2026-06-08']], card: 'range' },
  { id: 'named-this-week', anchor: A_JUN11, ir: { type: 'preset', name: 'this_week' }, expected: [['2026-06-08', '2026-06-15']], card: 'range' },
  { id: 'named-this-month', anchor: A_JUN11, ir: { type: 'preset', name: 'this_month' }, expected: [['2026-06-01', '2026-07-01']], card: 'range' },
  { id: 'named-this-quarter', anchor: A_JUN11, ir: { type: 'preset', name: 'this_quarter' }, expected: [['2026-04-01', '2026-07-01']], card: 'range' },
  { id: 'named-last-quarter', anchor: A_JUN11, ir: { type: 'preset', name: 'last_quarter' }, expected: [['2026-01-01', '2026-04-01']], card: 'range' },
  // C8 divergence from the lab table: end = day after the anchor, not the anchor instant.
  { id: 'named-ytd', anchor: A_JUN11, ir: { type: 'preset', name: 'ytd' }, expected: [['2026-01-01', '2026-06-12']], card: 'range', open: true },
  { id: 'named-qtd', anchor: A_JUN11, ir: { type: 'preset', name: 'qtd' }, expected: [['2026-04-01', '2026-06-12']], card: 'range', open: true },
  // ── holidays (as date/nth — no holiday node) ──
  { id: 'hol-thanksgiving', anchor: A_JUN11, ir: { type: 'nth', n: 4, unit: 'thu', of: { type: 'date', month: 11 } }, expected: [['2026-11-26', '2026-11-27']], card: 'point' },
  { id: 'hol-halloween', anchor: A_JUN11, ir: { type: 'date', month: 10, day: 31 }, expected: [['2026-10-31', '2026-11-01']], card: 'point' },
  { id: 'hol-july4', anchor: A_JUN11, ir: { type: 'date', month: 7, day: 4 }, expected: [['2026-07-04', '2026-07-05']], card: 'point' },
  { id: 'hol-memorial', anchor: A_FEB19, ir: { type: 'nth', n: 'last', unit: 'mon', of: { type: 'date', month: 5 } }, expected: [['2026-05-25', '2026-05-26']], card: 'point' },
  { id: 'hol-memorial-this', anchor: A_JUN11, ir: { type: 'nth', n: 'last', unit: 'mon', of: { type: 'date', month: 5, which: 'this' } }, expected: [['2026-05-25', '2026-05-26']], card: 'point' },
  // ── custom presets via ref ──
  { id: 'custom-maint', anchor: A_JUN11, presets: { maintenance_window }, ir: { type: 'filter', within: { type: 'ref', id: 'maintenance_window' }, timeOfDay: { start: '02:00', end: '06:00' } }, expected: [['2026-06-13T02:00', '2026-06-13T06:00']], card: 'range' },
  { id: 'custom-sprint', anchor: A_JUN11, presets: { current_sprint }, ir: { type: 'ref', id: 'current_sprint' }, expected: [['2026-06-01', '2026-06-15']], card: 'range' },
  // ── ranges ──
  { id: 'rng-march1-4', anchor: A_FEB19, ir: { type: 'range', from: { type: 'date', month: 3, day: 1 }, to: { type: 'date', month: 3, day: 4 } }, expected: [['2026-03-01', '2026-03-05']], card: 'range' },
  { id: 'rng-since-march', anchor: A_JUN11, ir: { type: 'range', from: { type: 'date', month: 3 }, to: null }, expected: [['2026-03-01', '2026-06-11T14:30']], card: 'range', open: true },
  { id: 'rng-q1-q2', anchor: A_JUN11, ir: { type: 'range', from: { type: 'nth', n: 1, unit: 'quarter', of: { type: 'preset', name: 'this_year' } }, to: { type: 'nth', n: 2, unit: 'quarter', of: { type: 'preset', name: 'this_year' } } }, expected: [['2026-01-01', '2026-07-01']], card: 'range' },
  // ── sets ──
  { id: 'set-weekends-march', anchor: A_FEB19, ir: { type: 'filter', within: { type: 'date', month: 3 }, weekdays: ['sat', 'sun'] }, expected: days('2026-03-01', '2026-03-07', '2026-03-08', '2026-03-14', '2026-03-15', '2026-03-21', '2026-03-22', '2026-03-28', '2026-03-29'), card: 'set' },
  { id: 'mp-pastmonth-tuethu-8-12', anchor: A_JUN11, ir: { type: 'filter', within: { type: 'preset', name: 'last_month' }, weekdays: ['tue', 'wed', 'thu'], timeOfDay: { start: '08:00', end: '12:00' } }, expected: ['05', '06', '07', '12', '13', '14', '19', '20', '21', '26', '27', '28'].map((d) => [`2026-05-${d}T08:00`, `2026-05-${d}T12:00`]), card: 'set' },
  // ── nth ──
  { id: 'nth-last-fri-month', anchor: A_JUN11, ir: { type: 'nth', n: 'last', unit: 'fri', of: { type: 'preset', name: 'this_month' } }, expected: [['2026-06-26', '2026-06-27']], card: 'point' },
  { id: 'nth-last-bizday-q', anchor: A_JUN11, ir: { type: 'nth', n: 'last', unit: 'business_day', of: { type: 'preset', name: 'this_quarter' } }, expected: [['2026-06-30', '2026-07-01']], card: 'point' },
  { id: 'nth-first-bizday-month', anchor: A_JUN11, ir: { type: 'nth', n: 1, unit: 'business_day', of: { type: 'preset', name: 'this_month' } }, expected: [['2026-06-01', '2026-06-02']], card: 'point' },
  // ── union ──
  { id: 'union-q1-q3', anchor: A_JUN11, ir: { type: 'union', of: [{ type: 'nth', n: 1, unit: 'quarter', of: { type: 'date', year: 2025 } }, { type: 'nth', n: 3, unit: 'quarter', of: { type: 'date', year: 2025 } }] }, expected: [['2025-01-01', '2025-04-01'], ['2025-07-01', '2025-10-01']], card: 'set' },
  // ── ambiguous (best-guess value; the 4-rating lives in the envelope) ──
  { id: 'amb-holidays', anchor: A_JUN11, ir: { type: 'range', from: { type: 'date', month: 12, day: 25 }, to: { type: 'date', year: 2027, month: 1, day: 1 } }, expected: [['2026-12-25', '2027-01-02']], card: 'range' },
];

describe('Appendix C golden oracle (39 TimeExpr cases)', () => {
  it.each(ROWS)('$id', (row) => {
    const resolved = resolveIR(row.ir, ctxFor(row.anchor, row.presets));
    const actual = resolved.intervals.map((iv) => [wall(iv.start), wall(iv.end)]);
    const expected = row.expected.map(([s, e]) => [wall(s), wall(e)]);
    expect(actual).toEqual(expected);
    expect(resolved.cardinality).toBe(row.card);
    expect(resolved.open ?? false).toBe(row.open ?? false);
  });

  it('DST correctness: Thanksgiving 2026 resolves with the EST offset (-05:00)', () => {
    const r = resolveIR({ type: 'nth', n: 4, unit: 'thu', of: { type: 'date', month: 11 } }, ctxFor(A_JUN11));
    expect(r.intervals[0].start).toBe('2026-11-26T00:00:00-05:00');
  });

  it('throws loudly on unresolvable IR (unknown ref)', () => {
    expect(() => resolveIR({ type: 'ref', id: 'nope' }, ctxFor(A_JUN11))).toThrow(/unknown ref/);
  });

  it('endExclusive: range(today−7d, today, endExclusive) = the 7 completed days', () => {
    const r = resolveIR(
      { type: 'range', from: { type: 'shift', base: { type: 'preset', name: 'today' }, by: 'P7D', direction: 'before' }, to: { type: 'preset', name: 'today' }, endExclusive: true },
      ctxFor(A_JUN11),
    );
    expect(r.intervals[0].start).toBe('2026-06-04T00:00:00-04:00');
    expect(r.intervals[0].end).toBe('2026-06-11T00:00:00-04:00'); // today EXCLUDED
  });

  it('clock-grain range ends are always exclusive: 8–10am = [08:00, 10:00)', () => {
    const r = resolveIR(
      { type: 'range', from: { type: 'date', year: 2026, month: 6, day: 8, hour: 8 }, to: { type: 'date', year: 2026, month: 6, day: 8, hour: 10 } },
      ctxFor(A_JUN11),
    );
    expect(r.intervals[0].start).toBe('2026-06-08T08:00:00-04:00');
    expect(r.intervals[0].end).toBe('2026-06-08T10:00:00-04:00'); // NOT 11:00
  });

  it('requireShape: a range-only tool admits points but rejects sets', () => {
    const set: TimeExpr = { type: 'filter', within: { type: 'date', month: 3 }, weekdays: ['sat', 'sun'] };
    expect(() => resolveIR(set, ctxFor(A_FEB19), { requireShape: 'range' })).toThrow(/shape mismatch/);
    expect(() => resolveIR({ type: 'preset', name: 'today' }, ctxFor(A_JUN11), { requireShape: 'range' })).not.toThrow();
  });
});
