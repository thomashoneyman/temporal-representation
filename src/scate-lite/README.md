# `src/scate-lite` — the ScateLite IR + deterministic resolver

**Artifacts #2 (IR spec + resolver) and #3 (conventions).** This directory is a pure
TypeScript library — Luxon is its only dependency, it never reads the system clock, and it
has zero Mastra/framework imports. You can lift it into any project that needs to turn
natural-language-shaped time expressions into concrete ISO 8601 intervals.

## Why an IR at all?

LLMs are good at *classifying* time expressions ("a month ago" → a shift of one month back
from today) and bad at *computing* them (the actual date, especially across month/year
boundaries). `ScateLite` splits the job: the model emits a small expression tree, and a
deterministic resolver does the arithmetic. It is a trimmed, business-calendar descendant
of the SCATE annotation scheme: it keeps SCATE's load-bearing distinction between
**calendar-snapped** periods ("last week" = the prior Mon–Sun) and **duration arithmetic**
("30 days ago" = exactly 30 days), and drops everything business users never say.

## The grammar (10 model-facing nodes + 1 injection node)

| node | meaning | example |
|---|---|---|
| `now` | the anchor instant | "right now" |
| `date` | calendar date/time; missing fields widen the grain; bare dates resolve to an occurrence | "March 4", "2025", "March" |
| `preset` | a named business period (18 names) | "last week", "YTD" |
| `ref` | an org-defined custom preset, supplied in context | "our maintenance window" |
| `shift` | move a base by an ISO-8601 duration; calendar vs exact math | "3 days ago", "a month ago" |
| `weekday` | relative weekday, optional clock time | "next Tuesday", "Tuesday at 3pm" |
| `nth` | nth sub-unit of a period | "4th Thursday of November" (= Thanksgiving) |
| `range` | inclusive span, null bound = open | "March 1 through 4", "since March" |
| `filter` | bounded recurrence → a set | "weekends in March" |
| `union` | union of disjoint sub-expressions | "Q1 and Q3" |
| `iso` | **injection-only** — a concrete value from a prior tool result; excluded from the model-facing grammar so the IR arm can't just compute ISO itself | threading tasks only |

Holidays are deliberately **not** a node: fixed-date holidays are a `date`
(`July 4` → `date{month:7, day:4}`), rule-based ones are an `nth`
(Thanksgiving → `nth(4, 'thu', date{month:11})`). The resolver keeps an internal US-federal
holiday table only for business-day arithmetic (`shift … businessDays: true`).

## Files

| file | contents |
|---|---|
| `ir.ts` | The `TimeExpr` discriminated union + zod schema. The schema's `.describe()` strings double as the model-facing documentation. Exports the **core** profile (10 nodes, translation tasks) and the **threading** profile (+`iso`). |
| `iso.ts` | The `IsoValue` union (point / range / set) — the value language of the direct-ISO arm. |
| `resolver.ts` | `resolveIR(expr, ctx)` / `resolveISO(value, ctx)` → `Resolved` (cardinality + half-open intervals). The ground-truth engine; throws on unresolvable input. |
| `interval.ts` | Half-open interval ops + comparison metrics: equality, IoU, signed deltas, off-by-one detection, set precision/recall/F1, acceptable-set membership. |
| `calendar.ts` | Week starts, fiscal quarters, nth/last weekday-of-month, the 11 US federal holidays (actual dates, never observed-shifted), business-day stepping. |
| `conventions.ts` | **Artifact #3**: the locked interpretation defaults as a single object that is both resolver config and renderable prompt text (`renderConventions`). |
| `baseline.ts` | `chrono-node` adapter — the rule-based baseline arm. |

## The conventions (the defaults the resolver encodes)

Every genuinely ambiguous axis gets one documented, steerable default — held in
`ResolveCtx.conventions`, never hardcoded in the grammar or expected of the model:

- Weeks start **Monday**; "last week" = the prior whole Mon–Sun.
- Bare dates/holidays → **next occurrence** on/after the anchor (per-node `date.which` can override).
- Ranges are **end-inclusive by grain**: "March 1 through 4" includes all of the 4th.
- All intervals are **half-open `[start, end)`** internally.
- "A month ago" pins the day-of-month (calendar math); "30 days ago" is exact arithmetic.
- YTD/MTD/QTD include today as a whole day.
- Calendar quarters unless an org preset defines a fiscal year.
- Open-ended ranges clamp to a ±12-month window around the anchor.
- Timezone: America/New_York throughout; offsets carried, never converted.

## Usage

```ts
import { resolveIR } from './resolver.js';
import { DEFAULT_CONVENTIONS } from './conventions.js';

const ctx = {
  anchor: '2026-03-12T14:30:00-04:00',
  conventions: DEFAULT_CONVENTIONS,
  window: { backMonths: 12, forwardMonths: 12 },
};

resolveIR({ type: 'preset', name: 'last_week' }, ctx);
// → { cardinality: 'range', intervals: [{ start: '2026-03-02T00:00:00-05:00',
//                                          end:   '2026-03-09T00:00:00-04:00' }] }
//   (note the offset flip — that week crosses the spring-forward DST change)
```

## Guarantees

- Tested against a 40-case grammar smoke oracle and the experiment's full 116-item
  hand-verified answer key (`tests/`).
- Deterministic: same expression + same context → same intervals, always.
- Loud failures: unresolvable IR throws; it never silently guesses.
