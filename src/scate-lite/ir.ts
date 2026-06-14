/**
 * The `ScateLite` IR — the `TimeExpr` grammar.
 *
 * Two profiles:
 *  - CORE (10 nodes): what the model sees in the translation tasks. `iso` is excluded —
 *    including it would let the IR arm resolve dates itself, contaminating the
 *    classify-vs-compute comparison (H1/H2). The exclusion is enforced by schema,
 *    recursively: a nested `iso` fails core validation too.
 *  - THREADING (11 nodes): core + `iso`, only for the Task-7 stretch arm where a tool
 *    explicitly accepts "a restricted IR or ISO".
 *
 * The zod `.describe()` strings double as the model-facing grammar documentation —
 * they are part of the prompt surface, so edits to them are prompt changes.
 */
import { z } from 'zod';
import type { Weekday } from './calendar.js';
import type { Grain } from './interval.js';

export type PresetName =
  | 'today' | 'yesterday' | 'tomorrow'
  | 'this_week' | 'last_week' | 'next_week'
  | 'this_month' | 'last_month' | 'next_month'
  | 'this_quarter' | 'last_quarter' | 'next_quarter'
  | 'this_year' | 'last_year' | 'next_year'
  | 'ytd' | 'mtd' | 'qtd';

export type Occurrence = 'this' | 'next' | 'previous' | 'nearest';

export type TimeExpr =
  // ── leaves ──
  | { type: 'now' }
  | { type: 'iso'; start: string; end?: string } // VALUE-INJECTION ONLY (threading profile)
  | { type: 'date'; year?: number; month?: number; day?: number; hour?: number; minute?: number; which?: Occurrence }
  | { type: 'preset'; name: PresetName }
  | { type: 'ref'; id: string }
  // ── operators ──
  | { type: 'shift'; base: TimeExpr; by: string; direction: 'before' | 'after'; businessDays?: boolean }
  | { type: 'weekday'; day: Weekday; which: 'this' | 'next' | 'last' | 'nearest'; of?: TimeExpr; hour?: number; minute?: number }
  | { type: 'nth'; n: number | 'last'; unit: Grain | Weekday | 'business_day'; of: TimeExpr }
  | { type: 'range'; from: TimeExpr | null; to: TimeExpr | null; endExclusive?: boolean }
  | { type: 'filter'; within: TimeExpr; weekdays?: Weekday[]; businessDays?: boolean; timeOfDay?: { start: string; end: string } }
  | { type: 'union'; of: TimeExpr[] };

export const GrainSchema = z.enum(['minute', 'hour', 'day', 'week', 'month', 'quarter', 'year']);
export const WeekdaySchema = z.enum(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);
export const PresetNameSchema = z.enum([
  'today', 'yesterday', 'tomorrow',
  'this_week', 'last_week', 'next_week',
  'this_month', 'last_month', 'next_month',
  'this_quarter', 'last_quarter', 'next_quarter',
  'this_year', 'last_year', 'next_year', 'ytd', 'mtd', 'qtd',
]);

/** Build the recursive schema. `includeIso` selects the profile; the recursion closes
 *  over the SAME profile, so an `iso` nested anywhere inside a core value is rejected. */
