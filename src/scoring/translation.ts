/**
 * Translation scoring (Tasks 4/5/6) — pure functions, no framework imports.
 * Implements the grading rubric: the 0–6 error-severity ladder (documented in
 * src/scoring/README.md), per-cardinality methods (point / range / set / none /
 * ambiguous), clarification + no-time signals, and ambiguity calibration. Re-verified
 * against the worked examples pinned in tests/scoring.test.ts.
 *
 * Point rule (agreed at gate 2): a point is EXACT iff its start instant equals the
 * key's start at minute precision — grain is reported as a separate `grainMatch` flag,
 * never folded into exactness. Rationale: at round timestamps an ISO answer like
 * "16:00:00" cannot express whether it means the minute or the hour, and we only care
 * about grains down to the minute (always-zeroed seconds are fine).
 */
import { DateTime } from 'luxon';
import type { CaseItem, Wall } from '../datasets/cases/lib/types.js';
import {
  equals,
  grainDelta,
  inAcceptableSet,
  iou,
  ms,
  setF1,
  ZONE,
  type Grain,
  type Interval,
  type Resolved,
  type SetScore,
} from '../scate-lite/interval.js';
import type { TimeExpr } from '../scate-lite/ir.js';
import type { IsoValue } from '../scate-lite/iso.js';
import { resolveIR, resolveISO, type ResolveCtx } from '../scate-lite/resolver.js';

// ── envelope (what the model returns, both arms) ──
export type Envelope =
  | { kind: 'none'; reasoning: string }
  | { kind: 'time'; value: unknown; ambiguity: number; reasoning: string };

export type Severity = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface TranslationScore {
  /** Sev 0 — exact to convention (the headline accuracy number). */
  exact: boolean;
  /** ≤ Sev 4 — exact OR a documented alternative reading. */
  withinAcceptable: boolean;
  severity: Severity;
  tags: string[];
  /** Point/range distance diagnostics (when applicable). */
  deltaDays?: number;
  offByOne?: boolean;
  iou?: number;
  grainMatch?: boolean;
  /** Right TIME identified, grain aside: exact, or a grain-only miss (the actual and
   *  expected intervals nest). The H1/arithmetic measure; `exact` stays the strict
   *  production measure (a minute-wide query window still misses a day's data). */
  timeCorrect?: boolean;
  set?: SetScore;
  /** Task 6 signals. */
  clarifySignal: boolean;
  noTimeAnswer: boolean;
  /** 1 − |predicted − expected| / 4 (when the model rated ambiguity). */
  ambiguityCalibration?: number;
  /** The model's value failed to resolve/validate (counted Sev 6). */
  unresolvable?: boolean;
  resolved?: Resolved;
}

// ── helpers ──

export const wallsToIntervals = (walls: Wall[]): Interval[] =>
  walls.map(([s, e]) => ({
    start: DateTime.fromISO(s, { zone: ZONE }).toISO({ suppressMilliseconds: true })!,
    end: DateTime.fromISO(e, { zone: ZONE }).toISO({ suppressMilliseconds: true })!,
  }));

/** The item's key as a Resolved (from its wall-clock fixture intervals). */
export function expectedResolved(item: CaseItem): Resolved | null {
  if (!item.expected) return null;
  return {
    cardinality: item.cardinality,
    intervals: wallsToIntervals(item.expected),
    ...(item.open ? { open: true } : {}),
  };
}

const acceptableResolved = (item: CaseItem): Resolved[] =>
  (item.acceptable ?? []).map((walls) => ({
    cardinality: walls.length >= 2 ? 'set' : 'range',
    intervals: wallsToIntervals(walls),
  }));

/** Resolve what the model emitted, per arm. Throws are caught by the caller. */
export function resolveActual(arm: 'iso' | 'ir', value: unknown, ctx: ResolveCtx): Resolved {
  return arm === 'iso' ? resolveISO(value as IsoValue, ctx) : resolveIR(value as TimeExpr, ctx);
}

