/**
 * The tools under test for the threading tasks (7/7b). The downstream tool is
 * range-only in EVERY arm — what varies is how the time argument gets there:
 *   iso       → queryRange only (model computes dates itself)
 *   iso-tool  → + shift (deterministic arithmetic helper; usage is measured)
 *   ir        → + resolveRange (model passes an unresolved expression; the resolver
 *               computes it, with milestone bindings from requestContext)
 * queryRange returns a stub — the SCORED SIGNAL is its arguments, never its output.
 */
import { createTool } from '@mastra/core/tools';
import { DateTime, Duration } from 'luxon';
import { z } from 'zod';
import { addBusinessDays } from '../scate-lite/calendar.js';
import { DEFAULT_CONVENTIONS } from '../scate-lite/conventions.js';
import { TimeExprThreadingSchema, type TimeExpr } from '../scate-lite/ir.js';
import { ZONE } from '../scate-lite/interval.js';
import { resolveIR } from '../scate-lite/resolver.js';
import { HybridModeArgs, HybridQueryArgs, HybridUnionArgs, QueryRangeArgs, ResolveRangeArgs, ShiftArgs } from '../representation/tool-schemas.js';

export const queryRangeTool = createTool({
  id: 'query_range',
  description: 'Query business records for one contiguous half-open time range [start, end). Returns a row count.',
  inputSchema: QueryRangeArgs,
  outputSchema: z.object({ status: z.string(), rows: z.number() }),
  execute: async () => ({ status: 'ok', rows: 42 }), // stub: the args are the experiment's signal
});

export const shiftTool = createTool({
  id: 'shift_date',
  description: 'Deterministically shift an ISO datetime by an ISO-8601 duration (calendar math for months/years; optional business-day stepping). Use this instead of computing date arithmetic yourself.',
  inputSchema: ShiftArgs,
  outputSchema: z.object({ result: z.string() }),
  execute: async (input) => {
    const { base, by, direction, businessDays } = input as z.infer<typeof ShiftArgs>;
    const dt = DateTime.fromISO(base, { zone: ZONE });
    if (!dt.isValid) return { result: `error: invalid base ${base}` };
    const dur = Duration.fromISO(by);
    if (!dur.isValid) return { result: `error: invalid duration ${by}` };
    if (businessDays) {
      const landed = addBusinessDays(dt, direction === 'before' ? -Math.round(dur.as('days')) : Math.round(dur.as('days')));
      return { result: landed.toISO({ suppressMilliseconds: true })! };
    }
    const out = direction === 'before' ? dt.minus(dur) : dt.plus(dur);
    return { result: out.toISO({ suppressMilliseconds: true })! };
  },
});

/** Task 7b's IR-arm boundary tool: unlike resolve_range it accepts expressions that
 *  expand to a SET of windows (filters, unions) and returns the full concrete list —
 *  enumeration is code's job; the model only threads the results into query calls. */
export function makeResolveSetTool(getCtx: () => { anchor: string; customPresets?: Record<string, TimeExpr> }) {
  return createTool({
    id: 'resolve_set',
    description: 'Resolve a ScateLite time expression into the complete list of concrete half-open ISO ranges it covers — a compound query like "Tue–Thu 8am–12pm over the past month" expands to one range per matching window. Use this instead of enumerating windows yourself, then call query_range once per returned range.',
    inputSchema: ResolveRangeArgs,
    outputSchema: z.object({ ranges: z.array(z.object({ start: z.string(), end: z.string() })).optional(), error: z.string().optional() }),
    execute: async (input) => {
      try {
        const { expr } = input as { expr: TimeExpr };
        const ctx = getCtx();
        const r = resolveIR(expr, {
          anchor: ctx.anchor,
          conventions: DEFAULT_CONVENTIONS,
          ...(ctx.customPresets ? { customPresets: ctx.customPresets } : {}),
          window: { backMonths: 12, forwardMonths: 18 },
        });
        return { ranges: r.intervals.slice(0, 60).map((iv) => ({ start: iv.start, end: iv.end })) };
      } catch (err) {
        return { error: String((err as Error).message).slice(0, 200) };
      }
    },
  });
}

/** Built per run-context: milestone bindings arrive via a closure (the harness rebuilds
 *  the agent's tools each hop with the current bindings). */
export function makeResolveRangeTool(getPresets: () => Record<string, TimeExpr>, getAnchor: () => string) {
  return createTool({
    id: 'resolve_range',
    description: 'Resolve a ScateLite time expression to a concrete half-open ISO range. Named milestones from this conversation are available as {type:"ref", id:"<name>"}. Notes: range.to is INCLUSIVE of its unit by default — for a boundary that should be excluded (e.g. "the 14 days starting X"), set endExclusive:true on the range. A milestone holding a window resolves to the whole range; to anchor on its last day use {type:"nth", n:"last", unit:"day", of:{type:"ref",...}}. Use this instead of computing dates yourself; then pass the result to query_range.',
    inputSchema: ResolveRangeArgs,
    outputSchema: z.object({ start: z.string().optional(), end: z.string().optional(), error: z.string().optional() }),
    execute: async (input) => {
      try {
        const { expr } = input as { expr: TimeExpr };
        const r = resolveIR(expr, {
          anchor: getAnchor(),
          conventions: DEFAULT_CONVENTIONS,
          customPresets: getPresets(),
          window: { backMonths: 12, forwardMonths: 18 },
        }, { requireShape: 'range' });
        return { start: r.intervals[0].start, end: r.intervals[0].end };
      } catch (err) {
        return { error: String((err as Error).message).slice(0, 200) };
      }
    },
  });
}

