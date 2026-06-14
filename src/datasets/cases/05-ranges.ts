/**
 * Slice 5 — Ranges & sets (17 items).
 * Stresses: end-inclusivity ("through the 4th" — the Sev-1 fencepost, G5-01/11),
 * open-ended "since"/"onward" ranges (G5-02/03/17), the first-week convention probe
 * (G5-06), bare-quarter occurrence (G5-08), rolling windows that exclude today
 * (G5-12/13), and date-sets where the failure is collapsing to one bounding range.
 */
import { d, days, filter, nth, preset, range, shift, union, WEEKDAYS } from './lib/build.js';
import type { CaseItem } from './lib/types.js';

export const RANGES: CaseItem[] = [
  {
    id: 'G5-01', slice: 'ranges', anchor: 'A1', query: 'March 1 through 4',
    canonicalIR: range(d({ month: 3, day: 1, which: 'this' }), d({ month: 3, day: 4, which: 'this' })),
    expected: [['2026-03-01', '2026-03-05']], cardinality: 'range', granularity: 'day',
    expectedAmbiguity: 2, shouldClarify: false,
    probe: { axis: 'bounds', candidates: { inclusive: [['2026-03-01', '2026-03-05']], exclusive: [['2026-03-01', '2026-03-04']] } }, // IR range node is grain-inclusive by OUR convention — resolver echo
    notes: '"Through" includes the 4th (end = Mar 5). The exclusive misread is the classic Sev-1 fencepost. Endpoints pinned which:\'this\' — mid-March, "March 1–4" means THIS March, not 2027.',
  },
  {
    id: 'G5-02', slice: 'ranges', anchor: 'A1', query: 'since March',
    canonicalIR: range(d({ month: 3 }), { type: 'now' }),
    expected: [['2026-03-01', '2026-03-12T14:30']], cardinality: 'range', granularity: 'month', open: true,
    expectedAmbiguity: 3, shouldClarify: false,
    acceptable: [[['2026-03-01', '2026-03-12']], [['2026-03-01', '2026-03-13']]],
    notes: 'Start = this March; end = now. Today-midnight / end-of-today ends are tracked Sev-2 variants.',
  },
  {
    id: 'G5-03', slice: 'ranges', anchor: 'A5', query: 'since March',
    canonicalIR: range(d({ month: 3 }), { type: 'now' }),
    expected: [['2026-03-01', '2026-06-09T11:00']], cardinality: 'range', granularity: 'month', open: true,
    expectedAmbiguity: 2, shouldClarify: false,
    notes: 'March has fully passed at Jun 9 — the range guard pulls the over-rolled bare March back to 2026.',
  },
  {
    id: 'G5-04', slice: 'ranges', anchor: 'A1', query: 'weekends in March',
    canonicalIR: filter(d({ month: 3 }), { weekdays: ['sat', 'sun'] }),
    expected: days('2026-03-01', '2026-03-07', '2026-03-08', '2026-03-14', '2026-03-15', '2026-03-21', '2026-03-22', '2026-03-28', '2026-03-29'),
    cardinality: 'set', granularity: 'day',
    expectedAmbiguity: 1, shouldClarify: false,
    notes: '9 weekend days (Mar 1 2026 is a Sunday). Mar 8 is the 23-hour spring-forward day — members are compared as half-open intervals, never as "24h". Headline failure: collapsing to one [Mar 1, Mar 30) range.',
  },
  {
    id: 'G5-05', slice: 'ranges', anchor: 'A2', query: 'Tuesdays in September',
    canonicalIR: filter(d({ month: 9 }), { weekdays: ['tue'] }),
    expected: days('2025-09-02', '2025-09-09', '2025-09-16', '2025-09-23', '2025-09-30'),
    cardinality: 'set', granularity: 'day',
    expectedAmbiguity: 1, shouldClarify: false,
  },
  {
    id: 'G5-06', slice: 'ranges', anchor: 'A1', query: 'the first week of March',
    canonicalIR: nth(1, 'week', d({ month: 3 })),
    expected: [['2026-03-01', '2026-03-08']], cardinality: 'range', granularity: 'week',
    expectedAmbiguity: 3, shouldClarify: false,
    acceptable: [[['2026-03-02', '2026-03-09']]],
    probe: { axis: 'bounds', candidates: { days1to7: [['2026-03-01', '2026-03-08']], firstFullWeek: [['2026-03-02', '2026-03-09']] } },
    notes: 'Genuinely ambiguous: days 1–7 (our default) vs the first full Mon-start week (Mar 2–8). Steerable via conventions.firstWeek.',
  },
  {
    id: 'G5-07', slice: 'ranges', anchor: 'A3', query: 'Q1',
    canonicalIR: nth(1, 'quarter', preset('this_year')),
    expected: [['2026-01-01', '2026-04-01']], cardinality: 'range', granularity: 'quarter',
    expectedAmbiguity: 1, shouldClarify: false,
  },
  {
    id: 'G5-08', slice: 'ranges', anchor: 'A6', query: 'Q1',
    canonicalIR: nth(1, 'quarter', preset('next_year')),
    expected: [['2026-01-01', '2026-04-01']], cardinality: 'range', granularity: 'quarter',
    expectedAmbiguity: 2, shouldClarify: false,
    acceptable: [[['2025-01-01', '2025-04-01']]],
    probe: { axis: 'occurrence', candidates: { next: [['2026-01-01', '2026-04-01']], mostRecent: [['2025-01-01', '2025-04-01']] }, irMeasures: true },
    notes: 'Bare "Q1" said Dec 30 2025: next occurrence = Q1 2026 (authored via next_year — the grammar has no bare-year occurrence). Q1 2025 (most recent) is the tracked Sev-4 alternative.',
  },
  {
    id: 'G5-09', slice: 'ranges', anchor: 'A4', query: 'December',
    canonicalIR: d({ month: 12 }),
    expected: [['2025-12-01', '2026-01-01']], cardinality: 'range', granularity: 'month',
    expectedAmbiguity: 1, shouldClarify: false,
  },
  {
    id: 'G5-10', slice: 'ranges', anchor: 'A5', query: 'December',
    canonicalIR: d({ month: 12 }),
    expected: [['2026-12-01', '2027-01-01']], cardinality: 'range', granularity: 'month',
    expectedAmbiguity: 1, shouldClarify: false,
  },
  {
    id: 'G5-11', slice: 'ranges', anchor: 'A1', query: 'March 1 to March 15',
    canonicalIR: range(d({ month: 3, day: 1, which: 'this' }), d({ month: 3, day: 15, which: 'this' })),
    expected: [['2026-03-01', '2026-03-16']], cardinality: 'range', granularity: 'day',
    expectedAmbiguity: 2, shouldClarify: false,
    notes: 'The anchor (Mar 12) sits INSIDE the range — the current-period reading. "To" includes the 15th.',
  },
  {
    id: 'G5-12', slice: 'ranges', anchor: 'A8', query: 'the next three days',
    canonicalIR: range(shift(preset('today'), 'P1D', 'after'), shift(preset('today'), 'P3D', 'after')),
    expected: [['2026-04-20', '2026-04-23']], cardinality: 'range', granularity: 'day',
    expectedAmbiguity: 2, shouldClarify: false,
    notes: 'C9 rolling: excludes today (Apr 20–22). Include-today is the tracked Sev-3 variant.',
  },
  {
    id: 'G5-13', slice: 'ranges', anchor: 'A1', query: 'the last 7 days',
    canonicalIR: range(shift(preset('today'), 'P7D', 'before'), preset('yesterday')),
    expected: [['2026-03-05', '2026-03-12']], cardinality: 'range', granularity: 'day',
    expectedAmbiguity: 2, shouldClarify: false,
    notes: 'C9 rolling: the 7 COMPLETED days before today.',
  },
  {
    id: 'G5-14', slice: 'ranges', anchor: 'A5', query: 'first half of the year',
    canonicalIR: range(d({ month: 1 }), d({ month: 6 })),
    expected: [['2026-01-01', '2026-07-01']], cardinality: 'range', granularity: 'month',
    expectedAmbiguity: 1, shouldClarify: false,
    notes: 'Bare January would roll to 2027 under next-occurrence; the range guard pulls it back so the range stays coherent (Jan–Jun 2026).',
  },
  {
    id: 'G5-15', slice: 'ranges', anchor: 'A2', query: 'Mondays in October',
    canonicalIR: filter(d({ month: 10 }), { weekdays: ['mon'] }),
    expected: days('2025-10-06', '2025-10-13', '2025-10-20', '2025-10-27'),
    cardinality: 'set', granularity: 'day',
    expectedAmbiguity: 1, shouldClarify: false,
  },
  {
    id: 'G5-16', slice: 'ranges', anchor: 'A1', query: 'weekdays this week',
    canonicalIR: filter(preset('this_week'), { weekdays: WEEKDAYS }),
    expected: days('2026-03-09', '2026-03-10', '2026-03-11', '2026-03-12', '2026-03-13'),
    cardinality: 'set', granularity: 'day',
    expectedAmbiguity: 1, shouldClarify: false,
  },
  {
    id: 'G5-17', slice: 'ranges', anchor: 'A5', query: 'anytime from June onward',
    canonicalIR: range(d({ month: 6 }), null),
    expected: [['2026-06-01', '2027-06-09']], cardinality: 'range', granularity: 'month', open: true,
    expectedAmbiguity: 3, shouldClarify: false,
    notes: 'Genuinely open end: clamped to the +12-month window (recorded via open:true); only the bounded start is graded hard.',
  },
  // ── hard expansion (v0.3) ──
  {
    id: 'G5-18', slice: 'ranges', anchor: 'A3', query: 'the first and third Monday of each month this quarter',
    canonicalIR: union(
      nth(1, 'mon', d({ month: 1, which: 'this' })), nth(3, 'mon', d({ month: 1, which: 'this' })),
      nth(1, 'mon', d({ month: 2, which: 'this' })), nth(3, 'mon', d({ month: 2, which: 'this' })),
      nth(1, 'mon', d({ month: 3, which: 'this' })), nth(3, 'mon', d({ month: 3, which: 'this' })),
    ),
    expected: days('2026-01-05', '2026-01-19', '2026-02-02', '2026-02-16', '2026-03-02', '2026-03-16'),
    cardinality: 'set', granularity: 'day',
    expectedAmbiguity: 2, shouldClarify: false,
    notes: 'The grammar has no per-month iterator — the model must expand the quarter into months itself (6-way union; MLK Day Jan 19 and Presidents Day Feb 16 are members — a trap for models that conflate Mondays with business days).',
  },
  {
    id: 'G5-19', slice: 'ranges', anchor: 'A9', query: 'weekdays in the last two weeks of the year',
    canonicalIR: filter(range(d({ month: 12, day: 18, which: 'this' }), d({ month: 12, day: 31, which: 'this' })), { weekdays: WEEKDAYS }),
    expected: days('2025-12-18', '2025-12-19', '2025-12-22', '2025-12-23', '2025-12-24', '2025-12-25', '2025-12-26', '2025-12-29', '2025-12-30', '2025-12-31'),
    cardinality: 'set', granularity: 'day',
    expectedAmbiguity: 2, shouldClarify: false,
    notes: 'WEEKDAYS includes Christmas (Thu Dec 25) — weekday ≠ business day; excluding it is the trap.',
  },
];