const startEq = (a: Resolved, b: Resolved): boolean =>
  a.intervals.length > 0 && b.intervals.length > 0 && ms(a.intervals[0].start) === ms(b.intervals[0].start);

const lenMs = (iv: Interval): number => ms(iv.end) - ms(iv.start);

/** Does the model "signal clarification"? ambiguity ≥ threshold, or abstention. */
export function signalsClarify(envelope: Envelope, threshold = 4): boolean {
  return envelope.kind === 'none' || envelope.ambiguity >= threshold;
}

// ── severity ──

function pointSeverity(
  actual: Resolved,
  expected: Resolved,
  grain: Grain,
  anchor: DateTime,
  acceptable: Resolved[],
  tags: string[],
): Severity {
  const a = actual.intervals[0];
  const e = expected.intervals[0];
  if (ms(a.start) === ms(e.start)) return 0;
  if (inAcceptableSet(actual, acceptable)) return 4;

  // Grain-too-coarse (Sev 3): "3pm" answered as the whole day — the actual interval
  // covers the expected start but is wider than one expected-grain unit.
  if (ms(a.start) <= ms(e.start) && ms(a.end) >= ms(e.end) && lenMs(a) > lenMs(e)) {
    tags.push('grain-too-coarse');
    return 3;
  }
  // Grain-too-fine (Sev 3): the right unit identified but answered at a finer grain —
  // "three days ago" as the minute [Jun 6 11:00, 11:01) inside the key's day. The
  // rubric's own definition (right anchor, wrong granularity) — previously this fell
  // through to Sev 6 "wrong-month", which mislabeled perfect arithmetic as wrong.
  if (ms(a.start) >= ms(e.start) && ms(a.end) <= ms(e.end) && lenMs(a) < lenMs(e)) {
    tags.push('grain-too-fine');
    return 3;
  }

  const d = Math.round(grainDelta(a, e, grain));
  if (Math.abs(d) === 1) return 1;
  if (Math.abs(d) <= 3) return 2;

  // Wrong operation (Sev 5): the reflection of the key across the anchor (added
  // instead of subtracted), caught at day precision.
  const aDay = DateTime.fromMillis(ms(a.start), { zone: ZONE }).startOf('day');
  const eDay = DateTime.fromMillis(ms(e.start), { zone: ZONE }).startOf('day');
  const anchorDay = anchor.startOf('day');
  const reflected = anchorDay.plus({ days: anchorDay.diff(eDay, 'days').days });
  if (aDay.toMillis() === reflected.toMillis()) {
    tags.push('wrong-direction');
    return 5;
  }

  const am = DateTime.fromMillis(ms(a.start), { zone: ZONE });
  const em = DateTime.fromMillis(ms(e.start), { zone: ZONE });
  tags.push(am.year !== em.year ? 'wrong-year' : 'wrong-month');
  return 6;
}

function rangeSeverity(
  actual: Resolved,
  expected: Resolved,
  grain: Grain,
  anchorDay: DateTime,
  acceptable: Resolved[],
  tags: string[],
): Severity {
  if (equals(actual, expected)) return 0;
  if (inAcceptableSet(actual, acceptable)) return 4;
  const a = actual.intervals[0];
  const e = expected.intervals[0];
  const startD = Math.round(grainDelta(a, e, grain));
  const endD = Math.round(grainDelta({ start: a.end, end: a.end }, { start: e.end, end: e.end }, grain));
  // One boundary exact, the other off by one unit. CAUSE matters (staff-engineer rule:
  // audit off-by-ones): when the key ends at the anchor's day-start (a rolling window
  // that excludes today) and the answer extends exactly one day further, the model
  // chose the include-today READING of an underspecified phrase — a convention
  // divergence (Sev 3, per the dataset's own note on rolling windows), not a fencepost.
  if ((startD === 0 && Math.abs(endD) === 1) || (endD === 0 && Math.abs(startD) === 1)) {
    const todayStart = anchorDay.toMillis();
    if (startD === 0 && ms(e.end) === todayStart && endD === 1) {
      tags.push('include-today-reading');
      return 3;
    }
    tags.push('fencepost');
    return 1;
  }
  const overlap = iou(actual, expected);
  // Same-length window shifted off the key (Sun-start week, rolling-7, include-today
  // ranges): a period-convention divergence, Sev 3.
  if (overlap > 0 && Math.abs(lenMs(a) - lenMs(e)) < 60_000) {
    tags.push('wrong-period');
    return 3;
  }
  if (overlap >= 0.5) {
    tags.push('wrong-period');
    if (lenMs(a) > lenMs(e)) tags.push('too-wide');
    if (lenMs(a) < lenMs(e)) tags.push('too-narrow');
    return 3;
  }
  if (overlap > 0) return 5;
  return 6;
}

