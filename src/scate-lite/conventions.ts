/**
 * Artifact #3 — the locked interpretation conventions (the C1–C14 numbering used
 * throughout this repo is DEFINED here, on each field below).
 *
 * One object that is BOTH the resolver's configuration AND renderable prompt text:
 * `renderConventions` produces the block Task 5 injects to test steerability, and the
 * block other teams can drop into their own agents to impose the same (or different)
 * defaults. Every field is a genuine fork where users/tools disagree; the defaults
 * were chosen provisionally for the v0.1 answer key, then confirmed or flipped by the
 * Phase-1 preference measurement (the LOCKED markers record the outcome).
 */
import { z } from 'zod';
import type { Weekday } from './calendar.js';
import { WeekdaySchema } from './ir.js';

export interface Conventions {
  /** C1: which day starts a week. */
  weekStart: 'mon' | 'sun';
  /** C2: what span "last week" denotes — the whole week, or just its workdays. */
  weekDefinition: 'mon-sun' | 'mon-fri';
  /** C4: which occurrence a bare date/holiday means ("March 4" said in June).
   *  A per-node `date.which` in the IR overrides this default.
   *  LOCKED 'nearest' at Task 3: every model measured (2 minis + 2 frontier) preferred
   *  the most-recent/current-year reading for near-past dates and holidays; 'nearest'
   *  captures that while still rolling forward when the next occurrence is closer. */
  datePolicy: 'next' | 'previous' | 'nearest';
  /** C5: does "March 1 through 4" include the 4th? `inclusive` = yes (end = day after). */
  rangeBounds: 'half-open' | 'inclusive';
  /** C7: is "a month ago" the same day-of-month last month, or exactly 30 days? */
  monthAgo: 'pin-day' | 'calendar-30';
  /** C10: month the fiscal year starts (1 = calendar quarters). */
  fiscalYearStartMonth: number;
  /** C3: which days count as the workweek (business days subtract holidays from these). */
  workweek: Weekday[];
  /** Is "the first week of March" days 1–7, or the first full week (per weekStart)?
   *  Genuinely ambiguous in the wild — kept steerable for business apps (G5-06 probe). */
  firstWeek: 'days-1-7' | 'first-full-week';
  /** C4a: does "next Friday" mean the nearest upcoming Friday, or next WEEK's Friday?
   *  LOCKED 'coming' at Task 3 (17/20 mini + 3/3 gpt-5.5 reps; Opus 4.8 dissents 3/3 —
   *  that disagreement is a Task-5 steering case, not a default). Prompt-text only:
   *  the resolver's weekday node always takes an explicit `which`. */
  nextWeekday: 'coming' | 'next-week';
}

export const ConventionsSchema = z.object({
  weekStart: z.enum(['mon', 'sun']),
  weekDefinition: z.enum(['mon-sun', 'mon-fri']),
  datePolicy: z.enum(['next', 'previous', 'nearest']),
  rangeBounds: z.enum(['half-open', 'inclusive']),
  monthAgo: z.enum(['pin-day', 'calendar-30']),
  fiscalYearStartMonth: z.number().int().min(1).max(12),
  workweek: z.array(WeekdaySchema),
  firstWeek: z.enum(['days-1-7', 'first-full-week']),
  nextWeekday: z.enum(['coming', 'next-week']),
});

/**
 * LOCKED at Task 3 (2026-06-11) from the Phase-1 measurement, key version v0.2.
 * Changes from the provisional v0.1 set: datePolicy next→nearest (all 4 models prefer
 * the recent reading); nextWeekday added as 'coming'. Confirmed by measurement: pin-day
 * month math (40/40 unanimous), days-1-7 first week, Monday weeks, include-today
 * to-date periods (matches Anthropic; OpenAI's to-instant stays a Sev-4 variant).
 * KNOWN GAP, kept deliberately: C9 "past month" = rolling [anchor−1mo, today) matches
 * NO model's dominant reading (Anthropic: calendar/N+1; OpenAI: to-instant) — it is a
 * documented product choice and a flagged crib/resolve-tool case, not a natural default.
 */
export const DEFAULT_CONVENTIONS: Conventions = {
  weekStart: 'mon',
  weekDefinition: 'mon-sun',
  datePolicy: 'nearest',
  rangeBounds: 'inclusive',
  monthAgo: 'pin-day',
  fiscalYearStartMonth: 1,
  workweek: ['mon', 'tue', 'wed', 'thu', 'fri'],
  firstWeek: 'days-1-7',
  nextWeekday: 'coming',
};

const WEEKDAY_LABEL: Record<Weekday, string> = {
  mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday',
  fri: 'Friday', sat: 'Saturday', sun: 'Sunday',
};

/** Render the conventions as a promptable block (Task 5 steering / external reuse). */
export function renderConventions(c: Conventions): string {
  const weekSpan = c.weekDefinition === 'mon-sun' ? 'Monday through Sunday' : 'Monday through Friday';
  const datePolicyText = {
    next: 'the NEXT occurrence on or after today',
    previous: 'the MOST RECENT occurrence on or before today',
    nearest: 'the NEAREST occurrence (past or future)',
  }[c.datePolicy];
  const monthAgoText =
    c.monthAgo === 'pin-day'
      ? '"a month ago" means the same day-of-month in the previous month (clamped if it does not exist); "30 days ago" means exactly 30 days'
      : '"a month ago" means exactly 30 days ago';
  const boundsText =
    c.rangeBounds === 'inclusive'
      ? 'Ranges stated with "through"/"to"/"–" INCLUDE the end day ("March 1 through 4" covers all of the 4th)'
      : 'Ranges stated with "through"/"to"/"–" EXCLUDE the end day';
  const fiscal =
    c.fiscalYearStartMonth === 1
      ? 'Quarters are calendar quarters (Q1 = Jan–Mar)'
      : `The fiscal year starts in month ${c.fiscalYearStartMonth}; quarters follow it`;
  return [
    'Time interpretation conventions (follow these exactly):',
    `- Weeks start on ${c.weekStart === 'mon' ? 'Monday' : 'Sunday'}. "Last week" means the previous whole ${weekSpan} week.`,
    `- A bare date or holiday with no year ("March 4", "Memorial Day") means ${datePolicyText}.`,
    `- ${boundsText}.`,
    `- ${monthAgoText}.`,
    `- ${fiscal}.`,
    `- "YTD"/"MTD"/"QTD" run from the period start through the END of today (today included).`,
    `- "The last N days" are the N completed days before today (today excluded).`,
    `- Business days are ${c.workweek.map((d) => WEEKDAY_LABEL[d]).join('/')} excluding US federal holidays.`,
    `- "The first week of <month>" means ${c.firstWeek === 'days-1-7' ? 'days 1–7 of the month' : 'the first full week of the month'}.`,
    `- "Next <weekday>" (e.g. "next Friday") means ${c.nextWeekday === 'coming' ? 'the nearest upcoming one' : "next week's one"}.`,
  ].join('\n');
}
