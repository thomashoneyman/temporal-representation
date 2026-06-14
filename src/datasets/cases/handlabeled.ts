/**
 * The hand-label validation sample: a cross-slice sample whose expected ISO values —
 * including exact UTC offsets — were written BY HAND from first principles, never by
 * running the resolver. `pnpm test` asserts the resolver matches every row with 0
 * disagreements; this is what makes the answer key trustworthy independently of the
 * resolver's own bugs (and of any model).
 *
 * ── How to re-derive a row (everything you need is in this file) ──
 * Each entry restates its QUERY and ANCHOR, names the CONVENTIONS it leans on, and
 * walks the calendar arithmetic. To verify:
 *   1. Read query + anchor. Work out the wall-clock answer on a real calendar
 *      (`cal 3 2026` in a shell, or any calendar app).
 *   2. Apply the named conventions (the full list: src/scate-lite/README.md).
 *   3. Assign each boundary its UTC offset from the DST table below — the offset in
 *      force at that wall-clock instant. A range crossing a transition has different
 *      offsets at its two ends.
 *   4. Compare with `expected`. Any mismatch = a key bug; raise it, don't "fix" the test.
 *
 * ── US Eastern DST table (America/New_York; all anchors and answers are ET) ──
 *   2025: EDT (−04:00) from Mar 9 to Nov 2; EST (−05:00) otherwise
 *   2026: EDT from Mar 8 to Nov 1
 *   2027: EDT from Mar 14 to Nov 7
 *
 * ── Conventions referenced below (steerable defaults; the key encodes these) ──
 *   NEAREST-OCCURRENCE: a bare date/holiday means whichever occurrence is closest to
                       the anchor, past or future (locked at Task 3 from measurement).
 *   MON-WEEKS:       weeks run Monday through Sunday.
 *   PIN-DAY:         "a month ago" = same day-of-month, previous month (not 30 days).
 *   BUSINESS-DAYS:   Mon–Fri minus US federal holidays.
 *   INCLUSIVE-END:   "through/to X" includes all of X (half-open end = day after X).
 *   WINDOW:          open-ended futures clamp to anchor + 12 months.
 *
 * STAFF-ENGINEER CHECKLIST: re-derive each row by hand before signing off on gate 2.
 */
import type { AnchorId } from './lib/types.js';

export interface HandLabel {
  itemId: string; // must match a dataset item; the test cross-checks query + anchor too
  query: string;
  anchor: { id: AnchorId; iso: string };
  conventions: string[];
  expected: Array<{ start: string; end: string }>;
  derivation: string;
}

