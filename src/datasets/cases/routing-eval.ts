/**
 * Task 8 — the routing-discrimination eval set (drop-in).
 *
 * The production question for a free-form agent: can we let the model answer easy times
 * directly in ISO and reach for the resolve(IR) tool ONLY where it actually struggles?
 * That only works if the model's own routing judgment lines up with where it's weak.
 *
 * This set mixes 15 EASY and 15 HARD single-window items. "Hard" is not our opinion —
 * each label is empirical: HARD = items Haiku resolved to ISO incorrectly in Task 4
 * (≤1 of 3 repeats correct, single-shot translation); EASY = items it got right every
 * time (3/3). The eval then asserts, per item, BOTH the routing decision (did it
 * delegate the hard ones / self-compute the easy ones?) and the resulting time window.
 *
 * Labels were frozen from a 2026-06 Haiku measurement (see results/runs/phase2). They
 * are model-specific by design — re-derive for another model with the ranking snippet in
 * the Task 8 readout. Items reference the shared dataset so the answer key and resolver
 * stay the single source of truth; `buildRoutingEval()` materializes them, and the Task 8
 * runner also exports a fully self-contained artifacts/routing-eval.json.
 */
import { ALL_CASES, anchorIso } from './index.js';
import type { CaseItem } from './lib/types.js';

export type Hardness = 'easy' | 'hard';

/** Frozen Haiku labels: HARD = direct-ISO ≤1/3 correct, EASY = 3/3. Single-window only. */
export const ROUTING_LABELS: Array<{ id: string; hardness: Hardness }> = [
  // HARD — Haiku's direct ISO was wrong: business-day/fiscal math, holidays whose date
  // must be resolved, week/quarter boundaries, open-ended and named ranges, occurrence.
  { id: 'R2-12', hardness: 'hard' }, // "in 3 business days"
  { id: 'R2-24', hardness: 'hard' }, // "10 business days before the end of this quarter"
  { id: 'R2-22', hardness: 'hard' }, // "180 days before Christmas 2026"
  { id: 'R2-28', hardness: 'hard' }, // "400 days from now"
  { id: 'N3-19', hardness: 'hard' }, // "Labor Day"
  { id: 'N3-23', hardness: 'hard' }, // "the week of July 4th"
  { id: 'N3-04', hardness: 'hard' }, // "this week"
  { id: 'N3-16', hardness: 'hard' }, // "Christmas"
  { id: 'N3-05', hardness: 'hard' }, // "last week"
  { id: 'N3-20', hardness: 'hard' }, // "Memorial Day"
  { id: 'G5-08', hardness: 'hard' }, // "Q1"
  { id: 'G5-03', hardness: 'hard' }, // "since March"
  { id: 'G5-13', hardness: 'hard' }, // "the last 7 days"
  { id: 'G5-12', hardness: 'hard' }, // "the next three days"
  { id: 'S1-06', hardness: 'hard' }, // "the 1st"
  // EASY — Haiku's direct ISO was perfect: explicit dates and plain offsets.
  { id: 'S1-13', hardness: 'easy' }, // "April 30"
  { id: 'S1-09', hardness: 'easy' }, // "January 3rd"
  { id: 'S1-05', hardness: 'easy' }, // "Tuesday at 3pm"
  { id: 'S1-08', hardness: 'easy' }, // "December 25"
  { id: 'S1-11', hardness: 'easy' }, // "the 15th at noon"
  { id: 'S1-15', hardness: 'easy' }, // "the third Tuesday of next month"
  { id: 'S1-10', hardness: 'easy' }, // "6/15"
  { id: 'S1-14', hardness: 'easy' }, // "noon on the 5th"
  { id: 'R2-20', hardness: 'easy' }, // "this time next week"
  { id: 'R2-11', hardness: 'easy' }, // "in 6 months"
  { id: 'R2-26', hardness: 'easy' }, // "the 100th day of the year"
  { id: 'R2-02', hardness: 'easy' }, // "in three days"
  { id: 'R2-17', hardness: 'easy' }, // "in two weeks"
  { id: 'R2-13', hardness: 'easy' }, // "5 business days ago"
  { id: 'R2-29', hardness: 'easy' }, // "the Monday after next"
];

export interface RoutingCase {
  id: string;
  query: string;
  anchor: string; // ISO
  hardness: Hardness;
  expectedRoute: 'resolve' | 'iso'; // hard → delegate; easy → self-compute
  item: CaseItem;
}

export function buildRoutingEval(): RoutingCase[] {
  const byId = new Map(ALL_CASES.map((c) => [c.id, c]));
  return ROUTING_LABELS.map(({ id, hardness }) => {
    const item = byId.get(id);
    if (!item) throw new Error(`routing-eval references unknown item ${id}`);
    return {
      id,
      query: item.query,
      anchor: anchorIso(item.anchor),
      hardness,
      expectedRoute: hardness === 'hard' ? 'resolve' : 'iso',
      item,
    };
  });
}
