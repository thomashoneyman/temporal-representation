/**
 * Half-open interval primitives + comparison metrics.
 *
 * Everything in the experiment resolves to `Resolved`: a cardinality plus a list of
 * half-open `[start, end)` ISO-8601 intervals carrying the America/New_York offset.
 * All comparisons here are instant-based (milliseconds), never string-based, so
 * formatting and DST-induced 23/25-hour days can't cause false failures
 * (a deliberate scope cut: sub-minute grains are out of scope for business queries).
 *
 * PURE: no Mastra imports, no system clock.
 */
import { DateTime } from 'luxon';

export const ZONE = 'America/New_York';

export interface Interval {
  start: string; // ISO 8601 with offset, inclusive
  end: string; // ISO 8601 with offset, exclusive
}

export type Cardinality = 'point' | 'range' | 'set' | 'none';

export interface Resolved {
  cardinality: Cardinality;
  intervals: Interval[]; // [] none · [one] point/range · [many] set
  open?: boolean; // true for to-date / open-ended ranges (clamp recorded)
}

export type Grain = 'minute' | 'hour' | 'day' | 'week' | 'month' | 'quarter' | 'year';

export const ms = (iso: string): number => {
  const dt = DateTime.fromISO(iso, { setZone: true });
  if (!dt.isValid) throw new Error(`invalid ISO datetime: ${iso}`);
  return dt.toMillis();
};

/** Sort by start and merge genuine overlaps only — never mere adjacency, so
 *  discrete set members (e.g. consecutive weekend days) stay distinct
 *  stay distinct. */
export function normalizeIntervals(intervals: Interval[]): Interval[] {
  const sorted = [...intervals].sort((a, b) => ms(a.start) - ms(b.start));
  const out: Interval[] = [];
  for (const iv of sorted) {
    const prev = out[out.length - 1];
    if (prev && ms(iv.start) < ms(prev.end)) {
      if (ms(iv.end) > ms(prev.end)) prev.end = iv.end;
    } else {
      out.push({ ...iv });
    }
  }
  return out;
}

/** Merge overlaps AND adjacency — used only for measure-theoretic math (IoU). */
function covered(intervals: Interval[]): Array<[number, number]> {
  const sorted = intervals
    .map((iv): [number, number] => [ms(iv.start), ms(iv.end)])
    .sort((a, b) => a[0] - b[0]);
  const out: Array<[number, number]> = [];
  for (const [s, e] of sorted) {
    const prev = out[out.length - 1];
    if (prev && s <= prev[1]) prev[1] = Math.max(prev[1], e);
    else out.push([s, e]);
  }
  return out;
}

const totalMs = (cov: Array<[number, number]>): number =>
  cov.reduce((acc, [s, e]) => acc + (e - s), 0);

function intersectionMs(a: Array<[number, number]>, b: Array<[number, number]>): number {
  let i = 0;
  let j = 0;
  let acc = 0;
  while (i < a.length && j < b.length) {
    const lo = Math.max(a[i][0], b[j][0]);
    const hi = Math.min(a[i][1], b[j][1]);
    if (hi > lo) acc += hi - lo;
    if (a[i][1] < b[j][1]) i++;
    else j++;
  }
  return acc;
}

/** Order-independent set equality of intervals, within a per-boundary tolerance. */
export function intervalsEqual(a: Interval[], b: Interval[], toleranceMs = 0): boolean {
  const na = normalizeIntervals(a);
  const nb = normalizeIntervals(b);
  if (na.length !== nb.length) return false;
  return na.every(
    (iv, k) =>
      Math.abs(ms(iv.start) - ms(nb[k].start)) <= toleranceMs &&
      Math.abs(ms(iv.end) - ms(nb[k].end)) <= toleranceMs,
  );
}

/** Primary exact-match check: same covered intervals (and both-empty counts as equal). */
export function equals(a: Resolved, b: Resolved, toleranceMs = 0): boolean {
  return intervalsEqual(a.intervals, b.intervals, toleranceMs);
}

/** Intersection-over-union of covered time. Both empty → 1 (a correct "none"). */
export function iou(a: Resolved | Interval[], b: Resolved | Interval[]): number {
  const ia = Array.isArray(a) ? a : a.intervals;
  const ib = Array.isArray(b) ? b : b.intervals;
  const ca = covered(ia);
  const cb = covered(ib);
  const inter = intersectionMs(ca, cb);
  const union = totalMs(ca) + totalMs(cb) - inter;
  if (union === 0) return ia.length === 0 && ib.length === 0 ? 1 : 0;
  return inter / union;
}

/** Signed calendar-day delta between two interval starts (NY zone), actual − expected. */
export function pointDeltaDays(actual: Interval, expected: Interval): number {
  const a = DateTime.fromMillis(ms(actual.start), { zone: ZONE }).startOf('day');
  const e = DateTime.fromMillis(ms(expected.start), { zone: ZONE }).startOf('day');
  return Math.round(a.diff(e, 'days').days);
}

/** Signed delta between starts in `grain` units (calendar-aware via NY zone). */
export function grainDelta(actual: Interval, expected: Interval, grain: Grain): number {
  const a = DateTime.fromMillis(ms(actual.start), { zone: ZONE });
  const e = DateTime.fromMillis(ms(expected.start), { zone: ZONE });
  const unit = grain === 'quarter' ? 'months' : `${grain}s`;
  const d = a.diff(e, unit as 'days').get(unit as 'days');
  return grain === 'quarter' ? d / 3 : d;
}

/** The DESIGN headline failure signal: wrong by exactly one grain unit (Sev 1). */
export function offByOne(actual: Interval, expected: Interval, grain: Grain): boolean {
  const d = grainDelta(actual, expected, grain);
  return Math.abs(Math.round(d)) === 1 && Math.abs(d - Math.round(d)) < 0.05;
}

export interface SetScore {
  precision: number;
  recall: number;
  f1: number;
  countDelta: number; // actual member count − expected member count
  exactMembers: number; // members matching an expected member exactly
}

/**
 * Set comparison (Task 7b / slice 6): time-coverage precision/recall/F1.
 * precision = |A∩B| / |A|, recall = |A∩B| / |B| over covered time — this reproduces
 * the worked example pinned in tests/interval.test.ts (collapsed bounding range for 2 day-points →
 * P=0.4, R=1.0, F1≈0.57) and handles clock-window sets without a grain parameter.
 * `countDelta`/`exactMembers` feed the wrong-count / missing-window failure tags.
 */
export function setF1(actual: Interval[], expected: Interval[]): SetScore {
  const ca = covered(actual);
  const cb = covered(expected);
  const inter = intersectionMs(ca, cb);
  const lenA = totalMs(ca);
  const lenB = totalMs(cb);
  const precision = lenA === 0 ? (lenB === 0 ? 1 : 0) : inter / lenA;
  const recall = lenB === 0 ? (lenA === 0 ? 1 : 0) : inter / lenB;
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  const na = normalizeIntervals(actual);
  const nb = normalizeIntervals(expected);
  const exactMembers = na.filter((iv) =>
    nb.some((ev) => ms(ev.start) === ms(iv.start) && ms(ev.end) === ms(iv.end)),
  ).length;
  return { precision, recall, f1, countDelta: na.length - nb.length, exactMembers };
}

/** Ambiguous-slice membership: does `actual` exactly match any acceptable resolution? */
export function inAcceptableSet(actual: Resolved, accepted: Resolved[], toleranceMs = 0): boolean {
  return accepted.some((acc) => equals(actual, acc, toleranceMs));
}