export const HAND_LABELED: HandLabel[] = [
  {
    itemId: 'S1-01',
    query: 'March 4',
    anchor: { id: 'A1', iso: '2026-03-12T14:30:00-04:00' },
    conventions: ['NEAREST-OCCURRENCE'],
    expected: [{ start: '2026-03-04T00:00:00-05:00', end: '2026-03-05T00:00:00-05:00' }],
    derivation:
      'It is Thu Mar 12 2026. March 4 2026 is 8 days back; March 4 2027 is ~357 days ahead → nearest is 2026-03-04, the whole day. ' +
      'Offset: Mar 4 2026 precedes the Mar 8 2026 spring-forward → EST −05 on both boundaries.',
  },
  {
    itemId: 'S1-12',
    query: '5pm',
    anchor: { id: 'A2', iso: '2025-09-15T09:00:00-04:00' },
    conventions: ['NEAREST-OCCURRENCE'],
    expected: [{ start: '2025-09-15T17:00:00-04:00', end: '2025-09-15T18:00:00-04:00' }],
    derivation:
      'It is Mon Sep 15 2025, 09:00. Today 17:00 is 8h ahead; yesterday 17:00 is 16h back → nearest is today 17:00, hour grain → [17:00, 18:00). ' +
      'Offset: mid-September 2025 is inside Mar 9–Nov 2 → EDT −04.',
  },
  {
    itemId: 'R2-06',
    query: 'a month ago',
    anchor: { id: 'A1', iso: '2026-03-12T14:30:00-04:00' },
    conventions: ['PIN-DAY'],
    expected: [{ start: '2026-02-12T00:00:00-05:00', end: '2026-02-13T00:00:00-05:00' }],
    derivation:
      'Pin the day-of-month: Mar 12 → Feb 12 (the 30-day reading would give Feb 10 — that is the tracked alternative, not the key). ' +
      'Offset: February 2026 precedes Mar 8 → EST −05.',
  },
  {
    itemId: 'R2-12',
    query: 'in 3 business days',
    anchor: { id: 'A4', iso: '2025-11-26T08:30:00-05:00' },
    conventions: ['BUSINESS-DAYS'],
    expected: [{ start: '2025-12-02T00:00:00-05:00', end: '2025-12-03T00:00:00-05:00' }],
    derivation:
      'From Wed Nov 26 2025: Thu Nov 27 is Thanksgiving (4th Thu of Nov — skip), Fri Nov 28 counts (1), ' +
      'Sat/Sun skip, Mon Dec 1 (2), Tue Dec 2 (3). Offset: December 2025 is after Nov 2 → EST −05.',
  },
  {
    itemId: 'N3-02',
    query: 'last week',
    anchor: { id: 'A1', iso: '2026-03-12T14:30:00-04:00' },
    conventions: ['MON-WEEKS'],
    expected: [{ start: '2026-03-02T00:00:00-05:00', end: '2026-03-09T00:00:00-04:00' }],
    derivation:
      'Thu Mar 12 sits in the week of Mon Mar 9; last week = Mon Mar 2 00:00 up to Mon Mar 9 00:00. ' +
      'DST springs forward Sun Mar 8 2026 → the start boundary is EST −05 but the end boundary is EDT −04. ' +
      'The week is 167 hours long — a good test that nothing assumes 24h days.',
  },
  {
    itemId: 'N3-20',
    query: 'Memorial Day',
    anchor: { id: 'A5', iso: '2026-06-09T11:00:00-04:00' },
    conventions: ['NEAREST-OCCURRENCE'],
    expected: [{ start: '2026-05-25T00:00:00-04:00', end: '2026-05-26T00:00:00-04:00' }],
    derivation:
      'Memorial Day = last Monday of May. May 25 2026 is 15 days back; May 31 2027 is ~356 days ahead → nearest is 2026-05-25. ' +
      'Offset: late May 2026 is inside Mar 8–Nov 1 → EDT −04.',
  },
  {
    itemId: 'C4-03',
    query: 'this quarter',
    anchor: { id: 'A3', iso: '2026-01-15T10:00:00-05:00' },
    conventions: ['org definition overrides the calendar-quarter default'],
    expected: [{ start: '2025-11-01T00:00:00-04:00', end: '2026-02-01T00:00:00-05:00' }],
    derivation:
      'The org prompt defines FY starting Feb 1 → quarters begin Feb/May/Aug/Nov. Jan 15 2026 falls in the ' +
      'Nov–Jan quarter → [Nov 1 2025, Feb 1 2026). Offsets: Nov 1 2025 is BEFORE the Nov 2 fall-back → EDT −04; ' +
      'Feb 1 2026 → EST −05. (A calendar-Q1 answer means the in-prompt definition was ignored.)',
  },
  {
    itemId: 'C4-04',
    query: 'the current sprint',
    anchor: { id: 'A5', iso: '2026-06-09T11:00:00-04:00' },
    conventions: ['org definition: 2-week sprints from Mon 2026-01-05'],
    expected: [{ start: '2026-06-08T00:00:00-04:00', end: '2026-06-22T00:00:00-04:00' }],
    derivation:
      'Sprint starts every 14 days from Jan 5: Jan 5, 19; Feb 2, 16; Mar 2, 16, 30; Apr 13, 27; May 11, 25; Jun 8. ' +
      'Jun 8 ≤ Jun 9 < Jun 22 → the current sprint is [Jun 8, Jun 22). Offset: June → EDT −04.',
  },
  {
    itemId: 'G5-01',
    query: 'March 1 through 4',
    anchor: { id: 'A1', iso: '2026-03-12T14:30:00-04:00' },
    conventions: ['INCLUSIVE-END', 'current-period reading (mid-March, "March 1–4" means this March)'],
    expected: [{ start: '2026-03-01T00:00:00-05:00', end: '2026-03-05T00:00:00-05:00' }],
    derivation:
      '"Through the 4th" includes all of Mar 4 → half-open end is Mar 5 00:00 (ending at Mar 4 00:00 is the classic ' +
      'off-by-one). Offsets: both boundaries precede Mar 8 → EST −05.',
  },
  {
    itemId: 'G5-17',
    query: 'anytime from June onward',
    anchor: { id: 'A5', iso: '2026-06-09T11:00:00-04:00' },
    conventions: ['WINDOW'],
    expected: [{ start: '2026-06-01T00:00:00-04:00', end: '2027-06-09T00:00:00-04:00' }],
    derivation:
      'Starts at this June 1. The end is genuinely open → clamp to anchor day + 12 months = 2027-06-09 00:00 ' +
      '(recorded as open; only the start is graded hard). Offsets: both Junes → EDT −04.',
  },
  {
    itemId: 'M6-05',
    query: 'traffic from 8–10am and 2–4pm yesterday',
    anchor: { id: 'A5', iso: '2026-06-09T11:00:00-04:00' },
    conventions: [],
    expected: [
      { start: '2026-06-08T08:00:00-04:00', end: '2026-06-08T10:00:00-04:00' },
      { start: '2026-06-08T14:00:00-04:00', end: '2026-06-08T16:00:00-04:00' },
    ],
    derivation:
      'Yesterday = Mon Jun 8. Two disjoint clock windows that must stay separate — merging into [08:00, 16:00) ' +
      'silently includes 10am–2pm. Offset: June → EDT −04.',
  },
  {
    itemId: 'M6-07',
    query: 'this week except Thanksgiving',
    anchor: { id: 'A4', iso: '2025-11-26T08:30:00-05:00' },
    conventions: ['MON-WEEKS'],
    expected: [
      { start: '2025-11-24T00:00:00-05:00', end: '2025-11-27T00:00:00-05:00' },
      { start: '2025-11-28T00:00:00-05:00', end: '2025-12-01T00:00:00-05:00' },
    ],
    derivation:
      'Wed Nov 26 2025 sits in the week Mon Nov 24 … Sun Nov 30. Thanksgiving = 4th Thu of Nov = Nov 27. ' +
      'Removing it splits the week into [Mon 24, Thu 27) and [Fri 28, Mon Dec 1) — two pieces, not one. ' +
      'Offset: late November 2025 is after the Nov 2 fall-back → EST −05 throughout.',
  },
  {
    itemId: 'R2-33',
    query: 'three months and ten days from today',
    anchor: { id: 'A4', iso: '2025-11-26T08:30:00-05:00' },
    conventions: ['PIN-DAY (calendar months), exact days'],
    expected: [{ start: '2026-03-08T00:00:00-05:00', end: '2026-03-09T00:00:00-04:00' }],
    derivation:
      'Nov 26 2025 + 3 calendar months = Feb 26 2026 (day pinned). + 10 exact days: Feb has 28 days in 2026, so ' +
      'Feb 26 + 10 = Mar 8 2026. Mar 8 2026 IS the spring-forward day: it starts in EST (−05) and the next midnight ' +
      'is EDT (−04) — the interval is 23 hours long.',
  },
  {
    itemId: 'R2-25',
    query: 'two weeks after the last business day of next month',
    anchor: { id: 'A1', iso: '2026-03-12T14:30:00-04:00' },
    conventions: ['BUSINESS-DAYS'],
    expected: [{ start: '2026-05-14T00:00:00-04:00', end: '2026-05-15T00:00:00-04:00' }],
    derivation:
      'Next month from March = April 2026. April 30 2026 is a Thursday (April 2026: Thursdays 2, 9, 16, 23, 30) and ' +
      'no federal holiday — so it is the last business day. + 14 days = May 14 2026. May → EDT −04.',
  },
];