/**
 * The PREFERENCE GRID — a Phase-1-only measurement instrument, separate from the
 * 116-item evaluation dataset (whose key stays frozen).
 *
 * Question it answers: for the named time windows businesses actually say, which
 * concrete reading does a model choose — and does the choice move with WHERE the
 * anchor sits (start/middle/end of week, month, quarter, year)?
 *
 * Design: ~14 phrases × 7 anchor positions. ISO arm ONLY (the IR arm defers presets to
 * our resolver, so it cannot reveal the model's own reading). Ungraded: every phrase
 * carries CODE-GENERATED candidate readings (each one a defensible interpretation),
 * and answers are classified exact-first / containment-second, with 'other' kept for
 * inspection — an 'other' cluster is a reading we failed to anticipate, not an error.
 */
import { DateTime } from 'luxon';
import { startOfWeek, isBusinessDay } from '../scate-lite/calendar.js';
import { ZONE, type Interval } from '../scate-lite/interval.js';

const Z = ZONE;
const fmt = (dt: DateTime): string => dt.toISO({ suppressMilliseconds: true })!;
const iv = (s: DateTime, e: DateTime): Interval[] => [{ start: fmt(s), end: fmt(e) }];

/** Anchor positions: same wall-clock structure, different period geometry. */
export const POSITIONS = {
  weekMonday: { iso: '2026-06-08T09:00:00-04:00', why: 'Monday morning — week just started' },
  weekWednesday: { iso: '2026-06-10T14:00:00-04:00', why: 'midweek, mid-month' },
  weekSunday: { iso: '2026-06-14T13:00:00-04:00', why: 'Sunday — last day of a Mon-start week' },
  monthFirst: { iso: '2026-07-01T10:00:00-04:00', why: 'first day of a month (Wed)' },
  monthLast: { iso: '2026-04-30T15:00:00-04:00', why: 'last day of a month (Thu)' },
  quarterEnd: { iso: '2026-06-30T11:00:00-04:00', why: 'last day of Q2 (Tue)' },
  yearStart: { iso: '2026-01-02T10:00:00-05:00', why: 'second day of the year (Fri)' },
} as const;
export type PositionId = keyof typeof POSITIONS;

type Candidates = Record<string, Interval[]>;
type Gen = (a: DateTime) => Candidates;

// ── shared building blocks ──
const day0 = (a: DateTime) => a.startOf('day');
const monWeek = (a: DateTime, k = 0) => startOfWeek(a, 'mon').plus({ weeks: k });
const sunWeek = (a: DateTime, k = 0) => startOfWeek(a, 'sun').plus({ weeks: k });
const month0 = (a: DateTime, k = 0) => a.startOf('month').plus({ months: k });
const quarter0 = (a: DateTime, k = 0) => a.startOf('quarter').plus({ months: 3 * k });
const year0 = (a: DateTime, k = 0) => a.startOf('year').plus({ years: k });

const satSunOf = (weekStart: DateTime): Interval[] => iv(weekStart.plus({ days: 5 }), weekStart.plus({ days: 7 }));

