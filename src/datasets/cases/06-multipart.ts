/**
 * Slice 6 — Multi-part / compound (12 items). The decomposition slice:
 * every query expands to a SET of contiguous ranges, and in Task 7b the downstream
 * range-only tool forces one call per piece. The slice deliberately varies the compound
 * STRUCTURE — AND (intersection), OR (union), NOT (exclusion), COMPARE, MIXED shapes,
 * multi-time-of-day — because each has its own signature failure (collapsing to one
 * bounding range, dropping the NOT, computing only one side of a compare…).
 *
 * Grammar notes (findings, not bugs): NOT has no operator — exclusions are authored as
 * the union of the surrounding ranges, so an IR-arm model must do that decomposition
 * itself. "Business days only" uses filter.businessDays (a blessed grammar extension;
 * plain weekdays would wrongly keep Presidents' Day in M6-08).
 */
import { d, days, filter, nth, preset, range, shift, union, WEEKDAYS, wd } from './lib/build.js';
import type { CaseItem } from './lib/types.js';

const w = (dd: string, s: string, e: string): [string, string] => [`${dd}T${s}`, `${dd}T${e}`];

export const MULTIPART: CaseItem[] = [
  {
    id: 'M6-01', slice: 'multipart', anchor: 'A5',
    query: 'utilization over the past month, Tue–Thu, 8am–12pm',
    canonicalIR: filter(range(shift(preset('today'), 'P1M', 'before'), preset('yesterday')), {
      weekdays: ['tue', 'wed', 'thu'],
      timeOfDay: { start: '08:00', end: '12:00' },
    }),
    expected: ['2026-05-12', '2026-05-13', '2026-05-14', '2026-05-19', '2026-05-20', '2026-05-21', '2026-05-26', '2026-05-27', '2026-05-28', '2026-06-02', '2026-06-03', '2026-06-04'].map((dd) => w(dd, '08:00', '12:00')),
    cardinality: 'set', granularity: 'hour',
    expectedAmbiguity: 2, shouldClarify: false,
    notes: 'THE canonical AND query. "Past month" = rolling [May 9, Jun 9) excluding today (C9) — so Tue Jun 9 is NOT a window; including it is the off-by-one to watch. 12 windows.',
  },
  {
    id: 'M6-02', slice: 'multipart', anchor: 'A2',
    query: 'errors in September on weekends, midnight–6am',
    canonicalIR: filter(d({ month: 9 }), { weekdays: ['sat', 'sun'], timeOfDay: { start: '00:00', end: '06:00' } }),
    expected: ['2025-09-06', '2025-09-07', '2025-09-13', '2025-09-14', '2025-09-20', '2025-09-21', '2025-09-27', '2025-09-28'].map((dd) => w(dd, '00:00', '06:00')),
    cardinality: 'set', granularity: 'hour',
    expectedAmbiguity: 2, shouldClarify: false,
  },
  {
    id: 'M6-03', slice: 'multipart', anchor: 'A5', query: 'logins this Monday and this Friday',
    canonicalIR: union(wd('mon', 'this'), wd('fri', 'this')),
    expected: days('2026-06-08', '2026-06-12'), cardinality: 'set', granularity: 'day',
    expectedAmbiguity: 2, shouldClarify: false,
    notes: 'OR over two points. Signature failure: collapsing to [Jun 8, Jun 13).',
  },
  {
    id: 'M6-04', slice: 'multipart', anchor: 'A1', query: 'deploys in March and in May',
    canonicalIR: union(d({ month: 3 }), d({ month: 5 })),
    expected: [['2026-03-01', '2026-04-01'], ['2026-05-01', '2026-06-01']], cardinality: 'set', granularity: 'month',
    expectedAmbiguity: 1, shouldClarify: false,
    notes: 'OR over two months. Collapsing to [Mar 1, Jun 1) silently includes April.',
  },
  {
    id: 'M6-05', slice: 'multipart', anchor: 'A5', query: 'traffic from 8–10am and 2–4pm yesterday',
    canonicalIR: union(
      filter(preset('yesterday'), { timeOfDay: { start: '08:00', end: '10:00' } }),
      filter(preset('yesterday'), { timeOfDay: { start: '14:00', end: '16:00' } }),
    ),
    expected: [w('2026-06-08', '08:00', '10:00'), w('2026-06-08', '14:00', '16:00')], cardinality: 'set', granularity: 'hour',
    expectedAmbiguity: 2, shouldClarify: false,
    notes: 'OR over two clock windows. Collapsing to [08:00, 16:00) is the failure.',
  },
  {
    id: 'M6-06', slice: 'multipart', anchor: 'A1', query: 'every day this month except weekends',
    canonicalIR: filter(preset('this_month'), { weekdays: WEEKDAYS }),
    expected: days(...['02', '03', '04', '05', '06', '09', '10', '11', '12', '13', '16', '17', '18', '19', '20', '23', '24', '25', '26', '27', '30', '31'].map((dd) => `2026-03-${dd}`)),
    cardinality: 'set', granularity: 'day',
    expectedAmbiguity: 2, shouldClarify: false,
    notes: 'NOT expressed as the complementary weekday filter. March 2026 has no federal holiday, so weekdays = business days: 22 members.',
  },
  {
    id: 'M6-07', slice: 'multipart', anchor: 'A4', query: 'this week except Thanksgiving',
    canonicalIR: union(
      range(d({ month: 11, day: 24, which: 'this' }), d({ month: 11, day: 26, which: 'this' })),
      range(d({ month: 11, day: 28, which: 'this' }), d({ month: 11, day: 30, which: 'this' })),
    ),
    expected: [['2025-11-24', '2025-11-27'], ['2025-11-28', '2025-12-01']], cardinality: 'set', granularity: 'day',
    expectedAmbiguity: 2, shouldClarify: false,
    notes: 'NOT with a hole: excluding Thursday SPLITS the week into two contiguous ranges (2 calls, not 1). The grammar has no exclusion operator — the decomposition is authored (and is exactly what an IR-arm model must also produce). Failures: returning the whole week, or off-by-one around the gap.',
  },
  {
    id: 'M6-08', slice: 'multipart', anchor: 'A1', query: 'the last 30 days, business days only',
    canonicalIR: filter(range(shift(preset('today'), 'P30D', 'before'), preset('yesterday')), { businessDays: true }),
    expected: days(...[
      '2026-02-10', '2026-02-11', '2026-02-12', '2026-02-13',
      '2026-02-17', '2026-02-18', '2026-02-19', '2026-02-20',
      '2026-02-23', '2026-02-24', '2026-02-25', '2026-02-26', '2026-02-27',
      '2026-03-02', '2026-03-03', '2026-03-04', '2026-03-05', '2026-03-06',
      '2026-03-09', '2026-03-10', '2026-03-11',
    ]),
    cardinality: 'set', granularity: 'day',
    expectedAmbiguity: 2, shouldClarify: false,
    notes: 'AND+NOT: "business days" drops weekends AND Presidents Day (Mon Feb 16) → 21 members, not 22. Keeping the holiday is the tracked Sev-3 variant. "Last 30 days" = [Feb 10, Mar 12) per C9.',
  },
  {
    id: 'M6-09', slice: 'multipart', anchor: 'A5', query: 'compare this month to last month',
    canonicalIR: union(preset('this_month'), preset('last_month')),
    expected: [['2026-05-01', '2026-06-01'], ['2026-06-01', '2026-07-01']], cardinality: 'set', granularity: 'month',
    expectedAmbiguity: 1, shouldClarify: false,
    notes: 'COMPARE: two ADJACENT months that must stay separate pieces (one query each) — merging into [May 1, Jul 1) destroys the comparison.',
  },
  {
    id: 'M6-10', slice: 'multipart', anchor: 'A5', query: 'Q2 this year vs Q2 last year',
    canonicalIR: union(nth(2, 'quarter', preset('this_year')), nth(2, 'quarter', preset('last_year'))),
    expected: [['2025-04-01', '2025-07-01'], ['2026-04-01', '2026-07-01']], cardinality: 'set', granularity: 'quarter',
    expectedAmbiguity: 2, shouldClarify: false,
    notes: 'Year-over-year COMPARE: non-adjacent periods across calendar years. Computing only one side is the failure.',
  },
  {
    id: 'M6-11', slice: 'multipart', anchor: 'A5', query: 'the incident on June 1 and the week after',
    canonicalIR: union(
      d({ month: 6, day: 1, which: 'this' }),
      range(shift(d({ month: 6, day: 1, which: 'this' }), 'P1D', 'after'), shift(d({ month: 6, day: 1, which: 'this' }), 'P7D', 'after')),
    ),
    expected: [['2026-06-01', '2026-06-02'], ['2026-06-02', '2026-06-09']], cardinality: 'set', granularity: 'day',
    expectedAmbiguity: 2, shouldClarify: false,
    acceptable: [[['2026-06-01', '2026-06-02'], ['2026-06-08', '2026-06-15']]],
    notes: 'MIXED cardinality: a day point + "the week after". Jun 1 2026 is a MONDAY, so "the week after" has two defensible readings: the 7 days following (key) or the following CALENDAR week Jun 8–14 (acceptable, added at the v0.4 consensus audit — 8/24 answers across 3 models chose it).',
  },
  {
    id: 'M6-12', slice: 'multipart', anchor: 'A1', query: 'last week, weekdays, 8–12 and 1–5',
    canonicalIR: union(
      filter(preset('last_week'), { weekdays: WEEKDAYS, timeOfDay: { start: '08:00', end: '12:00' } }),
      filter(preset('last_week'), { weekdays: WEEKDAYS, timeOfDay: { start: '13:00', end: '17:00' } }),
    ),
    expected: ['2026-03-02', '2026-03-03', '2026-03-04', '2026-03-05', '2026-03-06'].flatMap((dd) => [w(dd, '08:00', '12:00'), w(dd, '13:00', '17:00')]),
    cardinality: 'set', granularity: 'hour',
    expectedAmbiguity: 2, shouldClarify: false,
    notes: 'Multi-TOD: two windows per weekday = 10 pieces. Failures: one window per day (5), or merging to 08:00–17:00.',
  },
  // ── hard expansion (v0.3) ──
  {
    id: 'M6-13', slice: 'multipart', anchor: 'A5', query: 'compare the first week of this quarter to the first week of last quarter',
    canonicalIR: union(nth(1, 'week', preset('this_quarter')), nth(1, 'week', preset('last_quarter'))),
    expected: [['2026-01-01', '2026-01-08'], ['2026-04-01', '2026-04-08']], cardinality: 'set', granularity: 'week',
    expectedAmbiguity: 2, shouldClarify: false,
    notes: 'COMPARE over chained sub-period resolutions (quarter → its first week, twice).',
  },
  {
    id: 'M6-14', slice: 'multipart', anchor: 'A2', query: 'weekend mornings since the start of the month, 6–10am',
    canonicalIR: filter(range(d({ month: 9, day: 1, which: 'this' }), { type: 'now' }), { weekdays: ['sat', 'sun'], timeOfDay: { start: '06:00', end: '10:00' } }),
    expected: [['2025-09-06T06:00', '2025-09-06T10:00'], ['2025-09-07T06:00', '2025-09-07T10:00'], ['2025-09-13T06:00', '2025-09-13T10:00'], ['2025-09-14T06:00', '2025-09-14T10:00']],
    cardinality: 'set', granularity: 'hour', open: true,
    expectedAmbiguity: 2, shouldClarify: false,
    notes: 'Open-ended base (month-to-now) + weekday + clock filters — three constraints over a to-date window.',
  },
];
