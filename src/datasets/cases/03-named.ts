/**
 * Slice 3 — Named presets & holidays (21 items).
 * Stresses: week-start and week-membership (N3-02..05, incl. the Sunday-anchor edge),
 * to-date inclusivity (N3-09..11), year/quarter boundaries (N3-07/08), holiday rules as
 * date/nth nodes, the self-reference probe (anchor IS Halloween, N3-18), and the
 * past-holiday roll (N3-19/20).
 */
import { d, days, nth, preset } from './lib/build.js';
import type { CaseItem } from './lib/types.js';

const week = (s: string, e: string): Array<[string, string]> => [[s, e]];

export const NAMED: CaseItem[] = [
  {
    id: 'N3-01', slice: 'named', anchor: 'A1', query: 'today',
    canonicalIR: preset('today'),
    expected: days('2026-03-12'), cardinality: 'point', granularity: 'day',
    expectedAmbiguity: 1, shouldClarify: false,
  },
  {
    id: 'N3-02', slice: 'named', anchor: 'A1', query: 'last week',
    canonicalIR: preset('last_week'),
    expected: week('2026-03-02', '2026-03-09'), cardinality: 'range', granularity: 'week',
    expectedAmbiguity: 2, shouldClarify: false,
    probe: {
      axis: 'week-start',
      candidates: {
        monStart: week('2026-03-02', '2026-03-09'),
        sunStart: week('2026-03-01', '2026-03-08'),
        rolling7: week('2026-03-05', '2026-03-12'),
      },
    },
    notes: 'The week-start probe; this week also crosses the Mar 8 spring-forward DST change.',
  },
  {
    id: 'N3-03', slice: 'named', anchor: 'A2', query: 'last week',
    canonicalIR: preset('last_week'),
    expected: week('2025-09-08', '2025-09-15'), cardinality: 'range', granularity: 'week',
    expectedAmbiguity: 2, shouldClarify: false,
    notes: 'Monday anchor: last week ends exactly at the anchor morning.',
  },
  {
    id: 'N3-04', slice: 'named', anchor: 'A8', query: 'this week',
    canonicalIR: preset('this_week'),
    expected: week('2026-04-13', '2026-04-20'), cardinality: 'range', granularity: 'week',
    expectedAmbiguity: 2, shouldClarify: false,
    probe: {
      axis: 'week-start',
      candidates: {
        monStart: week('2026-04-13', '2026-04-20'),
        sunStart: week('2026-04-19', '2026-04-26'),
      },
    },
    notes: 'Sunday-anchor edge: under Mon-start, Sunday is the LAST day of the current week; under Sun-start it is the FIRST day of a new one.',
  },
  {
    id: 'N3-05', slice: 'named', anchor: 'A8', query: 'last week',
    canonicalIR: preset('last_week'),
    expected: week('2026-04-06', '2026-04-13'), cardinality: 'range', granularity: 'week',
    expectedAmbiguity: 2, shouldClarify: false,
  },
  {
    id: 'N3-06', slice: 'named', anchor: 'A1', query: 'this quarter',
    canonicalIR: preset('this_quarter'),
    expected: week('2026-01-01', '2026-04-01'), cardinality: 'range', granularity: 'quarter',
    expectedAmbiguity: 1, shouldClarify: false,
  },
  {
    id: 'N3-07', slice: 'named', anchor: 'A3', query: 'last quarter',
    canonicalIR: preset('last_quarter'),
    expected: week('2025-10-01', '2026-01-01'), cardinality: 'range', granularity: 'quarter',
    expectedAmbiguity: 2, shouldClarify: false,
    notes: 'Crosses the year boundary (Q4 2025).',
  },
  {
    id: 'N3-08', slice: 'named', anchor: 'A6', query: 'this quarter',
    canonicalIR: preset('this_quarter'),
    expected: week('2025-10-01', '2026-01-01'), cardinality: 'range', granularity: 'quarter',
    expectedAmbiguity: 1, shouldClarify: false,
  },
  {
    id: 'N3-09', slice: 'named', anchor: 'A3', query: 'YTD',
    canonicalIR: preset('ytd'),
    expected: week('2026-01-01', '2026-01-16'), cardinality: 'range', granularity: 'day', open: true,
    expectedAmbiguity: 2, shouldClarify: false,
    notes: 'Coincidence probe: on Jan 15, YTD = QTD = MTD all start Jan 1. End includes today (C8); excluding today is the tracked Sev-1 variant.',
  },
  {
    id: 'N3-10', slice: 'named', anchor: 'A1', query: 'YTD',
    canonicalIR: preset('ytd'),
    expected: week('2026-01-01', '2026-03-13'), cardinality: 'range', granularity: 'day', open: true,
    expectedAmbiguity: 2, shouldClarify: false,
  },
  {
    id: 'N3-11', slice: 'named', anchor: 'A1', query: 'MTD',
    canonicalIR: preset('mtd'),
    expected: week('2026-03-01', '2026-03-13'), cardinality: 'range', granularity: 'day', open: true,
    expectedAmbiguity: 2, shouldClarify: false,
  },
  {
    id: 'N3-12', slice: 'named', anchor: 'A6', query: 'this year',
    canonicalIR: preset('this_year'),
    expected: week('2025-01-01', '2026-01-01'), cardinality: 'range', granularity: 'year',
    expectedAmbiguity: 1, shouldClarify: false,
    notes: 'Two days before New Year — "this year" is still 2025.',
  },
  {
    id: 'N3-13', slice: 'named', anchor: 'A3', query: 'last year',
    canonicalIR: preset('last_year'),
    expected: week('2025-01-01', '2026-01-01'), cardinality: 'range', granularity: 'year',
    expectedAmbiguity: 1, shouldClarify: false,
  },
  {
    id: 'N3-14', slice: 'named', anchor: 'A6', query: 'next year',
    canonicalIR: preset('next_year'),
    expected: week('2026-01-01', '2027-01-01'), cardinality: 'range', granularity: 'year',
    expectedAmbiguity: 1, shouldClarify: false,
  },
  {
    id: 'N3-15', slice: 'named', anchor: 'A4', query: 'Thanksgiving',
    canonicalIR: nth(4, 'thu', d({ month: 11 })),
    expected: days('2025-11-27'), cardinality: 'point', granularity: 'day',
    expectedAmbiguity: 1, shouldClarify: false,
    notes: 'Asked the day BEFORE Thanksgiving — tomorrow, not next year.',
  },
  {
    id: 'N3-16', slice: 'named', anchor: 'A5', query: 'Christmas',
    canonicalIR: d({ month: 12, day: 25 }),
    expected: days('2025-12-25'), cardinality: 'point', granularity: 'day',
    expectedAmbiguity: 2, shouldClarify: false,
    acceptable: [days('2026-12-25')],
    notes: 'RE-KEYED at Task 3 (v0.2): nearest from Jun 9 = LAST Christmas (166 days back vs 199 forward) — the surprising edge of the nearest policy; the upcoming Christmas is the Sev-4 alternative. Ambiguity raised to 2.',
  },
  {
    id: 'N3-17', slice: 'named', anchor: 'A3', query: 'Thanksgiving',
    canonicalIR: nth(4, 'thu', d({ month: 11 })),
    expected: days('2025-11-27'), cardinality: 'point', granularity: 'day',
    expectedAmbiguity: 2, shouldClarify: false,
    acceptable: [days('2026-11-26')],
    notes: 'RE-KEYED at Task 3 (v0.2): nearest from Jan 15 = LAST Thanksgiving (49 days back vs 315 forward) — in January, "Thanksgiving" most plausibly refers to the recent one (reports, comparisons).',
  },
  {
    id: 'N3-18', slice: 'named', anchor: 'A9', query: 'Halloween',
    canonicalIR: d({ month: 10, day: 31 }),
    expected: days('2025-10-31'), cardinality: 'point', granularity: 'day',
    expectedAmbiguity: 1, shouldClarify: false,
    acceptable: [days('2026-10-31')],
    probe: { axis: 'occurrence', candidates: { today: days('2025-10-31'), nextYear: days('2026-10-31') }, irMeasures: true },
    notes: 'Self-reference probe: the anchor IS Halloween, so "Halloween" = today.',
  },
  {
    id: 'N3-19', slice: 'named', anchor: 'A2', query: 'Labor Day',
    canonicalIR: nth(1, 'mon', d({ month: 9 })),
    expected: days('2025-09-01'), cardinality: 'point', granularity: 'day',
    expectedAmbiguity: 2, shouldClarify: false,
    acceptable: [days('2026-09-07')],
    probe: { axis: 'occurrence', candidates: { next: days('2026-09-07'), mostRecent: days('2025-09-01') }, irMeasures: true },
    notes: 'RE-KEYED at Task 3 (v0.2): nearest = the Labor Day 14 days ago, matching all 4 models (3/3 frontier). Next year\'s is the Sev-4 alternative.',
  },
  {
    id: 'N3-20', slice: 'named', anchor: 'A5', query: 'Memorial Day',
    canonicalIR: nth('last', 'mon', d({ month: 5 })),
    expected: days('2026-05-25'), cardinality: 'point', granularity: 'day',
    expectedAmbiguity: 2, shouldClarify: false,
    acceptable: [days('2027-05-31')],
    probe: { axis: 'occurrence', candidates: { next: days('2027-05-31'), mostRecent: days('2026-05-25') }, irMeasures: true },
    notes: 'RE-KEYED at Task 3 (v0.2): nearest = the Memorial Day 15 days ago, matching all 4 models. The ~11.7-months-forward roll was the old next-occurrence reading (now Sev 4).',
  },
  {
    id: 'N3-21', slice: 'named', anchor: 'A1', query: 'this month',
    canonicalIR: preset('this_month'),
    expected: week('2026-03-01', '2026-04-01'), cardinality: 'range', granularity: 'month',
    expectedAmbiguity: 1, shouldClarify: false,
  },
  // ── hard expansion (v0.3) ──
  {
    id: 'N3-22', slice: 'named', anchor: 'A4', query: 'the Tuesday after Thanksgiving',
    canonicalIR: { type: 'weekday', day: 'tue', which: 'next', of: nth(4, 'thu', d({ month: 11, which: 'this' })) },
    expected: days('2025-12-02'), cardinality: 'point', granularity: 'day',
    expectedAmbiguity: 1, shouldClarify: false,
    notes: 'Holiday rule chained into weekday arithmetic, crossing a month boundary.',
  },
  {
    id: 'N3-23', slice: 'named', anchor: 'A5', query: 'the week of July 4th',
    canonicalIR: {
      type: 'range',
      from: { type: 'weekday', day: 'mon', which: 'this', of: d({ month: 7, day: 4 }) },
      to: { type: 'weekday', day: 'sun', which: 'this', of: d({ month: 7, day: 4 }) },
    },
    expected: [['2026-06-29', '2026-07-06']], cardinality: 'range', granularity: 'day',
    expectedAmbiguity: 2, shouldClarify: false,
    notes: '"Week containing a date" has no direct node — must be composed from weekday anchors around the holiday (a grammar-composition probe). Jul 4 2026 is a Saturday; its Mon-start week is Jun 29 – Jul 5.',
  },
];
