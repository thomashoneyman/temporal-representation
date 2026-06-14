/**
 * Decomposition scoring (Task 7b) — pure. Ground truth is the resolver's expansion of
 * a compound query into contiguous ranges; the scored signal is the SET of
 * `query_range(start, end)` calls the model actually made.
 */
import { equals, intervalsEqual, ms, setF1, type Interval, type SetScore } from '../scate-lite/interval.js';

export type DecompositionFailure =
  | 'collapsed-to-bounding-range'
  | 'missing-windows'
  | 'extra-windows'
  | 'wrong-day-or-time-window'
  | 'wrong-count';

export interface DecompositionScore extends SetScore {
  exact: boolean;
  callCount: number;
  expectedCount: number;
  failures: DecompositionFailure[];
}

/** Canonical decomposition: merge overlaps AND adjacency. "Weekdays this week" is ONE
 *  contiguous range — five separate day-calls and one Mon→Sat call cover identical
 *  instants, and either is correct tool behavior. Only windows separated by a real gap
 *  (the weekend, the 12–1 lunch hour) must stay separate calls. A true bounding-range
 *  collapse still fails: it covers EXTRA instants, which merging never introduces. */
export function mergeAdjacent(intervals: Interval[]): Interval[] {
  const sorted = [...intervals].sort((a, b) => ms(a.start) - ms(b.start));
  const out: Interval[] = [];
  for (const iv of sorted) {
    const prev = out[out.length - 1];
    if (prev && ms(iv.start) <= ms(prev.end)) {
      if (ms(iv.end) > ms(prev.end)) prev.end = iv.end;
    } else {
      out.push({ ...iv });
    }
  }
  return out;
}

export function scoreDecomposition(rawCalls: Interval[], rawExpected: Interval[]): DecompositionScore {
  const calls = mergeAdjacent(rawCalls);
  const expected = mergeAdjacent(rawExpected);
  const score = setF1(calls, expected);
  const exact = intervalsEqual(calls, expected);
  const failures: DecompositionFailure[] = [];

  if (!exact) {
    // One call spanning everything the key splits into pieces — the headline failure.
    if (calls.length === 1 && expected.length >= 2 && score.recall >= 0.999) {
      failures.push('collapsed-to-bounding-range');
    }
    if (calls.length < expected.length && calls.length > 1) failures.push('missing-windows');
    if (calls.length > expected.length) failures.push('extra-windows');
    if (calls.length !== expected.length) failures.push('wrong-count');
    // Right count but members misplaced → wrong day or clock window.
    if (calls.length === expected.length && score.exactMembers < expected.length) {
      failures.push('wrong-day-or-time-window');
    }
  }

  return { ...score, exact, callCount: calls.length, expectedCount: expected.length, failures };
}
