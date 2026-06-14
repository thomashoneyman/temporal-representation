/**
 * Slice 8 — Ambiguous (14 items). No single safe default. The key is
 * an ACCEPTABLE SET (or a plausible region) plus a shouldClarify expectation — these
 * items measure whether models flag genuine ambiguity (Task 6) without over-flagging
 * the safe-default controls (B8-04, B8-14). canonicalIR is null: there is no single
 * authored answer; scoring is acceptable-set membership + the clarification signal.
 */
import { days } from './lib/build.js';
import type { CaseItem, Wall } from './lib/types.js';

const amb = (
  id: string,
  anchor: CaseItem['anchor'],
  query: string,
  o: {
    amb: number;
    clarify: boolean;
    clarifyOptional?: boolean;
    acceptable?: Wall[][];
    region?: Wall;
    probe?: CaseItem['probe'];
    notes?: string;
  },
): CaseItem => ({
  id, slice: 'ambiguous', anchor, query,
  canonicalIR: null, expected: null, cardinality: 'none', granularity: null,
  expectedAmbiguity: o.amb, shouldClarify: o.clarify,
  ...(o.clarifyOptional ? { clarifyOptional: true } : {}),
  ...(o.acceptable ? { acceptable: o.acceptable } : {}),
  ...(o.region ? { region: o.region } : {}),
  ...(o.probe ? { probe: o.probe } : {}),
  ...(o.notes ? { notes: o.notes } : {}),
});

export const AMBIGUOUS: CaseItem[] = [
  amb('B8-01', 'A4', 'around the holidays', {
    amb: 5, clarify: true, region: ['2025-12-22', '2026-01-02'],
    notes: 'Christmas–New Year region; any resolved value is scored only by distance to it.',
  }),
  amb('B8-02', 'A1', 'recently', {
    amb: 5, clarify: true, region: ['2026-02-12', '2026-03-12'],
    notes: 'Last 1–4 weeks. No defensible single default.',
  }),
  amb('B8-03', 'A1', 'soon', {
    amb: 5, clarify: true, region: ['2026-03-12', '2026-04-09'],
    notes: 'Next few days–weeks (future-directed).',
  }),
  amb('B8-04', 'A5', 'next Friday', {
    amb: 3, clarify: false,
    acceptable: [days('2026-06-12'), days('2026-06-19')],
    probe: { axis: 'occurrence', candidates: { comingFriday: days('2026-06-12'), nextWeekFriday: days('2026-06-19') }, irMeasures: true },
    notes: 'OVER-CLARIFICATION CONTROL + Task-5 steerability item: both readings are acceptable; clarifying is the error. Note: the dataset labels "coming Friday" the convention, but the locked C4a text says next-<weekday> is week-relative (Jun 19) — flagged for the Task-3 convention review.',
  }),
  amb('B8-05', 'A1', 'about a month ago', {
    amb: 4, clarify: true, region: ['2026-02-05', '2026-02-19'],
    notes: 'Fuzzy region around Feb 12. Doubles as a Task-5 steerability item.',
  }),
  amb('B8-06', 'A1', 'early next month', {
    amb: 4, clarify: true, clarifyOptional: true,
    acceptable: [[['2026-04-01', '2026-04-08']], [['2026-04-01', '2026-04-11']]],
    notes: 'First ~week-to-10-days of April; resolving to either is fine, clarifying also fine.',
  }),
  amb('B8-07', 'A5', 'the weekend', {
    amb: 3, clarify: false,
    acceptable: [[['2026-06-13', '2026-06-15']], days('2026-06-13', '2026-06-14')],
    notes: 'Safe default: the coming weekend (Jun 13–14), as one range or two day-members.',
  }),
  amb('B8-08', 'A1', 'the last few months', {
    amb: 4, clarify: true, region: ['2025-12-01', '2026-03-01'],
    notes: 'Last 2–4 months.',
  }),
  amb('B8-09', 'A2', 'end of year', {
    amb: 4, clarify: true,
    acceptable: [[['2025-12-01', '2026-01-01']], [['2025-10-01', '2026-01-01']], days('2025-12-31')],
    notes: 'December, Q4, or Dec 31 — three structurally different readings.',
  }),
  amb('B8-10', 'A5', 'mid-month', {
    amb: 3, clarify: false, region: ['2026-06-10', '2026-06-20'],
    acceptable: [days('2026-06-15')],
    notes: 'Around the 15th; the 15th itself is the crispest acceptable answer.',
  }),
  amb('B8-11', 'A6', 'the new year', {
    amb: 3, clarify: false,
    acceptable: [days('2026-01-01'), [['2026-01-01', '2027-01-01']]],
    notes: 'The day (Jan 1) or the year (2026) — both acceptable.',
  }),
  amb('B8-12', 'A1', 'over the summer', {
    amb: 3, clarify: false,
    acceptable: [[['2026-06-01', '2026-09-01']], [['2026-06-21', '2026-09-23']]],
    notes: 'Meteorological (Jun–Aug) vs solstice (Jun 21 – Sep 22) summer, 2026.',
  }),
  amb('B8-13', 'A4', 'before the long weekend', {
    amb: 5, clarify: true, region: ['2025-11-17', '2025-11-27'],
    notes: 'Undefined extent before the Thanksgiving long weekend.',
  }),
  amb('B8-14', 'A5', 'this afternoon', {
    amb: 2, clarify: false,
    acceptable: [[['2026-06-09T12:00', '2026-06-09T18:00']]],
    notes: 'OVER-CLARIFICATION CONTROL: the C14 default (12:00–18:00) is perfectly safe; flagging this for clarification is the Task-6 precision error.',
  }),
];
