/**
 * The ISO arm's value language: what a model emits when asked to
 * resolve a query directly to concrete ISO 8601 values. Separate from the IR — this
 * union carries its own `bounds` enum because a model writing concrete ranges needs a
 * way to say inclusive/exclusive; `resolveISO` normalizes everything to half-open.
 */
import { z } from 'zod';

export const BoundsSchema = z
  .enum(['[)', '[]', '(]', '()'])
  .describe('interval bounds; default half-open [start, end)');

// z.union (not discriminatedUnion): unions must compile to JSON-schema `anyOf` —
// OpenAI's response_format rejects `oneOf` anywhere (probe-verified).
export const IsoValueSchema = z.union([
  z
    .object({ cardinality: z.literal('point'), at: z.string() })
    .describe('a single instant or calendar unit, ISO 8601; precision implies the grain (a bare date = that whole day)'),
  z
    .object({
      cardinality: z.literal('range'),
      start: z.string().nullable().describe('null = open start'),
      end: z.string().nullable().describe('null = open end ("since April" → start only)'),
      bounds: BoundsSchema.default('[)'),
    })
    .describe('one contiguous span'),
  z
    .object({
      cardinality: z.literal('set'),
      members: z.array(z.object({ start: z.string(), end: z.string() })).describe('half-open [start, end) members'),
    })
    .describe('two or more disjoint spans, e.g. "Saturdays in August"'),
]);

export type IsoValue = z.infer<typeof IsoValueSchema>;