/** The hybrid boundary (DESIGN's stretch arm, now Task 7's fourth arm): one
 *  query_range whose time argument is EITHER concrete ISO or an unresolved expression
 *  resolved internally. The model chooses per call; the choice itself is measured. */
export function makeHybridQueryTool(getPresets: () => Record<string, TimeExpr>, getAnchor: () => string, opts: { stringExpr?: boolean; mode?: boolean; unionExpr?: boolean } = {}) {
  // string-expr variant: the expression travels as JSON TEXT and is parsed+validated
  // our side. Rationale: expression misuse is ~zero when models write the grammar as
  // text (the translation channel) and concentrated under function-calling constrained
  // decoding of the recursive OBJECT schema — so move generation to the text path.
  const inputSchema = opts.mode
    ? HybridModeArgs
    : opts.unionExpr
      ? HybridUnionArgs
      : opts.stringExpr
        ? z.object({
            start: z.string().optional().describe('ISO 8601 inclusive start — use with `end` when you already have concrete dates'),
            end: z.string().optional().describe('ISO 8601 exclusive end'),
            expr: z.string().optional().describe('a ScateLite expression as a JSON string, resolving to one contiguous range — use INSTEAD of start/end for the hard cases listed in the instructions; the tool parses and resolves it'),
          })
        : HybridQueryArgs;
  return createTool({
    id: 'query_range',
    description: 'Query business records for one contiguous half-open time range. Pass EITHER concrete ISO start+end (when you already have the dates), OR a ScateLite `expr` the tool resolves internally — prefer `expr` for the hard cases listed in the instructions. Named milestones from this conversation are available inside expr as {type:"ref", id:"<name>"}. Note: range.to is INCLUSIVE of its unit by default; set endExclusive:true to exclude a boundary. Returns a row count.',
    inputSchema,
    outputSchema: z.object({ status: z.string().optional(), rows: z.number().optional(), resolved: z.object({ start: z.string(), end: z.string() }).optional(), error: z.string().optional() }),
    execute: async (input) => {
      const { start, end, expr: rawExpr } = input as { start?: string; end?: string; expr?: unknown };
      let expr = rawExpr;
      if (typeof expr === 'string' && expr.trim()) {
        try { expr = JSON.parse(expr); } catch { return { error: 'expr is not valid JSON — send the expression as a JSON object string, e.g. {"type":"ref","id":"<milestone>"}' }; }
      }
      if (expr != null && typeof expr === 'object' && Object.keys(expr).length > 0) {
        const parsed = TimeExprThreadingSchema.safeParse(expr);
        if (!parsed.success) {
          return { error: `invalid expression: ${parsed.error.issues[0]?.message ?? 'unknown'} — every node (including nested base/from/to/of) must be a COMPLETE object with a "type"` };
        }
        try {
          const r = resolveIR(expr as TimeExpr, {
            anchor: getAnchor(),
            conventions: DEFAULT_CONVENTIONS,
            customPresets: getPresets(),
            window: { backMonths: 12, forwardMonths: 18 },
          }, { requireShape: 'range' });
          return { status: 'ok', rows: 42, resolved: { start: r.intervals[0].start, end: r.intervals[0].end } };
        } catch (err) {
          return { error: String((err as Error).message).slice(0, 200) };
        }
      }
      if (typeof start === 'string' && typeof end === 'string') return { status: 'ok', rows: 42 };
      return { error: 'provide either start+end (concrete ISO) or expr (a ScateLite expression)' };
    },
  });
}

/** Iteration variant "twin tools": expression queries get their OWN tool with a
 *  REQUIRED expression argument — the contract shape that was robust everywhere —
 *  while query_range stays ISO-only. One round-trip, no polymorphic fields. */
export function makeExprQueryTool(getPresets: () => Record<string, TimeExpr>, getAnchor: () => string) {
  return createTool({
    id: 'query_range_expr',
    description: 'Query business records for one contiguous half-open time range, specified as a ScateLite expression the tool resolves internally — use for the hard cases listed in the instructions. Named milestones from this conversation are available as {type:"ref", id:"<name>"}. range.to is INCLUSIVE of its unit by default; set endExclusive:true to exclude a boundary. Returns a row count.',
    inputSchema: ResolveRangeArgs,
    outputSchema: z.object({ status: z.string().optional(), rows: z.number().optional(), resolved: z.object({ start: z.string(), end: z.string() }).optional(), error: z.string().optional() }),
    execute: async (input) => {
      try {
        const { expr } = input as { expr: TimeExpr };
        const r = resolveIR(expr, {
          anchor: getAnchor(),
          conventions: DEFAULT_CONVENTIONS,
          customPresets: getPresets(),
          window: { backMonths: 12, forwardMonths: 18 },
        }, { requireShape: 'range' });
        return { status: 'ok', rows: 42, resolved: { start: r.intervals[0].start, end: r.intervals[0].end } };
      } catch (err) {
        return { error: String((err as Error).message).slice(0, 200) };
      }
    },
  });
}