function setSeverity(score: SetScore, exact: boolean, withinAcceptable: boolean, tags: string[]): Severity {
  if (exact) return 0;
  if (withinAcceptable) return 4;
  if (score.f1 >= 0.9) return 1;
  if (score.f1 >= 0.5) return 3;
  if (score.f1 > 0) return 5;
  return 6;
}

// ── the main entry point ──

export function scoreTranslation(envelope: Envelope, item: CaseItem, ctx: ResolveCtx, arm: 'iso' | 'ir'): TranslationScore {
  const anchor = DateTime.fromISO(ctx.anchor, { zone: ZONE });
  const clarifySignal = signalsClarify(envelope);
  const tags: string[] = [];

  // ── no-time handling ──
  if (envelope.kind === 'none') {
    if (item.isNoTime) return { exact: true, withinAcceptable: true, severity: 0, tags, clarifySignal, noTimeAnswer: true };
    // Abstaining on an ambiguous should-clarify item is a valid clarification path.
    if (item.slice === 'ambiguous' && item.shouldClarify) {
      return { exact: true, withinAcceptable: true, severity: 0, tags: ['clarified'], clarifySignal: true, noTimeAnswer: true };
    }
    tags.push('over-abstain');
    return { exact: false, withinAcceptable: false, severity: 6, tags, clarifySignal, noTimeAnswer: true };
  }

  const ambiguityCalibration = 1 - Math.abs(envelope.ambiguity - item.expectedAmbiguity) / 4;
  const base = { clarifySignal, noTimeAnswer: false, ambiguityCalibration };

  if (item.isNoTime) {
    tags.push('hallucinated-time');
    return { ...base, exact: false, withinAcceptable: false, severity: 6, tags };
  }

  let actual: Resolved;
  try {
    actual = resolveActual(arm, envelope.value, ctx);
  } catch {
    tags.push('unresolvable');
    return { ...base, exact: false, withinAcceptable: false, severity: 6, tags, unresolvable: true };
  }

  const acceptable = acceptableResolved(item);

  // ── ambiguous slice: acceptable-set membership is the primary metric ──
  if (item.slice === 'ambiguous') {
    const member = inAcceptableSet(actual, acceptable) || (acceptable.length > 0 && acceptable.some((acc) => startEq(actual, acc)));
    const inRegion =
      item.region !== undefined &&
      iou(actual.intervals, wallsToIntervals([item.region])) > 0 &&
      actual.intervals.every(
        (ivl) => ms(ivl.start) >= ms(wallsToIntervals([item.region!])[0].start) && ms(ivl.end) <= ms(wallsToIntervals([item.region!])[0].end),
      );
    const ok = member || inRegion;
    if (!ok) tags.push('outside-acceptable-region');
    if (item.shouldClarify && !clarifySignal) tags.push('resolved-when-should-clarify');
    if (!item.shouldClarify && clarifySignal) tags.push('clarified-when-safe');
    return { ...base, exact: ok, withinAcceptable: ok, severity: ok ? (member ? 0 : 4) : 6, tags, resolved: actual };
  }

  const expected = expectedResolved(item)!;
  const grain: Grain = item.granularity ?? 'day';

  // ── point: start-instant equality at minute precision; grain is a separate flag ──
  if (item.cardinality === 'point') {
    const exact = startEq(actual, expected);
    const grainMatch = actual.intervals.length === 1 && lenMs(actual.intervals[0]) === lenMs(expected.intervals[0]);
    const severity = exact ? 0 : pointSeverity(actual, expected, grain, anchor, acceptable, tags);
    const deltaDays = Math.round(grainDelta(actual.intervals[0], expected.intervals[0], 'day'));
    const d = Math.round(grainDelta(actual.intervals[0], expected.intervals[0], grain));
    const timeCorrect = exact || tags.includes('grain-too-fine') || tags.includes('grain-too-coarse');
    return {
      ...base, exact, withinAcceptable: severity <= 4, severity, tags,
      deltaDays, offByOne: Math.abs(d) === 1, grainMatch, timeCorrect, resolved: actual,
    };
  }

  // ── range (incl. open ranges: the clamp side is judged by the same equality the
  //    key encodes; documented alternates live in `acceptable`) ──
  if (item.cardinality === 'range') {
    const exact = equals(actual, expected);
    const severity = rangeSeverity(actual, expected, grain, anchor.startOf('day'), acceptable, tags);
    const overlap = iou(actual, expected);
    const deltaDays = actual.intervals.length
      ? Math.round(grainDelta(actual.intervals[0], expected.intervals[0], 'day'))
      : undefined;
    return { ...base, exact, withinAcceptable: severity <= 4, severity, tags, iou: overlap, deltaDays, offByOne: severity === 1, timeCorrect: exact, resolved: actual };
  }

  // ── set ──
  // Exactness = equal COVERED TIME, not equal partition: a filter answering six single
  // days covers exactly the same time as the key's two merged ranges — the same answer
  // for translation. Partition granularity is scored where it matters (Task 7b counts
  // the actual tool calls); here it survives only as the wrong-count tag.
  const score = setF1(actual.intervals, expected.intervals);
  const exact = equals(actual, expected) || iou(actual, expected) > 0.9999;
  const withinAcceptable = exact || inAcceptableSet(actual, acceptable);
  if (!exact && actual.intervals.length === 1 && expected.intervals.length >= 2 && score.recall >= 0.999) {
    tags.push('collapsed-to-bounding-range');
  }
  if (score.countDelta < 0 && actual.intervals.length > 1) tags.push('missing-windows');
  if (score.countDelta > 0) tags.push('extra-windows');
  if (score.countDelta !== 0) tags.push('wrong-count');
  const severity = setSeverity(score, exact, withinAcceptable, tags);
  return { ...base, exact, withinAcceptable: severity <= 4, severity, tags, set: score, iou: iou(actual, expected), resolved: actual };
}