/** The phrases under test, each with its labeled candidate readings. */
export const PHRASES: Record<string, Gen> = {
  'last week': (a) => ({
    priorMonWeek: iv(monWeek(a, -1), monWeek(a)),
    priorSunWeek: iv(sunWeek(a, -1), sunWeek(a)),
    rolling7ExclToday: iv(day0(a).minus({ days: 7 }), day0(a)),
    rolling7ToNow: iv(a.minus({ days: 7 }), a),
  }),
  'this week': (a) => ({
    monWeek: iv(monWeek(a), monWeek(a, 1)),
    sunWeek: iv(sunWeek(a), sunWeek(a, 1)),
    weekToDate: iv(monWeek(a), day0(a).plus({ days: 1 })),
    next7: iv(day0(a), day0(a).plus({ days: 7 })),
  }),
  'the past week': (a) => ({
    rolling7ExclToday: iv(day0(a).minus({ days: 7 }), day0(a)),
    rolling7InclToday: iv(day0(a).minus({ days: 6 }), day0(a).plus({ days: 1 })),
    // count back 7 AND include today — an 8-day window (the fencepost-as-interpretation)
    countBack7InclToday: iv(day0(a).minus({ days: 7 }), day0(a).plus({ days: 1 })),
    rolling7ToNow: iv(a.minus({ days: 7 }), a),
    priorMonWeek: iv(monWeek(a, -1), monWeek(a)),
  }),
  'last month': (a) => ({
    priorCalendarMonth: iv(month0(a, -1), month0(a)),
    rolling30ExclToday: iv(day0(a).minus({ days: 30 }), day0(a)),
    rollingCalMonthBack: iv(day0(a).minus({ months: 1 }), day0(a)),
  }),
  'this month': (a) => ({
    calendarMonth: iv(month0(a), month0(a, 1)),
    monthToDate: iv(month0(a), day0(a).plus({ days: 1 })),
    monthToDateExcl: iv(month0(a), day0(a)),
  }),
  'the past month': (a) => ({
    rollingCalMonthBack: iv(day0(a).minus({ months: 1 }), day0(a)),
    rolling30ExclToday: iv(day0(a).minus({ days: 30 }), day0(a)),
    priorCalendarMonth: iv(month0(a, -1), month0(a)),
    monthToDate: iv(month0(a), day0(a).plus({ days: 1 })),
    rollingInclToday: iv(day0(a).minus({ months: 1 }), day0(a).plus({ days: 1 })),
    rollingToNow: iv(a.minus({ months: 1 }), a),
  }),
  'the last 30 days': (a) => ({
    exclToday: iv(day0(a).minus({ days: 30 }), day0(a)),
    inclToday: iv(day0(a).minus({ days: 29 }), day0(a).plus({ days: 1 })),
    // count back 30 AND include today — a 31-day window (the fencepost-as-interpretation)
    countBack30InclToday: iv(day0(a).minus({ days: 30 }), day0(a).plus({ days: 1 })),
    toNow: iv(a.minus({ days: 30 }), a),
  }),
  'last quarter': (a) => ({
    priorCalendarQuarter: iv(quarter0(a, -1), quarter0(a)),
    rolling90: iv(day0(a).minus({ days: 90 }), day0(a)),
    rolling3Months: iv(day0(a).minus({ months: 3 }), day0(a)),
  }),
  'this quarter': (a) => ({
    calendarQuarter: iv(quarter0(a), quarter0(a, 1)),
    quarterToDate: iv(quarter0(a), day0(a).plus({ days: 1 })),
    quarterToDateExcl: iv(quarter0(a), day0(a)),
  }),
  'year to date': (a) => ({
    inclToday: iv(year0(a), day0(a).plus({ days: 1 })),
    exclToday: iv(year0(a), day0(a)),
    toInstant: iv(year0(a), a),
  }),
  'this year': (a) => ({
    calendarYear: iv(year0(a), year0(a, 1)),
    yearToDate: iv(year0(a), day0(a).plus({ days: 1 })),
  }),
  'last year': (a) => ({
    priorCalendarYear: iv(year0(a, -1), year0(a)),
    rolling12Months: iv(day0(a).minus({ months: 12 }), day0(a)),
    rolling365: iv(day0(a).minus({ days: 365 }), day0(a)),
  }),
  'this weekend': (a) => ({
    thisWeekSatSun: satSunOf(monWeek(a)),
    nextWeekSatSun: satSunOf(monWeek(a, 1)),
  }),
  'last weekend': (a) => ({
    priorWeekSatSun: satSunOf(monWeek(a, -1)),
    thisWeekSatSun: satSunOf(monWeek(a)),
  }),
  'the end of the month': (a) => {
    let lastBiz = a.endOf('month').startOf('day');
    while (!isBusinessDay(lastBiz)) lastBiz = lastBiz.minus({ days: 1 });
    const monthEnd = month0(a, 1);
    return {
      lastDay: iv(monthEnd.minus({ days: 1 }), monthEnd),
      lastBusinessDay: iv(lastBiz, lastBiz.plus({ days: 1 })),
      finalWeek: iv(monthEnd.minus({ days: 7 }), monthEnd),
    };
  },

  // ── expansion wave 2: where choices should genuinely vary ──
  'a week ago': (a) => ({
    instantMinus7: iv(a.startOf('minute').minus({ days: 7 }), a.startOf('minute').minus({ days: 7 }).plus({ minutes: 1 })),
    dayMinus7: iv(day0(a).minus({ days: 7 }), day0(a).minus({ days: 6 })),
    priorMonWeek: iv(monWeek(a, -1), monWeek(a)),
    rolling7ExclToday: iv(day0(a).minus({ days: 7 }), day0(a)),
  }),
  'two weeks ago': (a) => ({
    instantMinus14: iv(a.startOf('minute').minus({ days: 14 }), a.startOf('minute').minus({ days: 14 }).plus({ minutes: 1 })),
    dayMinus14: iv(day0(a).minus({ days: 14 }), day0(a).minus({ days: 13 })),
    weekBeforeLast: iv(monWeek(a, -2), monWeek(a, -1)),
    rolling7EndingMinus7: iv(day0(a).minus({ days: 14 }), day0(a).minus({ days: 7 })),
  }),
  'the last few days': (a) => ({
    rolling2: iv(day0(a).minus({ days: 2 }), day0(a)),
    rolling3: iv(day0(a).minus({ days: 3 }), day0(a)),
    rolling3InclToday: iv(day0(a).minus({ days: 3 }), day0(a).plus({ days: 1 })),
    rolling5: iv(day0(a).minus({ days: 5 }), day0(a)),
    rolling7: iv(day0(a).minus({ days: 7 }), day0(a)),
  }),
  'the last 90 days': (a) => ({
    exclToday: iv(day0(a).minus({ days: 90 }), day0(a)),
    inclToday: iv(day0(a).minus({ days: 89 }), day0(a).plus({ days: 1 })),
    countBack90InclToday: iv(day0(a).minus({ days: 90 }), day0(a).plus({ days: 1 })),
    toNow: iv(a.minus({ days: 90 }), a),
  }),
  'the past 24 hours': (a) => ({
    toNow: iv(a.minus({ hours: 24 }), a),
    sinceYesterdayMidnight: iv(day0(a).minus({ days: 1 }), a),
    yesterday: iv(day0(a).minus({ days: 1 }), day0(a)),
    today: iv(day0(a), day0(a).plus({ days: 1 })),
  }),
  'month to date': (a) => ({
    inclToday: iv(month0(a), day0(a).plus({ days: 1 })),
    exclToday: iv(month0(a), day0(a)),
    toInstant: iv(month0(a), a),
  }),
  'quarter to date': (a) => ({
    inclToday: iv(quarter0(a), day0(a).plus({ days: 1 })),
    exclToday: iv(quarter0(a), day0(a)),
    toInstant: iv(quarter0(a), a),
  }),
  'so far this week': (a) => ({
    monWeekInclToday: iv(monWeek(a), day0(a).plus({ days: 1 })),
    monWeekExclToday: iv(monWeek(a), day0(a)),
    monWeekToInstant: iv(monWeek(a), a),
    sunWeekInclToday: iv(sunWeek(a), day0(a).plus({ days: 1 })),
  }),
  'next week': (a) => ({
    nextMonWeek: iv(monWeek(a, 1), monWeek(a, 2)),
    nextSunWeek: iv(sunWeek(a, 1), sunWeek(a, 2)),
    rolling7Forward: iv(day0(a).plus({ days: 1 }), day0(a).plus({ days: 8 })),
  }),
  'next month': (a) => ({
    nextCalendarMonth: iv(month0(a, 1), month0(a, 2)),
    rollingMonthFromTomorrow: iv(day0(a).plus({ days: 1 }), day0(a).plus({ days: 1 }).plus({ months: 1 })),
    rolling30Forward: iv(day0(a).plus({ days: 1 }), day0(a).plus({ days: 31 })),
  }),
  'the trailing twelve months': (a) => ({
    rolling12MonthsInclToday: iv(day0(a).minus({ months: 12 }).plus({ days: 1 }), day0(a).plus({ days: 1 })),
    countBack12MonthsInclToday: iv(day0(a).minus({ months: 12 }), day0(a).plus({ days: 1 })),
    rolling12Months: iv(day0(a).minus({ months: 12 }), day0(a)),
    last12CompleteMonths: iv(month0(a).minus({ months: 12 }), month0(a)),
    rolling365: iv(day0(a).minus({ days: 365 }), day0(a)),
    toNow: iv(a.minus({ months: 12 }), a),
  }),
  'the beginning of the month': (a) => ({
    thisMonthFirstDay: iv(month0(a), month0(a).plus({ days: 1 })),
    thisMonthFirstWeek: iv(month0(a), month0(a).plus({ days: 7 })),
    nextMonthFirstDay: iv(month0(a, 1), month0(a, 1).plus({ days: 1 })),
    nextMonthFirstWeek: iv(month0(a, 1), month0(a, 1).plus({ days: 7 })),
  }),
  'by the end of the week': (a) => ({
    nowToSunday: iv(day0(a), monWeek(a, 1)),
    instantToSunday: iv(a.startOf('minute'), monWeek(a, 1)),
    nowToFriday: iv(day0(a), monWeek(a).plus({ days: 5 })),
    fridayPoint: iv(monWeek(a).plus({ days: 4 }), monWeek(a).plus({ days: 5 })),
    sundayPoint: iv(monWeek(a).plus({ days: 6 }), monWeek(a, 1)),
    sundayEodPoint: iv(monWeek(a, 1).minus({ minutes: 1 }), monWeek(a, 1)),
  }),
  'early next week': (a) => ({
    nextMonTue: iv(monWeek(a, 1), monWeek(a, 1).plus({ days: 2 })),
    nextMonWed: iv(monWeek(a, 1), monWeek(a, 1).plus({ days: 3 })),
    nextMondayPoint: iv(monWeek(a, 1), monWeek(a, 1).plus({ days: 1 })),
  }),
};

