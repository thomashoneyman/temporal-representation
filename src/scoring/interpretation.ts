/**
 * Phase-1 interpretation classification (Task 2) — pure, UNGRADED. For probe items we
 * classify the model's resolved value against the item's labeled candidate readings
 * (pinned vs calendar-30, Mon- vs Sun-start, next vs current-year, …) and tally which
 * interpretation each model prefers. A value matching NO candidate is bucketed as
 * 'other' — a third reading is itself a finding, not an error; a high 'other' rate
 * flags a probe whose candidate set needs a new label before conventions are locked.
 */
import { DateTime } from 'luxon';
import type { CaseItem, Wall } from '../datasets/cases/lib/types.js';
import { intervalsEqual, ms, ZONE, type Interval, type Resolved } from '../scate-lite/interval.js';

const wallsToIntervals = (walls: Wall[]): Interval[] =>
  walls.map(([s, e]) => ({
    start: DateTime.fromISO(s, { zone: ZONE }).toISO({ suppressMilliseconds: true })!,
    end: DateTime.fromISO(e, { zone: ZONE }).toISO({ suppressMilliseconds: true })!,
  }));

/**
 * Which labeled reading did the model produce? 'other' = none of them.
 * Matching is exact-first, then CONTAINMENT: a finer-grain answer inside a candidate
 * interval counts as that reading (a model answering the minute-instant 14:30 on
 * Feb 12 has clearly chosen the "pinned Feb 12" reading — grain preference is a
 * separate measurement, not a different interpretation).
 */
export function classifyProbe(actual: Resolved, item: CaseItem): string {
  if (!item.probe) throw new Error(`${item.id} is not a probe item`);
  return classifyAgainst(
    actual,
    Object.fromEntries(Object.entries(item.probe.candidates).map(([l, walls]) => [l, wallsToIntervals(walls)])),
  );
}

/** Exact-first, unique-containment-second classification against labeled intervals. */
export function classifyAgainst(actual: Resolved, candidates: Record<string, Interval[]>): string {
  const entries = Object.entries(candidates);
  for (const [label, intervals] of entries) {
    if (intervalsEqual(actual.intervals, intervals)) return label;
  }
  if (actual.intervals.length > 0) {
    const within = entries.filter(([, cand]) =>
      actual.intervals.every((iv) =>
        cand.some((c) => ms(iv.start) >= ms(c.start) && ms(iv.end) <= ms(c.end)),
      ),
    );
    if (within.length === 1) return within[0][0];
  }
  return 'other';
}

export interface ProbeTally {
  itemId: string;
  axis: string;
  /** label → count across reps/models (caller groups by model). */
  counts: Record<string, number>;
}

export function tallyProbes(
  rows: Array<{ item: CaseItem; actual: Resolved }>,
): ProbeTally[] {
  const byItem = new Map<string, ProbeTally>();
  for (const { item, actual } of rows) {
    if (!item.probe) continue;
    const tally = byItem.get(item.id) ?? { itemId: item.id, axis: item.probe.axis, counts: {} };
    const label = classifyProbe(actual, item);
    tally.counts[label] = (tally.counts[label] ?? 0) + 1;
    byItem.set(item.id, tally);
  }
  return [...byItem.values()];
}

/** Compact human text for a resolved value ("Jun 1 2026 → Jun 8 2026"). */
export function describeIntervals(intervals: Interval[]): string {
  const one = (i: Interval): string => {
    const s = DateTime.fromISO(i.start, { setZone: true });
    const e = DateTime.fromISO(i.end, { setZone: true });
    const mins = e.diff(s, 'minutes').minutes;
    if (mins <= 1.01) return `the moment ${s.toFormat('MMM d yyyy HH:mm')}`;
    if (s.hour === 0 && s.minute === 0 && Math.abs(e.diff(s, 'days').days - 1) < 0.05) return `the day ${s.toFormat('MMM d yyyy')}`;
    const f = (d: DateTime) => (d.hour === 0 && d.minute === 0 ? d.toFormat('MMM d yyyy') : d.toFormat('MMM d yyyy HH:mm'));
    return `${f(s)} → ${f(e)}`;
  };
  const txt = intervals.slice(0, 3).map(one).join(', ');
  return intervals.length > 3 ? `${txt} (+${intervals.length - 3} more)` : txt;
}

/** Descriptive features of a resolved value, for the Phase-1 distribution report. */
export interface InterpretationFeatures {
  cardinality: Resolved['cardinality'];
  /** Weekday (mon=1…sun=7) the first interval starts on — week-start evidence. */
  startWeekday: number | null;
  /** Total covered hours — granularity evidence. */
  coveredHours: number | null;
  pieces: number;
}

export function interpretationFeatures(actual: Resolved): InterpretationFeatures {
  if (actual.intervals.length === 0) {
    return { cardinality: actual.cardinality, startWeekday: null, coveredHours: null, pieces: 0 };
  }
  const first = DateTime.fromISO(actual.intervals[0].start, { setZone: true });
  const covered = actual.intervals.reduce(
    (acc, iv) => acc + DateTime.fromISO(iv.end, { setZone: true }).diff(DateTime.fromISO(iv.start, { setZone: true }), 'hours').hours,
    0,
  );
  return {
    cardinality: actual.cardinality,
    startWeekday: first.weekday,
    coveredHours: covered,
    pieces: actual.intervals.length,
  };
}
