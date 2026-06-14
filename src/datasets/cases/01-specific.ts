/**
 * Slice 1 — Specific dates (14 items).
 * Stresses: bare-date next-occurrence (S1-01/02 vs the S1-03 control), same-day
 * weekday+time (S1-04 vs S1-05), bare day-of-month rolling (S1-06), the invalid
 * Feb 29 edge (S1-07), and hour-grain points (the "whole day for 3pm" Sev-3 failure).
 */
import { d, days, nth, preset, wd } from './lib/build.js';
import type { CaseItem } from './lib/types.js';

export const SPECIFIC: CaseItem[] = [
  {
    id: 'S1-01', slice: 'specific', anchor: 'A1', query: 'March 4',
    canonicalIR: d({ month: 3, day: 4 }),
    expected: days('2026-03-04'), cardinality: 'point', granularity: 'day',
    expectedAmbiguity: 3, shouldClarify: false,
    acceptable: [days('2027-03-04')],
    probe: { axis: 'occurrence', candidates: { next: days('2027-03-04'), currentYear: days('2026-03-04') }, irMeasures: true },
    notes: 'RE-KEYED at Task 3 (v0.2): March 4 passed 8 days ago — nearest occurrence is THIS year (matches every model measured). Next-occurrence (2027) is the tracked Sev-4 alternative.',
  },
  {
    id: 'S1-02', slice: 'specific', anchor: 'A5', query: 'March 4',
    canonicalIR: d({ month: 3, day: 4 }),
    expected: days('2026-03-04'), cardinality: 'point', granularity: 'day',
    expectedAmbiguity: 3, shouldClarify: false,
    acceptable: [days('2027-03-04')],
    probe: { axis: 'occurrence', candidates: { next: days('2027-03-04'), currentYear: days('2026-03-04') }, irMeasures: true },
    notes: 'RE-KEYED at Task 3 (v0.2): nearest = March 2026 (97 days back vs 268 forward). Models split at this distance — ambiguity raised to 3.',
  },
  {
    id: 'S1-03', slice: 'specific', anchor: 'A3', query: 'March 4',
    canonicalIR: d({ month: 3, day: 4 }),
    expected: days('2026-03-04'), cardinality: 'point', granularity: 'day',
    expectedAmbiguity: 1, shouldClarify: false,
    notes: 'Easy control: March 4 is still ahead at A3.',
  },
  {
    id: 'S1-04', slice: 'specific', anchor: 'A5', query: 'Tuesday at 3pm',
    canonicalIR: wd('tue', 'this', { hour: 15 }),
    expected: [['2026-06-09T15:00', '2026-06-09T16:00']], cardinality: 'point', granularity: 'hour',
    expectedAmbiguity: 2, shouldClarify: false,
    acceptable: [[['2026-06-16T15:00', '2026-06-16T16:00']]],
    probe: { axis: 'occurrence', candidates: { sameDay: [['2026-06-09T15:00', '2026-06-09T16:00']], nextWeek: [['2026-06-16T15:00', '2026-06-16T16:00']] }, irMeasures: true },
    notes: 'Anchor IS a Tuesday at 11:00 — 3pm has not passed, so "Tuesday 3pm" = today. Bare weekdays are authored per-anchor (this/next), since the grammar has no time-aware bare roll.',
  },
  {
    id: 'S1-05', slice: 'specific', anchor: 'A1', query: 'Tuesday at 3pm',
    canonicalIR: wd('tue', 'next', { hour: 15 }),
    expected: [['2026-03-17T15:00', '2026-03-17T16:00']], cardinality: 'point', granularity: 'hour',
    expectedAmbiguity: 2, shouldClarify: false,
    notes: 'Off-anchor control: the coming Tuesday.',
  },
  {
    id: 'S1-06', slice: 'specific', anchor: 'A2', query: 'the 1st',
    canonicalIR: d({ day: 1 }),
    expected: days('2025-09-01'), cardinality: 'point', granularity: 'day',
    expectedAmbiguity: 2, shouldClarify: false,
    acceptable: [days('2025-10-01')],
    notes: 'RE-KEYED at Task 3 (v0.2): nearest = this month\'s 1st (14 days back vs 16 forward); next month\'s 1st is the Sev-4 alternative.',
  },
  {
    id: 'S1-07', slice: 'specific', anchor: 'A7', query: 'Feb 29',
    // which:'next' pinned at authoring: under the global 'nearest' policy this would
    // resolve to 2024 (4 days closer than 2028) — defensible arithmetic, absurd reading.
    // Someone asking about Feb 29 means the upcoming leap day.
    canonicalIR: d({ month: 2, day: 29, which: 'next' }),
    expected: days('2028-02-29'), cardinality: 'point', granularity: 'day',
    expectedAmbiguity: 3, shouldClarify: false, clarifyOptional: true,
    acceptable: [days('2026-02-28')],
    notes: 'Feb 29 does not exist in 2026/2027 — next real one is 2028 (outside the ±1y window). Clarifying, or reading "end of Feb" (2026-02-28), are both acceptable. Watch for a hallucinated 2026-02-29.',
  },
  {
    id: 'S1-08', slice: 'specific', anchor: 'A4', query: 'December 25',
    canonicalIR: d({ month: 12, day: 25 }),
    expected: days('2025-12-25'), cardinality: 'point', granularity: 'day',
    expectedAmbiguity: 1, shouldClarify: false,
  },
  {
    id: 'S1-09', slice: 'specific', anchor: 'A6', query: 'January 3rd',
    canonicalIR: d({ month: 1, day: 3 }),
    expected: days('2026-01-03'), cardinality: 'point', granularity: 'day',
    expectedAmbiguity: 1, shouldClarify: false,
    notes: 'Year boundary: said Dec 30 2025, lands Jan 2026.',
  },
  {
    id: 'S1-10', slice: 'specific', anchor: 'A5', query: '6/15',
    canonicalIR: d({ month: 6, day: 15 }),
    expected: days('2026-06-15'), cardinality: 'point', granularity: 'day',
    expectedAmbiguity: 2, shouldClarify: false,
    notes: 'US M/D locale. (A D/M misread of 6/15 is invalid — pick e.g. 5/6 in an expansion to truly separate locales.)',
  },
  {
    id: 'S1-11', slice: 'specific', anchor: 'A1', query: 'the 15th at noon',
    canonicalIR: d({ day: 15, hour: 12 }),
    expected: [['2026-03-15T12:00', '2026-03-15T13:00']], cardinality: 'point', granularity: 'hour',
    expectedAmbiguity: 2, shouldClarify: false,
  },
  {
    id: 'S1-12', slice: 'specific', anchor: 'A2', query: '5pm',
    canonicalIR: d({ hour: 17 }),
    expected: [['2025-09-15T17:00', '2025-09-15T18:00']], cardinality: 'point', granularity: 'hour',
    expectedAmbiguity: 2, shouldClarify: false,
    notes: 'Bare time-of-day: today if not yet passed (anchor is 09:00).',
  },
  {
    id: 'S1-13', slice: 'specific', anchor: 'A8', query: 'April 30',
    canonicalIR: d({ month: 4, day: 30 }),
    expected: days('2026-04-30'), cardinality: 'point', granularity: 'day',
    expectedAmbiguity: 1, shouldClarify: false,
  },
  {
    id: 'S1-14', slice: 'specific', anchor: 'A9', query: 'noon on the 5th',
    canonicalIR: d({ day: 5, hour: 12 }),
    expected: [['2025-11-05T12:00', '2025-11-05T13:00']], cardinality: 'point', granularity: 'hour',
    expectedAmbiguity: 2, shouldClarify: false,
    notes: 'Oct 5 noon has passed at Oct 31 — rolls to Nov 5. (Nov 5 is EST; DST flipped Nov 2.)',
  },
  // ── hard expansion (v0.3) ──
  {
    id: 'S1-15', slice: 'specific', anchor: 'A1', query: 'the third Tuesday of next month',
    canonicalIR: nth(3, 'tue', preset('next_month')),
    expected: days('2026-04-21'), cardinality: 'point', granularity: 'day',
    expectedAmbiguity: 1, shouldClarify: false,
    notes: 'Ordinal weekday inside a relative month — two chained resolutions.',
  },
];
