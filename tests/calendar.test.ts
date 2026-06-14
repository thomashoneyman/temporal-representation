import { DateTime } from 'luxon';
import { describe, expect, it } from 'vitest';
import {
  addBusinessDays,
  federalHolidays,
  isBusinessDay,
  lastWeekdayOfMonth,
  nthWeekdayOfMonth,
  quarterStart,
  startOfWeek,
} from '../src/scate-lite/calendar.js';

const Z = 'America/New_York';
const at = (iso: string) => DateTime.fromISO(iso, { zone: Z });

describe('federal holiday table — hand-verified 2026 dates', () => {
  it('matches all 11 dates for 2026', () => {
    expect([...federalHolidays(2026)].sort()).toEqual([
      '2026-01-01', // New Year's Day
      '2026-01-19', // MLK Day (3rd Mon Jan)
      '2026-02-16', // Presidents' Day (3rd Mon Feb)
      '2026-05-25', // Memorial Day (last Mon May)
      '2026-06-19', // Juneteenth
      '2026-07-04', // Independence Day (Sat — actual date, not observed)
      '2026-09-07', // Labor Day (1st Mon Sep)
      '2026-10-12', // Columbus Day (2nd Mon Oct)
      '2026-11-11', // Veterans Day
      '2026-11-26', // Thanksgiving (4th Thu Nov)
      '2026-12-25', // Christmas
    ]);
  });
  it('matches the answer-key provenance spot-checks for 2025', () => {
    const h25 = federalHolidays(2025);
    expect(h25.has('2025-11-27')).toBe(true); // Thanksgiving 2025
    expect(h25.has('2025-05-26')).toBe(true); // Memorial Day 2025
    expect(h25.has('2025-09-01')).toBe(true); // Labor Day 2025
  });
});

describe('business days', () => {
  it('R2-12: Wed Nov 26 2025 + 3 business days skips Thanksgiving → Tue Dec 2', () => {
    expect(addBusinessDays(at('2025-11-26T08:30:00'), 3).toISODate()).toBe('2025-12-02');
  });
  it('R2-13: Mon Sep 15 2025 − 5 business days → Mon Sep 8', () => {
    expect(addBusinessDays(at('2025-09-15T09:00:00'), -5).toISODate()).toBe('2025-09-08');
  });
  it('M6-08: Presidents Day Feb 16 2026 is not a business day', () => {
    expect(isBusinessDay(at('2026-02-16T12:00:00'))).toBe(false);
    expect(isBusinessDay(at('2026-02-17T12:00:00'))).toBe(true);
  });
});

describe('weeks', () => {
  it('A8 edge: Sunday belongs to the current Mon-start week (N3-04)', () => {
    expect(startOfWeek(at('2026-04-19T13:00:00')).toISODate()).toBe('2026-04-13');
  });
  it('A2 edge: a Monday anchor starts its own week (N3-03)', () => {
    expect(startOfWeek(at('2025-09-15T09:00:00')).toISODate()).toBe('2025-09-15');
  });
  it('Sunday-start alternative (the Sev-3 probe reading)', () => {
    expect(startOfWeek(at('2026-03-12T14:30:00'), 'sun').toISODate()).toBe('2026-03-08');
  });
});

describe('quarters', () => {
  it('calendar quarters by default (N3-06: Mar 12 → Q starts Jan 1)', () => {
    expect(quarterStart(at('2026-03-12T14:30:00')).toISODate()).toBe('2026-01-01');
  });
  it('C4-03 fiscal override: FY starts Feb → Jan 15 is in fiscal Q4 [Nov 1, Feb 1)', () => {
    expect(quarterStart(at('2026-01-15T10:00:00'), 2).toISODate()).toBe('2025-11-01');
  });
});

describe('nth / last weekday of month', () => {
  it('Thanksgiving rule: 4th Thu of Nov 2026 → Nov 26', () => {
    expect(nthWeekdayOfMonth(2026, 11, 4, 'thu', Z).toISODate()).toBe('2026-11-26');
  });
  it('Memorial rule: last Mon of May 2027 → May 31 (N3-20 key)', () => {
    expect(lastWeekdayOfMonth(2027, 5, 'mon', Z).toISODate()).toBe('2027-05-31');
  });
  it('throws on a 5th weekday that does not exist', () => {
    expect(() => nthWeekdayOfMonth(2026, 2, 5, 'mon', Z)).toThrow();
  });
});

describe('luxon month-arithmetic assumptions (convention C7, pin-day)', () => {
  it('clamps day-of-month overflow: Jan 31 + 1 month → Feb 28', () => {
    expect(at('2026-01-31T00:00:00').plus({ months: 1 }).toISODate()).toBe('2026-02-28');
  });
  it('pins day-of-month: Mar 12 − 1 month → Feb 12 (R2-06 key)', () => {
    expect(at('2026-03-12T14:30:00').minus({ months: 1 }).toISODate()).toBe('2026-02-12');
  });
});
