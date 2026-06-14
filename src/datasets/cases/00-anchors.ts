/**
 * The nine seed anchors. Every item is seed-relative: the answer
 * depends on the anchor, never on something a model could have memorized. Each anchor
 * was chosen to stress something specific.
 */
import type { AnchorId } from './lib/types.js';

export const ANCHORS: Record<AnchorId, { iso: string; weekday: string; why: string }> = {
  A1: { iso: '2026-03-12T14:30:00-04:00', weekday: 'Thu', why: 'day-pinning probes ("a month ago" vs "30 days ago"); mid-quarter; week/month interior' },
  A2: { iso: '2025-09-15T09:00:00-04:00', weekday: 'Mon', why: 'anchor IS a Monday (week start = itself); past-holiday roll (Labor Day)' },
  A3: { iso: '2026-01-15T10:00:00-05:00', weekday: 'Thu', why: 'year/quarter-boundary relatives; YTD = MTD = QTD coincide' },
  A4: { iso: '2025-11-26T08:30:00-05:00', weekday: 'Wed', why: 'day BEFORE Thanksgiving; holiday-dense; business-day-over-holiday arithmetic' },
  A5: { iso: '2026-06-09T11:00:00-04:00', weekday: 'Tue', why: 'the general-purpose seed; same-day time-of-day probe' },
  A6: { iso: '2025-12-30T13:00:00-05:00', weekday: 'Tue', why: 'year-end: "this year"=2025, "next year"=2026, "this quarter"=Q4' },
  A7: { iso: '2026-02-27T15:20:00-05:00', weekday: 'Fri', why: 'end of a 28-day February; month-length mismatch; Feb 29 invalid' },
  A8: { iso: '2026-04-19T13:00:00-04:00', weekday: 'Sun', why: 'weekend anchor: Sunday is the LAST day of a Mon-start week' },
  A9: { iso: '2025-10-31T12:00:00-04:00', weekday: 'Fri', why: 'anchor IS Halloween — named-period self-reference probe' },
};

export const anchorIso = (id: AnchorId): string => ANCHORS[id].iso;
