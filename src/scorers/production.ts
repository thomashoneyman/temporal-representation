/**
 * The production guardrail — a MODEL-FREE sanity check for time arguments, cheap enough
 * to run on every trace (sampling rate 1.0). It cannot know the user's intent, so it
 * never judges "is this the right window?"; it flags only the shapes that are wrong on
 * their face or that match a known model failure signature:
 *
 *   - end before start, or a zero-length range
 *   - an empty set of windows
 *   - a window implausibly far from the conversation's anchor ("now")
 *   - identical wall-clock with a mismatched UTC offset for that date in the agent's
 *     zone (the DST copy-paste failure we measured in every ISO arm)
 *   - exactly-30-days when the anchor suggests "a month ago" day-pinning (the P30D
 *     signature — worth a log line, weakest signal, so it is a separate low-severity flag)
 *
 * Two ways to use it (both shown in src/scorers/README.md):
 *   log-only   — register on the Mastra instance; read flags in observability
 *   guardrail  — call `checkTimeArgs` directly in tool middleware and retry the step
 *                when `severity === 'block'`
 *
 * Pure core + a thin Mastra wrapper, so it ports to any framework.
 */
import { createScorer } from '@mastra/core/evals';
import { DateTime } from 'luxon';

export interface TimeArgFlag {
  code: 'end-before-start' | 'zero-length' | 'empty-set' | 'outside-window' | 'offset-mismatch' | 'p30d-month-suspect';
  severity: 'block' | 'warn';
  message: string;
}

export interface SanityOptions {
  /** The conversation's "now". Required for window and month-signature checks. */
  anchor?: string;
  /** IANA zone the agent is told to answer in (offset checks). */
  zone?: string;
  /** Plausible window around the anchor, in months. Default ±18. */
  backMonths?: number;
  forwardMonths?: number;
}

/** Pure check: hand it the time arguments your tools received. */
export function checkTimeArgs(
  intervals: Array<{ start: string; end: string }>,
  opts: SanityOptions = {},
): TimeArgFlag[] {
  const flags: TimeArgFlag[] = [];
  if (intervals.length === 0) {
    return [{ code: 'empty-set', severity: 'block', message: 'no time windows at all — the query would match nothing' }];
  }
  const zone = opts.zone ?? 'America/New_York';
  const anchor = opts.anchor ? DateTime.fromISO(opts.anchor, { setZone: true }) : null;

  for (const iv of intervals) {
    const s = DateTime.fromISO(iv.start, { setZone: true });
    const e = DateTime.fromISO(iv.end, { setZone: true });
    if (!s.isValid || !e.isValid) {
      flags.push({ code: 'end-before-start', severity: 'block', message: `unparseable interval ${iv.start} → ${iv.end}` });
      continue;
    }
    if (e < s) flags.push({ code: 'end-before-start', severity: 'block', message: `end precedes start: ${iv.start} → ${iv.end}` });
    else if (e.equals(s)) flags.push({ code: 'zero-length', severity: 'block', message: `zero-length range at ${iv.start} (half-open [start, end) matches nothing)` });

    // DST copy-paste: the stated offset is not the real offset for that wall-clock in `zone`.
    for (const point of [iv.start, iv.end]) {
      const m = point.match(/[+-]\d{2}:\d{2}$/);
      if (!m) continue;
      const wall = point.slice(0, 19);
      const real = DateTime.fromISO(wall, { zone });
      const statedMinutes = (m[0].startsWith('-') ? -1 : 1) * (Number(m[0].slice(1, 3)) * 60 + Number(m[0].slice(4, 6)));
      if (real.isValid && real.offset !== statedMinutes) {
        const want = `${real.offset < 0 ? '-' : '+'}${String(Math.floor(Math.abs(real.offset) / 60)).padStart(2, '0')}:${String(Math.abs(real.offset) % 60).padStart(2, '0')}`;
        flags.push({
          code: 'offset-mismatch',
          severity: 'warn',
          message: `${point}: ${m[0]} is not the ${zone} offset for that date (should be ${want}) — likely copied across a DST boundary`,
        });
        break;
      }
    }

    if (anchor?.isValid) {
      const lo = anchor.minus({ months: opts.backMonths ?? 18 });
      const hi = anchor.plus({ months: opts.forwardMonths ?? 18 });
      if (e < lo || s > hi) {
        flags.push({ code: 'outside-window', severity: 'warn', message: `${iv.start} → ${iv.end} is outside ±${opts.backMonths ?? 18}/${opts.forwardMonths ?? 18} months of the anchor — wrong year is the usual cause` });
      }
      // The P30D signature: a range starting exactly 30 days back from a same-time anchor
      // when the calendar month back differs — the classic "a month ago" miss.
      const monthBack = anchor.minus({ months: 1 });
      const thirtyBack = anchor.minus({ days: 30 });
      if (s.hasSame(thirtyBack, 'day') && !s.hasSame(monthBack, 'day') && !monthBack.hasSame(thirtyBack, 'day')) {
        flags.push({ code: 'p30d-month-suspect', severity: 'warn', message: `starts exactly 30 days before the anchor where "a month ago" would be ${monthBack.toISODate()} — check which the user meant` });
      }
    }
  }
  return flags;
}

/** Mastra wrapper: scans an agent run's tool calls for {start, end} args and scores
 *  1 = no flags, 0.5 = warnings only, 0 = at least one blocking flag. Flag details land
 *  in the score's reason for observability. */
export const temporalSanityScorer = createScorer({
  id: 'temporal-sanity',
  name: 'temporal-sanity',
  description: 'Model-free sanity flags on the time arguments of tool calls (end<start, zero-length, DST offset mismatch, implausible window)',
}).generateScore(({ run }) => {
  const intervals: Array<{ start: string; end: string }> = [];
  let anchor: string | undefined;
  (function scan(node: unknown, depth: number): void {
    if (node == null || depth > 9) return;
    if (Array.isArray(node)) { for (const el of node) scan(el, depth + 1); return; }
    if (typeof node !== 'object') return;
    const o = node as Record<string, unknown>;
    if (typeof o.start === 'string' && typeof o.end === 'string') intervals.push({ start: o.start, end: o.end });
    if (typeof o.anchor === 'string') anchor ??= o.anchor;
    for (const v of Object.values(o)) scan(v, depth + 1);
  })(run, 0);
  if (intervals.length === 0) return 1; // nothing time-shaped in this trace — not our business
  const flags = checkTimeArgs(intervals, { anchor });
  if (flags.some((f) => f.severity === 'block')) return 0;
  return flags.length ? 0.5 : 1;
});
