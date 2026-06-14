/**
 * Calendar math: week starts, fiscal quarters, US-federal holidays, business days.
 *
 * The holiday table is implemented as 15 lines of rule code rather than via the
 * `date-holidays` package: the answer key needs exactly the 11 federal holidays on
 * their ACTUAL dates (no observed-day shifting, no state/cultural extras), verbatim
 * testable (tests/calendar.test.ts pins known years). The table is resolver-internal —
 * org/observed calendars enter via ctx.customPresets instead.
 *
 * PURE: Luxon only, no Mastra, no system clock.
 */
import { DateTime } from 'luxon';

export type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

/** Luxon weekday numbers: Mon=1 … Sun=7. */
export const WEEKDAY_NUM: Record<Weekday, number> = {
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
  sun: 7,
};

/** Start of the week containing `dt` (convention C1 in conventions.ts: Monday unless steered). */
export function startOfWeek(dt: DateTime, weekStart: 'mon' | 'sun' = 'mon'): DateTime {
  const sod = dt.startOf('day');
  const target = weekStart === 'mon' ? 1 : 7;
  const back = (sod.weekday - target + 7) % 7;
  return sod.minus({ days: back });
}

/** First month of the (fiscal) quarter containing `month`. */
export function quarterStartMonth(month: number, fyStartMonth = 1): number {
  const offset = (((month - fyStartMonth) % 12) + 12) % 12;
  return ((fyStartMonth - 1 + 3 * Math.floor(offset / 3)) % 12) + 1;
}

/** Start of the (fiscal) quarter containing `dt`. Walks back across the year boundary
 *  when the quarter began in the previous calendar year (e.g. FY-Feb: Jan → Nov 1). */
export function quarterStart(dt: DateTime, fyStartMonth = 1): DateTime {
  const qm = quarterStartMonth(dt.month, fyStartMonth);
  const year = qm > dt.month ? dt.year - 1 : dt.year;
  return dt.set({ year, month: qm }).startOf('month');
}

/** nth <weekday> of a month, n ≥ 1. Returns start-of-day. */
export function nthWeekdayOfMonth(year: number, month: number, n: number, wd: Weekday, zone: string): DateTime {
  const first = DateTime.fromObject({ year, month, day: 1 }, { zone });
  const fwd = (WEEKDAY_NUM[wd] - first.weekday + 7) % 7;
  const dt = first.plus({ days: fwd + 7 * (n - 1) });
  if (dt.month !== month) throw new Error(`no ${n}th ${wd} in ${year}-${month}`);
  return dt;
}

/** last <weekday> of a month. Returns start-of-day. */
export function lastWeekdayOfMonth(year: number, month: number, wd: Weekday, zone: string): DateTime {
  const last = DateTime.fromObject({ year, month, day: 1 }, { zone }).endOf('month').startOf('day');
  const back = (last.weekday - WEEKDAY_NUM[wd] + 7) % 7;
  return last.minus({ days: back });
}

/** The 11 US federal holidays for `year`, as 'yyyy-MM-dd' strings (actual dates,
 *  never observed-shifted — convention C11). Only these gate business days. */
export function federalHolidays(year: number): Set<string> {
  const z = 'America/New_York';
  const d = (month: number, day: number) =>
    DateTime.fromObject({ year, month, day }, { zone: z });
  const dates = [
    d(1, 1), // New Year's Day
    nthWeekdayOfMonth(year, 1, 3, 'mon', z), // MLK Day
    nthWeekdayOfMonth(year, 2, 3, 'mon', z), // Presidents' Day
    lastWeekdayOfMonth(year, 5, 'mon', z), // Memorial Day
    d(6, 19), // Juneteenth
    d(7, 4), // Independence Day
    nthWeekdayOfMonth(year, 9, 1, 'mon', z), // Labor Day
    nthWeekdayOfMonth(year, 10, 2, 'mon', z), // Columbus Day
    d(11, 11), // Veterans Day
    nthWeekdayOfMonth(year, 11, 4, 'thu', z), // Thanksgiving
    d(12, 25), // Christmas
  ];
  return new Set(dates.map((dt) => dt.toISODate()!));
}

const holidayCache = new Map<number, Set<string>>();
function federalHolidaysCached(year: number): Set<string> {
  let set = holidayCache.get(year);
  if (!set) {
    set = federalHolidays(year);
    holidayCache.set(year, set);
  }
  return set;
}

export function isFederalHoliday(dt: DateTime): boolean {
  return federalHolidaysCached(dt.year).has(dt.toISODate()!);
}

/** Mon–Fri and not a federal holiday (convention C3). */
export function isBusinessDay(dt: DateTime): boolean {
  return dt.weekday >= 1 && dt.weekday <= 5 && !isFederalHoliday(dt);
}

/** Step `n` business days from `dt` (sign = direction), skipping weekends + federal
 *  holidays. Returns start-of-day of the landing day. */
export function addBusinessDays(dt: DateTime, n: number): DateTime {
  let cur = dt.startOf('day');
  const step = n >= 0 ? 1 : -1;
  let remaining = Math.abs(n);
  while (remaining > 0) {
    cur = cur.plus({ days: step });
    if (isBusinessDay(cur)) remaining--;
  }
  return cur;
}
