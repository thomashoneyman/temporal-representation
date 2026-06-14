/**
 * Tiny IR constructors so the case files read like the answer-key tables.
 * Nothing here adds semantics — each helper builds the corresponding TimeExpr node.
 */
import type { Weekday } from '../../../scate-lite/calendar.js';
import type { Occurrence, PresetName, TimeExpr } from '../../../scate-lite/ir.js';
import type { Grain } from '../../../scate-lite/interval.js';

type DateFields = { year?: number; month?: number; day?: number; hour?: number; minute?: number; which?: Occurrence };

export const d = (f: DateFields): TimeExpr => ({ type: 'date', ...f });
export const preset = (name: PresetName): TimeExpr => ({ type: 'preset', name });
export const ref = (id: string): TimeExpr => ({ type: 'ref', id });
export const now: TimeExpr = { type: 'now' };

export const shift = (
  base: TimeExpr,
  by: string,
  direction: 'before' | 'after',
  businessDays?: boolean,
): TimeExpr => ({ type: 'shift', base, by, direction, ...(businessDays ? { businessDays } : {}) });

export const wd = (
  day: Weekday,
  which: 'this' | 'next' | 'last' | 'nearest',
  opts?: { of?: TimeExpr; hour?: number; minute?: number },
): TimeExpr => ({ type: 'weekday', day, which, ...opts });

export const nth = (n: number | 'last', unit: Grain | Weekday | 'business_day', of: TimeExpr): TimeExpr => ({
  type: 'nth',
  n,
  unit,
  of,
});

export const range = (from: TimeExpr | null, to: TimeExpr | null): TimeExpr => ({ type: 'range', from, to });

export const filter = (
  within: TimeExpr,
  opts: { weekdays?: Weekday[]; businessDays?: boolean; timeOfDay?: { start: string; end: string } },
): TimeExpr => ({ type: 'filter', within, ...opts });

export const union = (...of: TimeExpr[]): TimeExpr => ({ type: 'union', of });

export const WEEKDAYS: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri'];

/** Expand date-only day strings to whole-day [start, end) wall pairs. */
export function days(...ds: string[]): Array<[string, string]> {
  return ds.map((dd) => {
    const [y, m, day] = dd.split('-').map(Number);
    const next = new Date(Date.UTC(y, m - 1, day + 1));
    return [dd, next.toISOString().slice(0, 10)] as [string, string];
  });
}
