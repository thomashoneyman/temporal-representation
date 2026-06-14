/**
 * Slice 7 — No-time (8 items). All positives: queries with no
 * temporal aspect, where the model must answer kind:'none' WITHOUT inventing a time.
 * The hard cases are near-misses — words that look temporal but aren't ("latest",
 * "open", "times", "current"). Recall is measured here; precision (over-abstention)
 * is measured across the 108 temporal items in the other slices.
 */
import type { CaseItem } from './lib/types.js';

const noTime = (id: string, anchor: CaseItem['anchor'], query: string, notes?: string): CaseItem => ({
  id, slice: 'notime', anchor, query,
  canonicalIR: null, expected: null, cardinality: 'none', granularity: null,
  expectedAmbiguity: 1, shouldClarify: false, isNoTime: true,
  ...(notes ? { notes } : {}),
});

export const NOTIME: CaseItem[] = [
  noTime('T7-01', 'A5', 'summarize the latest report', 'Near-miss: "latest" is ordering, not a date — don\'t synthesize a recency window.'),
  noTime('T7-02', 'A1', 'who owns the billing service?', 'Clean negative.'),
  noTime('T7-03', 'A5', 'top 5 customers by revenue', 'Clean negative.'),
  noTime('T7-04', 'A1', 'explain the spike in errors', 'No time given; don\'t invent "recent".'),
  noTime('T7-05', 'A2', 'what is our uptime SLA?', 'Clean negative.'),
  noTime('T7-06', 'A5', 'list all open incidents', 'Near-miss: "open" is state, not time.'),
  noTime('T7-07', 'A1', 'how many times did the job fail?', 'Near-miss: "times" ≠ temporal.'),
  noTime('T7-08', 'A6', 'what\'s the current status of the deploy?', 'Near-miss: "current" = now-state; no range needed. A today/now answer is a tracked Sev-3 variant, not a hard fail.'),
];
