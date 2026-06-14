/**
 * Slice 4 — Custom presets (10 items).
 * Org-specific periods DEFINED ONLY IN THE PROMPT — deliberately not in training data.
 * These probe out-of-training generalization and the value of a resolve tool (H2): the
 * IR arm only has to emit `ref('sprint')`; the ISO arm must compute the actual dates
 * from the prose definition.
 *
 * Authoring note on `customPresets` bindings: the model sees the PROSE definitions
 * (PROMPT_DEFINITIONS below); the resolver sees these per-item IR bindings. Cadence
 * presets with an epoch (sprint, billing cycle) are bound to their explicit occurrence
 * at that anchor, because a cadence ("every 2 weeks from Jan 5") is a recurrence the
 * grammar deliberately cannot express — computing which occurrence contains the anchor
 * is the authoring step, exactly like picking which:'this' for a bare date. Rule-based
 * presets (maintenance window, all-hands, peak season) are bound compositionally.
 */
import { d, days, filter, nth, preset, range, ref, shift } from './lib/build.js';
import type { CaseItem } from './lib/types.js';
import type { TimeExpr } from '../../scate-lite/ir.js';

/** Injected verbatim into the prompt for every slice-4 item. */
export const PROMPT_DEFINITIONS = `Org calendar definitions (treat these as authoritative for this org; when referring to one, use its id):
- maintenance_window: the 2nd Saturday of each month, 02:00–06:00 local. ("next" = the
  next such window on or after now.)
- fiscal year: starts February 1. Fiscal Q1 = Feb–Apr, Q2 = May–Jul, Q3 = Aug–Oct,
  Q4 = Nov–Jan. ("this quarter" for this org means the fiscal quarter.)
- sprint: 2-week cadence starting Monday 2026-01-05, 00:00. Each sprint is [start, start+14d).
  (ids: current_sprint = the one containing now; next_sprint = the following one.)
- open_enrollment: November 1–15 inclusive, every year.
- peak_season: the day after Thanksgiving through December 31 inclusive.
- billing cycle: the 15th of a month through the 14th of the next month.
  (ids: current_billing_cycle = the cycle containing today; next_billing_cycle = the following one.)
- all_hands: the last Friday of each month, 15:00–16:00 local.`;

const maint: TimeExpr = filter(nth(2, 'sat', preset('this_month')), { timeOfDay: { start: '02:00', end: '06:00' } });
const allhands: TimeExpr = filter(nth('last', 'fri', preset('this_month')), { timeOfDay: { start: '15:00', end: '16:00' } });
const peak: TimeExpr = range(shift(nth(4, 'thu', d({ month: 11 })), 'P1D', 'after'), d({ month: 12, day: 31 }));
// which:'next' pinned: enrollment is anticipatory — under the global 'nearest' policy a
// bare November in March would resolve to LAST November, which nobody means here.
const openEnroll: TimeExpr = range(d({ month: 11, day: 1, which: 'next' }), d({ month: 11, day: 15, which: 'next' }));

