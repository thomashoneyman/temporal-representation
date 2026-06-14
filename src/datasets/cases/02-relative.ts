/**
 * Slice 2 — Relative dates (20 items). The ISO-arm ARITHMETIC slice:
 * in the IR arm the model only emits the `shift` node and code does the math — this is
 * the core H1 comparison. Stresses: the calendar-vs-30-day pinning pair (R2-06/07),
 * month/year boundary crossings (R2-04/05/17/18), business days over a holiday
 * (R2-12), and time preservation (R2-20).
 *
 * Authoring note: day-or-coarser durations shift `today` (day grain); clock durations
 * shift `now` (minute grain, coarsened to hour for whole-hour durations).
 */
import { d, days, nth, preset, shift, wd } from './lib/build.js';
import type { CaseItem } from './lib/types.js';
import { now } from './lib/build.js';

export const RELATIVE: CaseItem[] = [
  {
    id: 'R2-01', slice: 'relative', anchor: 'A5', query: 'three days ago',
    canonicalIR: shift(preset('today'), 'P3D', 'before'),
    expected: days('2026-06-06'), cardinality: 'point', granularity: 'day',
    expectedAmbiguity: 1, shouldClarify: false,
  },
  {
    id: 'R2-02', slice: 'relative', anchor: 'A1', query: 'in three days',
    canonicalIR: shift(preset('today'), 'P3D', 'after'),
    expected: days('2026-03-15'), cardinality: 'point', granularity: 'day',
    expectedAmbiguity: 1, shouldClarify: false,
  },
  {
    id: 'R2-03', slice: 'relative', anchor: 'A5', query: 'two weeks from tomorrow',
    canonicalIR: shift(preset('tomorrow'), 'P2W', 'after'),
    expected: days('2026-06-24'), cardinality: 'point', granularity: 'day',
    expectedAmbiguity: 2, shouldClarify: false,
  },
  {
    id: 'R2-04', slice: 'relative', anchor: 'A7', query: 'in 3 days',
    canonicalIR: shift(preset('today'), 'P3D', 'after'),
    expected: days('2026-03-02'), cardinality: 'point', granularity: 'day',
    expectedAmbiguity: 1, shouldClarify: false,
    notes: 'Month boundary across short February (28 days in 2026).',
  },
  {
    id: 'R2-05', slice: 'relative', anchor: 'A6', query: 'in 3 days',
    canonicalIR: shift(preset('today'), 'P3D', 'after'),
    expected: days('2026-01-02'), cardinality: 'point', granularity: 'day',
    expectedAmbiguity: 1, shouldClarify: false,
    notes: 'Year boundary.',
  },
  {
    id: 'R2-06', slice: 'relative', anchor: 'A1', query: 'a month ago',
    canonicalIR: shift(preset('today'), 'P1M', 'before'),
    expected: days('2026-02-12'), cardinality: 'point', granularity: 'day',
    expectedAmbiguity: 3, shouldClarify: false,
    acceptable: [days('2026-02-10')],
    probe: { axis: 'rolling-vs-calendar', candidates: { pinned: days('2026-02-12'), calendar30: days('2026-02-10') }, irMeasures: true },
    notes: 'THE pinning probe: calendar month (day-of-month pinned, Feb 12) vs exactly 30 days (Feb 10). Pair with R2-07.',
  },
  {
    id: 'R2-07', slice: 'relative', anchor: 'A1', query: '30 days ago',
    canonicalIR: shift(preset('today'), 'P30D', 'before'),
    expected: days('2026-02-10'), cardinality: 'point', granularity: 'day',
    expectedAmbiguity: 1, shouldClarify: false,
    notes: 'The exact-arithmetic half of the R2-06 pair: "30 days" is never the pinned month.',
  },
  {
    id: 'R2-08', slice: 'relative', anchor: 'A3', query: 'a month ago',
    canonicalIR: shift(preset('today'), 'P1M', 'before'),
    expected: days('2025-12-15'), cardinality: 'point', granularity: 'day',
    expectedAmbiguity: 2, shouldClarify: false,
    notes: 'Pinned month-back across a year boundary.',
  },
  {
    id: 'R2-09', slice: 'relative', anchor: 'A7', query: 'a month ago',
    canonicalIR: shift(preset('today'), 'P1M', 'before'),
    expected: days('2026-01-27'), cardinality: 'point', granularity: 'day',
    expectedAmbiguity: 3, shouldClarify: false,
    acceptable: [days('2026-01-28')],
    probe: { axis: 'rolling-vs-calendar', candidates: { pinned: days('2026-01-27'), calendar30: days('2026-01-28') }, irMeasures: true },
    notes: 'Feb 27 pins to Jan 27; the 30-day reading lands Jan 28 — the two readings flip order vs R2-06.',
  },
  {
    id: 'R2-10', slice: 'relative', anchor: 'A1', query: 'a year ago',
    canonicalIR: shift(preset('today'), 'P1Y', 'before'),
    expected: days('2025-03-12'), cardinality: 'point', granularity: 'day',
    expectedAmbiguity: 1, shouldClarify: false,
  },
  {
    id: 'R2-11', slice: 'relative', anchor: 'A5', query: 'in 6 months',
    canonicalIR: shift(preset('today'), 'P6M', 'after'),
    expected: days('2026-12-09'), cardinality: 'point', granularity: 'day',
    expectedAmbiguity: 1, shouldClarify: false,
  },
  {
    id: 'R2-12', slice: 'relative', anchor: 'A4', query: 'in 3 business days',
    canonicalIR: shift(preset('today'), 'P3D', 'after', true),
    expected: days('2025-12-02'), cardinality: 'point', granularity: 'day',
    expectedAmbiguity: 2, shouldClarify: false,
    notes: 'Skips Thanksgiving: Wed Nov 26 → Fri Nov 28 → Mon Dec 1 → Tue Dec 2. Dec 3 (treating the day after Thanksgiving as a holiday too) is a tracked Sev-3 alternative.',
  },
  {
    id: 'R2-13', slice: 'relative', anchor: 'A2', query: '5 business days ago',
    canonicalIR: shift(preset('today'), 'P5D', 'before', true),
    expected: days('2025-09-08'), cardinality: 'point', granularity: 'day',
    expectedAmbiguity: 2, shouldClarify: false,
  },
  {
    id: 'R2-14', slice: 'relative', anchor: 'A5', query: '4 hours ago',
    canonicalIR: shift(now, 'PT4H', 'before'),
    expected: [['2026-06-09T07:00', '2026-06-09T08:00']], cardinality: 'point', granularity: 'hour',
    expectedAmbiguity: 1, shouldClarify: false,
  },
  {
    id: 'R2-15', slice: 'relative', anchor: 'A1', query: 'in 90 minutes',
    canonicalIR: shift(now, 'PT90M', 'after'),
    expected: [['2026-03-12T16:00', '2026-03-12T16:01']], cardinality: 'point', granularity: 'minute',
    expectedAmbiguity: 1, shouldClarify: false,
  },
  {
    id: 'R2-16', slice: 'relative', anchor: 'A8', query: 'two months from now',
    canonicalIR: shift(preset('today'), 'P2M', 'after'),
    expected: days('2026-06-19'), cardinality: 'point', granularity: 'day',
    expectedAmbiguity: 1, shouldClarify: false,
  },
  {
    id: 'R2-17', slice: 'relative', anchor: 'A7', query: 'in two weeks',
    canonicalIR: shift(preset('today'), 'P2W', 'after'),
    expected: days('2026-03-13'), cardinality: 'point', granularity: 'day',
    expectedAmbiguity: 1, shouldClarify: false,
    notes: 'Crosses the February/March boundary by exact elapsed weeks.',
  },
  {
    id: 'R2-18', slice: 'relative', anchor: 'A3', query: '6 weeks ago',
    canonicalIR: shift(preset('today'), 'P6W', 'before'),
    expected: days('2025-12-04'), cardinality: 'point', granularity: 'day',
    expectedAmbiguity: 1, shouldClarify: false,
    notes: 'Crosses the year boundary by exact elapsed weeks.',
  },
  {
    id: 'R2-19', slice: 'relative', anchor: 'A1', query: 'the day after tomorrow',
    canonicalIR: shift(preset('today'), 'P2D', 'after'),
    expected: days('2026-03-14'), cardinality: 'point', granularity: 'day',
    expectedAmbiguity: 1, shouldClarify: false,
  },
  {
    id: 'R2-20', slice: 'relative', anchor: 'A5', query: 'this time next week',
    canonicalIR: shift(now, 'P1W', 'after'),
    expected: [['2026-06-16T11:00', '2026-06-16T11:01']], cardinality: 'point', granularity: 'minute',
    expectedAmbiguity: 2, shouldClarify: false,
    notes: 'Time-preservation probe: must keep 11:00. The whole-day reading is a tracked grain-coarsening (Sev 3).',
  },

  // ── HARD-ARITHMETIC EXPANSION (key v0.3) ──
  // Added after Task-4 v2 showed single-step small-offset arithmetic is solved by 2026
  // minis: these probe the regimes the literature reports failures in — large
  // magnitudes, chained operations, ordinal/duration computation — where the ISO arm
  // must compute and the IR arm defers (except where noted: some are deliberate
  // grammar-limit probes where even the IR arm must do partial arithmetic).
  {
    id: 'R2-21', slice: 'relative', anchor: 'A5', query: 'in 250 days',
    canonicalIR: shift(preset('today'), 'P250D', 'after'),
    expected: days('2027-02-14'), cardinality: 'point', granularity: 'day',
    expectedAmbiguity: 1, shouldClarify: false,
    notes: 'Large-magnitude offset (the PRIMETIME probe size); crosses a year boundary.',
  },
  {
    id: 'R2-22', slice: 'relative', anchor: 'A5', query: '180 days before Christmas 2026',
    canonicalIR: shift(d({ year: 2026, month: 12, day: 25 }), 'P180D', 'before'),
    expected: days('2026-06-28'), cardinality: 'point', granularity: 'day',
    expectedAmbiguity: 1, shouldClarify: false,
    notes: 'Large backward offset from a named fixed date (year pinned to avoid the occurrence fork).',
  },
  {
    id: 'R2-23', slice: 'relative', anchor: 'A5', query: 'the day exactly halfway between March 3 and August 16',
    canonicalIR: shift(d({ month: 3, day: 3, which: 'this' }), 'P83D', 'after'),
    expected: days('2026-05-25'), cardinality: 'point', granularity: 'day',
    expectedAmbiguity: 2, shouldClarify: false,
    notes: 'Duration-in-disguise: forces computing the span (166 days) and halving it. GRAMMAR-LIMIT PROBE: the IR cannot express "midpoint", so even the IR arm must compute the 83 itself — only the final shift defers.',
  },
  {
    id: 'R2-24', slice: 'relative', anchor: 'A5', query: '10 business days before the end of this quarter',
    canonicalIR: shift(nth('last', 'business_day', preset('this_quarter')), 'P10D', 'before', true),
    expected: days('2026-06-15'), cardinality: 'point', granularity: 'day',
    expectedAmbiguity: 2, shouldClarify: false,
    notes: 'Chained: locate quarter end, then business-day countback (skips weekends; no holidays in range).',
  },
  {
    id: 'R2-25', slice: 'relative', anchor: 'A1', query: 'two weeks after the last business day of next month',
    canonicalIR: shift(nth('last', 'business_day', preset('next_month')), 'P2W', 'after'),
    expected: days('2026-05-14'), cardinality: 'point', granularity: 'day',
    expectedAmbiguity: 1, shouldClarify: false,
    notes: 'Chained: next month → its last business day (Thu Apr 30) → +2 weeks.',
  },
  {
    id: 'R2-26', slice: 'relative', anchor: 'A3', query: 'the 100th day of the year',
    canonicalIR: nth(100, 'day', preset('this_year')),
    expected: days('2026-04-10'), cardinality: 'point', granularity: 'day',
    expectedAmbiguity: 1, shouldClarify: false,
    notes: 'Ordinal-day arithmetic: the ISO arm must count 100 days into the year.',
  },
  {
    id: 'R2-27', slice: 'relative', anchor: 'A6', query: '26 weeks ago',
    canonicalIR: shift(preset('today'), 'P26W', 'before'),
    expected: days('2025-07-01'), cardinality: 'point', granularity: 'day',
    expectedAmbiguity: 1, shouldClarify: false,
    notes: 'Large countback (half a year in weeks) across a mid-year boundary.',
  },
  {
    id: 'R2-28', slice: 'relative', anchor: 'A2', query: '400 days from now',
    canonicalIR: shift(preset('today'), 'P400D', 'after'),
    expected: days('2026-10-20'), cardinality: 'point', granularity: 'day',
    expectedAmbiguity: 1, shouldClarify: false,
    notes: 'Beyond-a-year magnitude.',
  },
  {
    id: 'R2-29', slice: 'relative', anchor: 'A5', query: 'the Monday after next',
    canonicalIR: shift(wd('mon', 'next'), 'P1W', 'after'),
    expected: days('2026-06-22'), cardinality: 'point', granularity: 'day',
    expectedAmbiguity: 2, shouldClarify: false,
    acceptable: [days('2026-06-15')],
    notes: 'Compositional weekday arithmetic; "the coming Monday" misread is the tracked alternative.',
  },
  {
    id: 'R2-30', slice: 'relative', anchor: 'A2', query: '90 days before the end of the year',
    canonicalIR: shift(nth('last', 'day', preset('this_year')), 'P90D', 'before'),
    expected: days('2025-10-02'), cardinality: 'point', granularity: 'day',
    expectedAmbiguity: 2, shouldClarify: false,
    notes: 'Chained: year end (Dec 31) → 90-day countback.',
  },
  {
    id: 'R2-31', slice: 'relative', anchor: 'A7', query: '45 business days from today',
    canonicalIR: shift(preset('today'), 'P45D', 'after', true),
    expected: days('2026-05-01'), cardinality: 'point', granularity: 'day',
    expectedAmbiguity: 2, shouldClarify: false,
    notes: 'Large business-day count (9 full weeks of weekday-skipping; no federal holidays in the span).',
  },
  {
    id: 'R2-32', slice: 'relative', anchor: 'A5', query: 'in 1000 hours',
    canonicalIR: shift(now, 'PT1000H', 'after'),
    expected: [['2026-07-21T03:00', '2026-07-21T04:00']], cardinality: 'point', granularity: 'hour',
    expectedAmbiguity: 1, shouldClarify: false,
    notes: 'Large sub-day magnitude: 41 days 16 hours; lands at 03:00, not midnight.',
  },
  {
    id: 'R2-33', slice: 'relative', anchor: 'A4', query: 'three months and ten days from today',
    canonicalIR: shift(preset('today'), 'P3M10D', 'after'),
    expected: days('2026-03-08'), cardinality: 'point', granularity: 'day',
    expectedAmbiguity: 2, shouldClarify: false,
    notes: 'Compound calendar+exact duration in one phrase; lands ON the 2026 spring-forward day (a 23-hour day — offsets flip across it).',
  },
  {
    id: 'R2-34', slice: 'relative', anchor: 'A8', query: 'the second-to-last business day of this month',
    canonicalIR: shift(nth('last', 'business_day', preset('this_month')), 'P1D', 'before', true),
    expected: days('2026-04-29'), cardinality: 'point', granularity: 'day',
    expectedAmbiguity: 2, shouldClarify: false,
    notes: "From-the-end ordinal the grammar lacks (nth has 'last' but no negative n) — encoded as a business-day step back from the last; another grammar-limit probe.",
  },
];
