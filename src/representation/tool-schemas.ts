/**
 * Tool-argument contracts for the threading tasks (Tasks 7/7b) — here
 * the representation under test arrives as TOOL-CALL ARGUMENTS instead of a final
 * answer. The downstream tool is range-only in every arm; what varies is how the time
 * gets there:
 *  - ISO arm:      the model computes `start`/`end` itself → QueryRangeArgs
 *  - ISO+tool arm: same, but a deterministic shift helper is on offer → ShiftArgs
 *  - IR arm:       the model passes an unresolved expression; the boundary resolver
 *                  enforces the SHAPE (must resolve to a single range) → ResolveRangeArgs
 */
import { z } from 'zod';
import { TimeExprSchema } from '../scate-lite/ir.js';

/** The downstream range-only tool (all arms). The scored signal is these args. */
export const QueryRangeArgs = z.object({
  start: z.string().describe('ISO 8601 inclusive start'),
  end: z.string().describe('ISO 8601 exclusive end'),
});
export type QueryRangeInput = z.infer<typeof QueryRangeArgs>;

/** IR-arm boundary tool: full core grammar in, but the resolver rejects anything that
 *  does not resolve to a single contiguous range (requireShape: 'range'). */
export const ResolveRangeArgs = z.object({
  expr: TimeExprSchema.describe('a ScateLite expression that resolves to one contiguous range'),
});
export type ResolveRangeInput = z.infer<typeof ResolveRangeArgs>;

/** Deterministic arithmetic helper (offered in the iso-tool arm; usage is measured). */
export const ShiftArgs = z.object({
  base: z.string().describe('ISO 8601 datetime to shift from'),
  by: z.string().describe('ISO 8601 duration: P3D, P2W, P1M, PT30M …'),
  direction: z.enum(['before', 'after']),
  businessDays: z.boolean().optional().describe('count business days (skip weekends + US federal holidays)'),
});
export type ShiftInput = z.infer<typeof ShiftArgs>;

/** Hybrid-arm boundary tool (the stretch contract): ONE tool whose time argument is
 *  EITHER already-resolved ISO or an unresolved shape-restricted expression — the tool
 *  resolves internally, so no dedicated resolve tool is needed and the model chooses
 *  per call which representation to send. */
import { TimeExprThreadingSchema } from '../scate-lite/ir.js';
// Plain-optional fields, deliberately: we measured BOTH wrappers. Explicit nulls are
// stripped by the tool layer before validation, so `.nullable()` adds nothing there —
// but it DOES change the advertised JSON schema, and that change moved three of four
// models' scores (gpt-5.5 −23, haiku −8, opus +6): provider-side constrained decoding
// against recursive function-call schemas is sensitive to wrapper minutiae. Both
// variants' rows are kept (results/runs/3-tooling/threading/ vs threading-hybrid-v4-nullable/); the
// brittleness itself is the finding.
export const HybridQueryArgs = z.object({
  start: z.string().optional().describe('ISO 8601 inclusive start — use with `end` when you already have concrete dates'),
  end: z.string().optional().describe('ISO 8601 exclusive end'),
  expr: TimeExprThreadingSchema.optional().describe('a ScateLite expression resolving to one contiguous range — use INSTEAD of start/end for the hard cases listed in the instructions; the tool resolves it'),
});
export type HybridQueryInput = z.infer<typeof HybridQueryArgs>;

/** Iteration variant: a REQUIRED mode discriminator forces the model to commit to a
 *  representation before filling fields — targets the half-committed {} emissions. */
export const HybridModeArgs = z.object({
  mode: z.enum(['iso', 'expr']).describe('which representation this call uses — decide FIRST, then fill only that representation\'s fields'),
  start: z.string().optional().describe('ISO 8601 inclusive start (mode=iso)'),
  end: z.string().optional().describe('ISO 8601 exclusive end (mode=iso)'),
  expr: TimeExprThreadingSchema.optional().describe('the time expression (mode=expr)'),
});

/** Iteration variant: the expression travels as object OR JSON string — each vendor
 *  self-selects the channel it is reliable on. */
export const HybridUnionArgs = z.object({
  start: z.string().optional().describe('ISO 8601 inclusive start — use with `end` when you already have concrete dates'),
  end: z.string().optional().describe('ISO 8601 exclusive end'),
  expr: z.union([TimeExprThreadingSchema, z.string().describe('the same expression as a JSON string')]).optional()
    .describe('a ScateLite expression resolving to one contiguous range — as an object, or the identical JSON as a string; use INSTEAD of start/end for the hard cases listed in the instructions'),
});
