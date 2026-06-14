/**
 * Threading scoring (Task 7) — pure. From a tool-call trajectory we read the TIME
 * ARGUMENT at each hop and score it against the resolver-computed key for that hop.
 * Output: per-hop correctness (the drift curve groups these by chain depth) plus an
 * error taxonomy that separates WHY a hop went wrong:
 *   - 'arithmetic'     — bound the right milestone, computed the wrong offset
 *   - 'anchor-binding' — bound the WRONG milestone (the non-adjacent-reference trap);
 *                        detected because the value matches what you'd get from a
 *                        different milestone (a labeled distractor)
 *   - 'wrong-operation'— neither: wrong direction/unit/shape entirely
 *
 * The `chains` dataset (hops + distractors) is authored at build step 10; these
 * functions are dataset-shape agnostic and unit-tested on synthetic hops.
 */
import { intervalsEqual, ms, type Interval } from '../scate-lite/interval.js';

export interface HopKey {
  /** The correct time argument for this hop. */
  expected: Interval[];
  /** Defensible alternative readings — matching one is within-acceptable, not a miss. */
  acceptable?: Interval[][];
  /** Values produced by binding the WRONG milestone, labeled by milestone id. */
  distractors?: Record<string, Interval[]>;
  /** Days-off magnitude under which a miss counts as 'arithmetic' (default 7). */
  arithmeticToleranceDays?: number;
}

export type HopErrorClass = 'arithmetic' | 'anchor-binding' | 'zone-offset' | 'cascade' | 'fencepost' | 'acceptable-alternative' | 'wrong-operation';

export interface HopScore {
  correct: boolean;
  errorClass?: HopErrorClass;
  /** Which distractor milestone matched, when errorClass = 'anchor-binding'. */
  boundTo?: string;
  deltaDays?: number;
}

const DAY_MS = 86_400_000;

export function scoreHop(actual: Interval[], key: HopKey): HopScore {
  if (intervalsEqual(actual, key.expected)) return { correct: true };
  for (const alt of key.acceptable ?? []) {
    if (intervalsEqual(actual, alt)) return { correct: false, errorClass: 'acceptable-alternative' };
  }

  // Zone-offset: identical wall-clock boundaries, wrong UTC offset (e.g. the anchor's
  // summer offset copied onto a winter date). Production-real — the window is shifted
  // by an hour — but a distinct failure class from picking the wrong window, and one
  // the resolver-owned arms cannot produce.
  const wallEq =
    actual.length === key.expected.length &&
    actual.every((iv, i) => iv.start.slice(0, 19) === key.expected[i].start.slice(0, 19) && iv.end.slice(0, 19) === key.expected[i].end.slice(0, 19));
  if (wallEq) return { correct: false, errorClass: 'zone-offset' };

  for (const [milestone, value] of Object.entries(key.distractors ?? {})) {
    if (intervalsEqual(actual, value)) return { correct: false, errorClass: 'anchor-binding', boundTo: milestone };
  }

  if (actual.length > 0 && key.expected.length > 0) {
    const startDelta = Math.round((ms(actual[0].start) - ms(key.expected[0].start)) / DAY_MS);
    const endDelta = Math.round((ms(actual[actual.length - 1].end) - ms(key.expected[key.expected.length - 1].end)) / DAY_MS);
    // Fencepost: one boundary exact, the other off by exactly one day — the classic
    // inclusive/exclusive miss ("through the fix (inclusive)" ending ON the fix day).
    if ((startDelta === 0 && Math.abs(endDelta) === 1) || (endDelta === 0 && Math.abs(startDelta) === 1)) {
      return { correct: false, errorClass: 'fencepost', deltaDays: startDelta || endDelta };
    }
    const tol = key.arithmeticToleranceDays ?? 7;
    if (Math.abs(startDelta) > 0 && Math.abs(startDelta) <= tol) {
      return { correct: false, errorClass: 'arithmetic', deltaDays: startDelta };
    }
    return { correct: false, errorClass: 'wrong-operation', deltaDays: startDelta };
  }
  return { correct: false, errorClass: 'wrong-operation' };
}

export interface DriftPoint { depth: number; accuracy: number; n: number }

/** Accuracy as a function of chain depth — DESIGN's drift curve. */
export function driftCurve(rows: Array<{ depth: number; correct: boolean }>): DriftPoint[] {
  const byDepth = new Map<number, { ok: number; n: number }>();
  for (const { depth, correct } of rows) {
    const cell = byDepth.get(depth) ?? { ok: 0, n: 0 };
    cell.n++;
    if (correct) cell.ok++;
    byDepth.set(depth, cell);
  }
  return [...byDepth.entries()]
    .sort(([a], [b]) => a - b)
    .map(([depth, { ok, n }]) => ({ depth, accuracy: ok / n, n }));
}
