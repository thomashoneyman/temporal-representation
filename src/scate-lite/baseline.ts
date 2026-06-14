/**
 * Rule-based baseline: chrono-node parses the raw utterance against the
 * anchor — no LLM. Run in analysis only. Honest labeling: chrono ≠ the dateparser the
 * literature benchmarks (its 36% figure), but it is the standard pure-JS equivalent.
 * Chrono returns points or start/end pairs; it has no concept of sets, presets, or
 * business calendars — failures to parse return null and score as wrong, which IS the
 * baseline's result, not a harness gap.
 */
import * as chrono from 'chrono-node';
import { DateTime } from 'luxon';
import { ZONE, type Resolved } from './interval.js';

export function chronoBaseline(utterance: string, anchorIso: string): Resolved | null {
  const anchor = DateTime.fromISO(anchorIso, { zone: ZONE });
  const results = chrono.parse(utterance, { instant: anchor.toJSDate(), timezone: 'America/New_York' });
  if (results.length === 0) return null;

  const intervals = results.map((r) => {
    const start = DateTime.fromJSDate(r.start.date(), { zone: ZONE });
    if (r.end) {
      const end = DateTime.fromJSDate(r.end.date(), { zone: ZONE });
      return { start, end };
    }
    // a bare date → that whole day; a time → that minute
    const grain = r.start.isCertain('hour') ? ('minute' as const) : ('day' as const);
    const s = grain === 'day' ? start.startOf('day') : start.startOf('minute');
    return { start: s, end: s.plus(grain === 'day' ? { days: 1 } : { minutes: 1 }) };
  });

  const sorted = intervals
    .filter((iv) => iv.start < iv.end)
    .map((iv) => ({ start: iv.start.toISO({ suppressMilliseconds: true })!, end: iv.end.toISO({ suppressMilliseconds: true })! }));
  if (sorted.length === 0) return null;
  return {
    cardinality: sorted.length >= 2 ? 'set' : 'range',
    intervals: sorted,
  };
}