// ── Task 6 aggregates (precision / recall over a run) ──

export interface PRF { precision: number; recall: number; f1: number }

export function prf(tp: number, fp: number, fn: number): PRF {
  const precision = tp + fp === 0 ? 1 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 1 : tp / (tp + fn);
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  return { precision, recall, f1 };
}

/** Clarification P/R: positives are shouldClarify items (clarifyOptional excluded).
 *  No-time items are excluded entirely: `signalsClarify` treats an abstention as a
 *  signal, so a correct “no time here” on them would count as a false positive and
 *  deflate precision — abstaining there is scored by noTimePRF, not here. */
export function clarificationPRF(rows: Array<{ item: CaseItem; signaled: boolean }>): PRF {
  let tp = 0, fp = 0, fn = 0;
  for (const { item, signaled } of rows) {
    if (item.clarifyOptional || item.isNoTime) continue;
    if (item.shouldClarify) signaled ? tp++ : fn++;
    else if (signaled) fp++;
  }
  return prf(tp, fp, fn);
}

/** No-time P/R: positives are isNoTime items; any temporal item answered none is a FP. */
export function noTimePRF(rows: Array<{ item: CaseItem; answeredNone: boolean }>): PRF {
  let tp = 0, fp = 0, fn = 0;
  for (const { item, answeredNone } of rows) {
    if (item.isNoTime) answeredNone ? tp++ : fn++;
    else if (answeredNone && !(item.slice === 'ambiguous' && item.shouldClarify)) fp++;
  }
  return prf(tp, fp, fn);
}