export interface GridItem {
  id: string; // `${phraseKey}@${position}`
  query: string;
  position: PositionId;
  anchor: string; // ISO with offset
  candidates: Candidates;
}

/** Some (phrase, position) pairs are DEGENERATE: two readings produce the identical
 *  interval (at a Sunday anchor, the prior Sun-start week IS the rolling-7 window).
 *  Merge those labels ('a=b') so classification never silently credits one of them —
 *  a degenerate cell can't distinguish the readings, and the label says so. */
function dedupe(candidates: Candidates): Candidates {
  const byKey = new Map<string, string[]>();
  for (const [label, intervals] of Object.entries(candidates)) {
    const key = JSON.stringify(intervals);
    byKey.set(key, [...(byKey.get(key) ?? []), label]);
  }
  return Object.fromEntries([...byKey.entries()].map(([key, labels]) => [labels.join('='), JSON.parse(key) as Interval[]]));
}

export function buildGrid(): GridItem[] {
  const items: GridItem[] = [];
  for (const [query, gen] of Object.entries(PHRASES)) {
    for (const [position, { iso }] of Object.entries(POSITIONS) as Array<[PositionId, { iso: string }]>) {
      const a = DateTime.fromISO(iso, { zone: Z });
      items.push({
        id: `${query.replace(/\s+/g, '-')}@${position}`,
        query,
        position,
        anchor: iso,
        candidates: dedupe(gen(a)),
      });
    }
  }
  return items;
}
