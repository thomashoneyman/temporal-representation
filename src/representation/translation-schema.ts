/**
 * The translation output contracts — what a model's FINAL ANSWER must
 * look like in the translation tasks (structured output, no tools). The two arms share
 * the identical envelope (kind + value + ambiguity + reasoning) and differ ONLY in the
 * value language — that's what keeps the ISO-vs-IR comparison fair: same metadata
 * burden, different representation.
 *
 * Shape note (verified live in the step-5 probe): the envelope is a SINGLE OBJECT with
 * a `kind` enum and nullable fields, not a discriminated union — providers reject a
 * root-level `oneOf` in their structured-output formats (OpenAI response_format) /
 * tool input schemas (Anthropic). Nested unions (the value language) are fine.
 */
import { z } from 'zod';
import type { Envelope } from '../scoring/translation.js';
import { TimeExprSchema } from '../scate-lite/ir.js';
import { IsoValueSchema } from '../scate-lite/iso.js';

const Kind = z.enum(['none', 'time']).describe("'none' = the request has no temporal aspect");
// coerce: some models (observed: Opus 4.8, ~2% of calls) emit the number as a string —
// a transport quirk, not a time error; coercion is uniform across arms so it cannot confound.
const Ambiguity = z.coerce
  .number()
  .int()
  .min(1)
  .max(5)
  .nullable()
  .describe("1 = completely clear … 5 = completely unclear; null only when kind='none'");
const Reasoning = z.string().describe('one sentence: why this choice / why uncertain');

/** ISO arm: the model resolves the query to concrete ISO 8601 values itself. */
export const TranslationISO = z.object({
  kind: Kind,
  value: IsoValueSchema.nullable().describe("the resolved time; null when kind='none'"),
  ambiguity: Ambiguity,
  reasoning: Reasoning,
});
export type TranslationISOOutput = z.infer<typeof TranslationISO>;

/** IR arm: the model classifies the query into the CORE ScateLite grammar (no `iso`
 *  leaf — it must classify, never compute); a deterministic resolver does the math. */
export const TranslationIR = z.object({
  kind: Kind,
  value: TimeExprSchema.nullable().describe("the TimeExpr; null when kind='none'"),
  ambiguity: Ambiguity,
  reasoning: Reasoning,
});
export type TranslationIROutput = z.infer<typeof TranslationIR>;

/** Normalize a raw structured output into the scoring envelope. */
export function toEnvelope(raw: unknown): Envelope {
  const o = raw as { kind?: string; value?: unknown; ambiguity?: number | null; reasoning?: string };
  if (o?.kind === 'time' && o.value != null) {
    return { kind: 'time', value: o.value, ambiguity: o.ambiguity ?? 3, reasoning: o.reasoning ?? '' };
  }
  return { kind: 'none', reasoning: o?.reasoning ?? '' };
}
