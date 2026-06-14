/**
 * Dynamic prompt rendering. The three
 * arms get PARALLEL prompts — identical except for the output contract and (for
 * ISO-PRESET) the crib block — so the comparison stays fair. The anchor, org-preset
 * definitions, optional crib, and optional Task-5 convention block all arrive per item
 * at run time, which is why datasets are arm-agnostic.
 */
import { createHash } from 'node:crypto';
import { DateTime } from 'luxon';
import { z } from 'zod';
import { DEFAULT_CONVENTIONS } from '../scate-lite/conventions.js';
import { ZONE } from '../scate-lite/interval.js';
import { resolveIR } from '../scate-lite/resolver.js';
import type { PresetName } from '../scate-lite/ir.js';
import { TranslationIR, TranslationISO } from '../representation/translation-schema.js';
import { PROMPT_DEFINITIONS } from './cases/04-custom.js';

export type Arm = 'iso' | 'iso-preset' | 'ir';

const AMBIGUITY_SCALE = `Ambiguity scale:
1. Completely clear what date to choose
2. Clear first choice, but other options are plausible
3. The chosen date is most likely from context, but others are reasonable
4. Several contending options for the best choice
5. Completely unclear which option is most appropriate`;

const SHARED = `You translate the time expression in a user's request into a structured value.
- Treat the Anchor line as the current date/time. Never use the real clock.
- If the request has no temporal aspect, return kind:"none" with one sentence of reasoning.
- Otherwise return kind:"time" with the value, an ambiguity rating 1-5, and one sentence of reasoning.
- Time zone is America/New_York; do not convert zones.
${AMBIGUITY_SCALE}`;

/**
 * Orientation-only grammar block for the IR arm. The injected JSON schema (whose
 * field descriptions are the canonical per-node docs) carries the details — this
 * block adds only what a schema can't: the do-not-compute rule, the calendar-vs-exact
 * semantics, and two worked examples. Examples deliberately use phrasings ABSENT from
 * the dataset (no train-on-test leakage).
 */
const IR_GRAMMAR = `Express the time as a TimeExpr value in the grammar defined by the JSON schema below (node types: now, date, preset, ref, shift, weekday, nth, range, filter, union). A deterministic tool resolves your expression — do NOT compute dates yourself; classify the phrasing into the grammar.
Semantics: shift moves a base by an ISO-8601 duration — calendar units pin the day-of-month ("P1M" = the same day one month over) while day/time units are exact elapsed time ("P30D" = exactly 30 days). Match the base to the precision the phrase implies: day-level phrases shift the today preset ("four days ago" = shift(preset today, P4D, before) — a whole day); use the now base only when the clock time matters ("this time tomorrow", "30 minutes ago"). A date without a year resolves to an occurrence relative to now; set "which" to pin the reading when the phrasing implies one.
Examples: "since April" → {"type":"range","from":{"type":"date","month":4},"to":{"type":"now"}} · "the 4th Friday of January" → {"type":"nth","n":4,"unit":"fri","of":{"type":"date","month":1}} · "Saturdays in August" → {"type":"filter","within":{"type":"date","month":8},"weekdays":["sat"]}${process.env.IR_CHAIN_EXAMPLE ? ' · Nodes NEST to mirror the phrase: "three days after the first Monday of September" → {"type":"shift","base":{"type":"nth","n":1,"unit":"mon","of":{"type":"date","month":9}},"by":"P3D","direction":"after"} — resolve the inner part first, then operate on it' : ''}`;

const CONTRACT: Record<Arm, string> = {
  iso: 'Resolve the time to concrete ISO 8601: a point {cardinality:"point", at}, a range {cardinality:"range", start, end, bounds} (null start/end = open), or a set {cardinality:"set", members:[{start,end}]}. Answer at the precision the phrase implies: a day-level phrase ("four days ago") is a bare date ("2026-06-05"), not a timestamp; give a time of day only when the phrase names one.',
  'iso-preset':
    'Resolve the time to concrete ISO 8601: a point {cardinality:"point", at}, a range {cardinality:"range", start, end, bounds} (null start/end = open), or a set {cardinality:"set", members:[{start,end}]}. Answer at the precision the phrase implies: a day-level phrase ("four days ago") is a bare date ("2026-06-05"), not a timestamp; give a time of day only when the phrase names one. A list of pre-resolved common periods is provided; use it when relevant.',
  ir: IR_GRAMMAR,
};

export interface PromptParts {
  anchor: string; // ISO with offset
  customPresetsText?: string; // verbatim org definitions (slice 4)
  crib?: string; // pre-resolved periods block (ISO-PRESET arm)
  convention?: string; // renderConventions output (Task 5 steering arm)
}

export function renderTranslationInstructions(arm: Arm, parts: PromptParts): string {
  const weekday = DateTime.fromISO(parts.anchor, { zone: ZONE }).weekdayLong;
  return [
    SHARED,
    CONTRACT[arm],
    `Anchor (treat as now): ${parts.anchor} (${weekday})`,
    parts.customPresetsText ?? '', // carries its own header (verbatim org-definitions block)
    parts.crib ? `Pre-resolved reference periods:\n${parts.crib}` : '',
    parts.convention ? `Conventions to follow:\n${parts.convention}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}

/**
 * Fingerprint of everything prompt-shaped: the template blocks AND the injected JSON
 * schemas. Recorded into every run so results are never silently compared across
 * prompt edits — any change to instructions or schema yields a new version.
 */
export const PROMPT_VERSION = createHash('sha256')
  .update(SHARED)
  .update(JSON.stringify(CONTRACT))
  .update(PROMPT_DEFINITIONS)
  .update(JSON.stringify(z.toJSONSchema(TranslationISO)))
  .update(JSON.stringify(z.toJSONSchema(TranslationIR)))
  .digest('hex')
  .slice(0, 12);

const CRIB_PRESETS: PresetName[] = [
  'today', 'yesterday', 'this_week', 'last_week', 'this_month', 'last_month',
  'this_quarter', 'last_quarter', 'ytd',
];

/** Resolver-computed common periods for an anchor (the ISO-PRESET arm's crib block). */
export function cribSheet(anchor: string): string {
  const ctx = { anchor, conventions: DEFAULT_CONVENTIONS, window: { backMonths: 12, forwardMonths: 12 } };
  return CRIB_PRESETS.map((name) => {
    const r = resolveIR({ type: 'preset', name }, ctx);
    return `${name.padEnd(13)}[${r.intervals[0].start} → ${r.intervals[0].end})`;
  }).join('\n');
}
