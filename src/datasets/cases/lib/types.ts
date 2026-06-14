/**
 * The dataset item shape (Artifact #1). Each item is fully self-describing: the user
 * query, the anchor it is asked at, the hand-authored canonical IR, and the expected
 * resolution. The answer key is DERIVED: resolveIR(canonicalIR, ctx) must reproduce
 * `expected` exactly — tests/answer-key.test.ts enforces this for every item.
 */
import type { Conventions } from '../../../scate-lite/conventions.js';
import type { TimeExpr } from '../../../scate-lite/ir.js';
import type { Cardinality, Grain } from '../../../scate-lite/interval.js';

export type Slice =
  | 'specific'
  | 'relative'
  | 'named'
  | 'custom'
  | 'ranges'
  | 'multipart'
  | 'notime'
  | 'ambiguous';

export type AnchorId = 'A1' | 'A2' | 'A3' | 'A4' | 'A5' | 'A6' | 'A7' | 'A8' | 'A9';

/** NY wall-clock [start, end) pair; date-only strings mean local midnight. */
export type Wall = [string, string];

export type ProbeAxis =
  | 'granularity'
  | 'day-pinning'
  | 'week-start'
  | 'rolling-vs-calendar'
  | 'bounds'
  | 'occurrence'; // bare date/holiday/weekday year-or-week choice

export interface CaseItem {
  id: string;
  slice: Slice;
  anchor: AnchorId;
  query: string;
  /** The hand-authored ScateLite expression; null for no-time items. */
  canonicalIR: TimeExpr | null;
  /** The answer key, as NY wall-clock intervals; null for no-time / clarify-only items. */
  expected: Wall[] | null;
  cardinality: Cardinality;
  granularity: Grain | null;
  open?: boolean;
  /** Authored expected ambiguity (1–5) and whether the model should ask to clarify. */
  expectedAmbiguity: number;
  shouldClarify: boolean;
  /** 'maybe' rows: clarifying is acceptable but not required (excluded from clarify P/R). */
  clarifyOptional?: boolean;
  isNoTime?: boolean;
  /** Documented INTERPRETATION divergences only (each scores exactly Sev 4): a
   *  defensible alternative reading like 30-day-month or current-year. Convention
   *  ERRORS that carry their own severity (fencepost Sev 1, Sun-start week Sev 3,
   *  include-today Sev 3) are NOT listed here — the structural rubric grades them. */
  acceptable?: Wall[][];
  /** Ambiguous items without an enumerable acceptable set: the plausible region. */
  region?: Wall;
  /** Phase-1 interpretation probe: labeled candidate readings to tally (ungraded).
   *  irMeasures: does the IR arm GENUINELY choose here? True only when the probe's
   *  distinction survives encoding (P1M-vs-P30D, date.which, weekday.which). When the
   *  model would just emit a preset/bare node and OUR resolver picks the reading, the
   *  IR tally is resolver echo and must not be shown as a preference. */
  probe?: { axis: ProbeAxis; candidates: Record<string, Wall[]>; irMeasures?: boolean };
  /** Org-preset bindings for `ref` nodes (the prompt carries the prose definitions). */
  customPresets?: Record<string, TimeExpr>;
  /** Per-item convention override (e.g. the fiscal-year org in C4-03). */
  conventionsOverride?: Partial<Conventions>;
  notes?: string;
}