export const CUSTOM: CaseItem[] = [
  {
    id: 'C4-01', slice: 'custom', anchor: 'A5', query: 'our next maintenance window',
    canonicalIR: ref('maintenance_window'), customPresets: { maintenance_window: maint },
    expected: [['2026-06-13T02:00', '2026-06-13T06:00']], cardinality: 'range', granularity: 'hour',
    expectedAmbiguity: 2, shouldClarify: false,
    notes: '2nd Saturday of June = Jun 13 (anchor Jun 9 is before it).',
  },
  {
    id: 'C4-02', slice: 'custom', anchor: 'A1', query: 'the next maintenance window',
    canonicalIR: ref('maintenance_window'), customPresets: { maintenance_window: maint },
    expected: [['2026-03-14T02:00', '2026-03-14T06:00']], cardinality: 'range', granularity: 'hour',
    expectedAmbiguity: 2, shouldClarify: false,
  },
  {
    id: 'C4-03', slice: 'custom', anchor: 'A3', query: 'this quarter',
    canonicalIR: preset('this_quarter'),
    conventionsOverride: { fiscalYearStartMonth: 2 },
    expected: [['2025-11-01', '2026-02-01']], cardinality: 'range', granularity: 'quarter',
    expectedAmbiguity: 3, shouldClarify: false,
    acceptable: [[['2026-01-01', '2026-04-01']]],
    notes: 'THE headline custom item: the org fiscal year starts Feb 1, so Jan 15 sits in fiscal Q4 (Nov–Jan). The prompt definition OVERRIDES the global calendar-quarter default; ignoring it (calendar Q1) is the tracked Sev-4 failure.',
  },
  {
    id: 'C4-04', slice: 'custom', anchor: 'A5', query: 'the current sprint',
    canonicalIR: ref('current_sprint'),
    customPresets: { current_sprint: range(d({ year: 2026, month: 6, day: 8 }), d({ year: 2026, month: 6, day: 21 })) },
    expected: [['2026-06-08', '2026-06-22']], cardinality: 'range', granularity: 'day',
    expectedAmbiguity: 2, shouldClarify: false,
    notes: '2-week cadence from Mon 2026-01-05; the sprint containing Jun 9 is Jun 8–22. Watch for off-by-one-sprint.',
  },
  {
    id: 'C4-05', slice: 'custom', anchor: 'A6', query: 'next sprint',
    canonicalIR: ref('next_sprint'),
    customPresets: { next_sprint: range(d({ year: 2026, month: 1, day: 5 }), d({ year: 2026, month: 1, day: 18 })) },
    expected: [['2026-01-05', '2026-01-19']], cardinality: 'range', granularity: 'day',
    expectedAmbiguity: 2, shouldClarify: false,
    notes: 'The epoch itself is still ahead at Dec 30 — "next sprint" is the FIRST sprint.',
  },
  {
    id: 'C4-06', slice: 'custom', anchor: 'A1', query: 'open enrollment',
    canonicalIR: ref('open_enrollment'), customPresets: { open_enrollment: openEnroll },
    expected: [['2026-11-01', '2026-11-16']], cardinality: 'range', granularity: 'day',
    expectedAmbiguity: 2, shouldClarify: false,
    notes: '"November 1–15 inclusive" → half-open end Nov 16.',
  },
  {
    id: 'C4-07', slice: 'custom', anchor: 'A4', query: 'peak season',
    canonicalIR: ref('peak_season'), customPresets: { peak_season: peak },
    expected: [['2025-11-28', '2026-01-01']], cardinality: 'range', granularity: 'day',
    expectedAmbiguity: 2, shouldClarify: false,
    notes: 'Compositional: depends on resolving Thanksgiving (Nov 27 2025) first — day after through Dec 31 inclusive.',
  },
  {
    id: 'C4-08', slice: 'custom', anchor: 'A5', query: 'the current billing cycle',
    canonicalIR: ref('current_billing_cycle'),
    customPresets: { current_billing_cycle: range(d({ year: 2026, month: 5, day: 15 }), d({ year: 2026, month: 6, day: 14 })) },
    expected: [['2026-05-15', '2026-06-15']], cardinality: 'range', granularity: 'day',
    expectedAmbiguity: 2, shouldClarify: false,
    notes: 'The cycle CONTAINING Jun 9 is May 15 – Jun 14 (not Jun 15 – Jul 14).',
  },
  {
    id: 'C4-09', slice: 'custom', anchor: 'A6', query: 'next billing cycle',
    canonicalIR: ref('next_billing_cycle'),
    customPresets: { next_billing_cycle: range(d({ year: 2026, month: 1, day: 15 }), d({ year: 2026, month: 2, day: 14 })) },
    expected: [['2026-01-15', '2026-02-15']], cardinality: 'range', granularity: 'day',
    expectedAmbiguity: 2, shouldClarify: false,
  },
  {
    id: 'C4-10', slice: 'custom', anchor: 'A2', query: 'our next all-hands',
    canonicalIR: ref('all_hands'), customPresets: { all_hands: allhands },
    expected: [['2025-09-26T15:00', '2025-09-26T16:00']], cardinality: 'range', granularity: 'hour',
    expectedAmbiguity: 2, shouldClarify: false,
    notes: 'Last Friday of September 2025 = Sep 26, 15:00–16:00.',
  },
  // ── hard expansion (v0.3) ──
  {
    id: 'C4-11', slice: 'custom', anchor: 'A5', query: 'the sprint after next',
    canonicalIR: ref('sprint_after_next'),
    customPresets: {
      current_sprint: range(d({ year: 2026, month: 6, day: 8 }), d({ year: 2026, month: 6, day: 21 })),
      next_sprint: range(d({ year: 2026, month: 6, day: 22 }), d({ year: 2026, month: 7, day: 5 })),
      sprint_after_next: range(d({ year: 2026, month: 7, day: 6 }), d({ year: 2026, month: 7, day: 19 })),
    },
    expected: [['2026-07-06', '2026-07-20']], cardinality: 'range', granularity: 'day',
    expectedAmbiguity: 2, shouldClarify: false,
    notes: 'Cadence stepped TWICE from the epoch (current Jun 8 → next Jun 22 → after-next Jul 6). Off-by-one-sprint is the failure.',
  },
  {
    id: 'C4-12', slice: 'custom', anchor: 'A6', query: 'the last billing cycle of last year',
    canonicalIR: ref('last_billing_cycle_of_last_year'),
    customPresets: {
      current_billing_cycle: range(d({ year: 2025, month: 12, day: 15 }), d({ year: 2026, month: 1, day: 14 })),
      last_billing_cycle_of_last_year: range(d({ year: 2024, month: 12, day: 15 }), d({ year: 2025, month: 1, day: 14 })),
    },
    expected: [['2024-12-15', '2025-01-15']], cardinality: 'range', granularity: 'day',
    expectedAmbiguity: 3, shouldClarify: false,
    acceptable: [[['2024-11-15', '2024-12-15']]],
    notes: 'RE-KEYED (v0.4, consensus audit): at anchor Dec 30 2025, "last year" = 2024 — the original key used the 2025 cycle (an authoring conflation of this/last year; 18/24 model answers across all four models read it correctly). Key = last cycle starting in 2024 (Dec 15 2024 → Jan 14 2025); the last cycle fully within 2024 is the Sev-4 alternative.',
  },
];