function buildTimeExprSchema(includeIso: boolean, toolChannel = false): z.ZodType<TimeExpr> {
  // toolChannel: extra clarity for FUNCTION-CALLING surfaces only — an inline
  // description on every recursive slot and a named recursive definition. The
  // translation (final-answer) profile stays byte-identical so PROMPT_VERSION and the
  // graded translation runs remain comparable.
  const SelfBase: z.ZodType<TimeExpr> = z.lazy(() => schema);
  const Self: z.ZodType<TimeExpr> = toolChannel
    ? (SelfBase.describe('a COMPLETE nested TimeExpression object with its own "type" — never {} or a fragment') as z.ZodType<TimeExpr>)
    : SelfBase;

  const isoNode = z
    .object({ type: z.literal('iso'), start: z.string(), end: z.string().optional() })
    .describe('a concrete ISO value already in hand (e.g. a prior tool result); end omitted = instant');

  const members = [
    z.object({ type: z.literal('now') }).describe('the anchor instant (minute grain)'),

    ...(includeIso ? [isoNode] : []),

    z
      .object({
        type: z.literal('date'),
        year: z.number().int().min(1970).max(2100).optional(),
        month: z.number().int().min(1).max(12).optional(),
        day: z.number().int().min(1).max(31).optional(),
        hour: z.number().int().min(0).max(23).optional(),
        minute: z.number().int().min(0).max(59).optional(),
        which: z
          .enum(['this', 'next', 'previous', 'nearest'])
          .optional()
          .describe(
            "occurrence for a bare (yearless) date: 'this'=anchor's current cycle, 'next'/'previous'/'nearest' roll from the anchor. Omit to use the org default (ctx.conventions.datePolicy). Ignored when `year` is set.",
          ),
      })
      .describe('a calendar date/time; grain = least-significant field. Bare (no year) → occurrence per `which` or the org default.'),

    z
      .object({ type: z.literal('preset'), name: PresetNameSchema })
      .describe('a named business period; conventions resolved centrally'),

    z
      .object({ type: z.literal('ref'), id: z.string() })
      .describe('an org-specific preset defined in the prompt'),

    z
      .object({
        type: z.literal('shift'),
        base: Self,
        by: z.string().describe('ISO-8601 duration: P3D, P2W, P1M, PT30M …'),
        direction: z.enum(['before', 'after']),
        businessDays: z.boolean().optional().describe('skip weekends + holidays'),
      })
      .describe('move base by a duration; P1M/P1Y use calendar math (same day-of-month), P30D is exact'),

    z
      .object({
        type: z.literal('weekday'),
        day: WeekdaySchema,
        which: z.enum(['this', 'next', 'last', 'nearest']),
        of: Self.optional().describe('anchor period (default: now)'),
        hour: z.number().int().min(0).max(23).optional(),
        minute: z.number().int().min(0).max(59).optional(),
      })
      .describe('a relative weekday; optional clock narrows to a point'),

    z
      .object({
        type: z.literal('nth'),
        n: z.union([z.number().int().min(1).max(366), z.literal('last')]),
        unit: z.union([GrainSchema, WeekdaySchema, z.literal('business_day')]),
        of: Self,
      })
      .describe("nth sub-unit of a period: nth(4,'fri', date{month:1}) = the 4th Friday of January; nth('last','business_day', this_month)"),

    z
      .object({
        type: z.literal('range'),
        from: Self.nullable(),
        to: Self.nullable(),
        endExclusive: z.boolean().optional()
          .describe('set true when `to` is a boundary NOT included: "the prior 5 days" = range(shift(today,P5D,before), today, endExclusive:true)'),
      })
      .describe('range; by default `to` is INCLUSIVE of its whole unit — range(date{month:1}, date{month:3}) = Jan 1 through Mar 31. For an excluded endpoint set endExclusive. Clock-time ends (hour/minute grain) are always exclusive. null bound = open ("from April onward")'),

    z
      .object({
        type: z.literal('filter'),
        within: Self,
        weekdays: z.array(WeekdaySchema).optional(),
        businessDays: z.boolean().optional().describe('keep only business days (workweek minus US federal holidays)'),
        timeOfDay: z
          .object({ start: z.string(), end: z.string() })
          .optional()
          .describe('"HH:MM" half-open clock window'),
      })
      .describe('bounded recurrence → a set: keep weekdays / clock window inside `within`'),

    z
      .object({ type: z.literal('union'), of: z.array(Self) })
      .describe('union of sub-expressions → a set (disjoint named things)'),
  ];

  // z.union (not discriminatedUnion): must compile to `anyOf`, never `oneOf` — OpenAI's
  // response_format rejects `oneOf` anywhere (probe-verified).
  // The custom error replaces zod's bare "Invalid input": it is relayed verbatim to the
  // model on a failed tool call, and "Invalid input" gave models nothing to repair with
  // (measured: gpt-5.5 sent of:{}, got the bare message, and abandoned the hop).
  const schema = z.union(members as never, {
    error: 'not a valid node — every node needs a "type" (e.g. {type:"ref",id:"<milestone>"}); omit optional fields like "of" entirely instead of passing {}',
  } as never) as unknown as z.ZodType<TimeExpr>;
  return schema;
}

/** CORE profile — translation tasks (2/4/5/6). No `iso`, recursively. */
export const TimeExprSchema = buildTimeExprSchema(false);

/** THREADING profile — tool-channel surfaces (Tasks 7/7b). Core + `iso`, with the
 *  tool-channel clarity decorations (named recursive def, described slots). */
export const TimeExprThreadingSchema = buildTimeExprSchema(true, true).meta({
  id: 'TimeExpression',
  description: 'A time expression node. EVERY node — including every nested base/from/to/of — is an object with a "type" field. Never send {}.',
}) as z.ZodType<TimeExpr>;
