# Task 8 readout — routing discrimination ("prefer ISO, delegate only the hard cases")

**Question.** A free-form agent ideally answers easy times directly in ISO (fast, cheap)
and reaches for the resolve(IR) tool *only* where it struggles. The production deliverable
is a **routing prompt the model actually follows** — so the work is to iterate the prompt
until routing is good, not merely to observe that a naive prompt under-routes.

**Setup.** 30 single-window questions, single-turn Haiku agent with two tools —
`query_range` (ISO) and `resolve_range` (IR→ISO). We score, per item: which path it took
(did `resolve_range` appear in the trajectory?) and whether the resulting window matches
the resolver-derived key (pure interval equality, no LLM judge). Five conditions on the
*same* items, K=3: two bookends (force-ISO, force-resolve) and three routing prompts.

## Result (contamination-free prompts — see the guard note below)

| policy | answer accuracy | resolve-rate | recall on needs-resolve |
|---|---|---|---|
| always ISO (compute every date) | 63% | 0% | — |
| always resolve (every date via IR) | 72% | 99% | — |
| routing v1 — light "prefer ISO, resolve hard categories" | 71% | 24% | 53% |
| **routing v2 — explicit category triggers + ISO whitelist** | **80%** | 71% | 80% |
| routing v3 — resolve-by-default, ISO for explicit dates | 73% | 63% | 80% |

"needs-resolve" is empirical: the 5 items where always-ISO failed AND always-resolve fixed
it (derived from this run's own bookends — *not* the original hard labels; many label-hard
items the agent computes fine by hand, e.g. "Christmas" → Dec 25–26).

## What it means

1. **Yes, the model can be prompted to route the hard categories.** Iterating the prompt
   lifted recall on the items that genuinely need the resolver from 53% (v1) to 80% (v2/v3),
   and accuracy from 71% to 80% — at or above always-resolve (72%). Telling the agent the
   hard *categories* (holidays, business-days, fiscal periods, named periods, ranges) is
   legitimate product guidance derived from the research, and it works.
2. **The light-touch "ISO-mostly" ideal is only partly reachable.** v2 reaches top accuracy
   by resolving aggressively (71% resolve-rate; it over-resolves 65% of the ISO-fine items).
   The genuinely selective prompt (v1, 24% resolve-rate) under-delivers (71% ≈ a bit over
   always-ISO). v3 is the middle ground (73% at 63% resolve). So you can have *accuracy* or
   *few tool calls*, and the surgical "only the truly hard ones" sweet spot is not cleanly
   achieved at this tier — to maximize accuracy the model ends up resolving most things.
3. **Production reading.** If accuracy is the goal, a tuned category-routing prompt matches
   always-resolve and is a fine choice; if you also want to save tool calls, expect to give
   some accuracy back, or make the routing deterministic (resolve the known-hard categories
   in the scaffold rather than via model judgment).

## The tuned routing prompt (the deliverable, v2)

Category triggers only — **no eval item is named**; every example is held out from the test
set, and a module-load contamination guard asserts no eval query string appears in any
routing prompt (the same "can't teach the test" standard used elsewhere in this repo).

```
You answer each time question by calling exactly one tool with the range [start, end) it asks for. First decide the path:
USE resolve_range(expr) — it resolves a ScateLite expression to ISO for you — if the question involves ANY of:
  • a named holiday whose calendar date must be looked up (e.g. Veterans Day, Juneteenth, New Year's Day)
  • a named calendar period or its boundary (a week, a month, a fiscal quarter, year-to-date)
  • business days, or any fiscal-calendar period
  • a range or open-ended span (a window between two dates, a rolling multi-day window, an open "since"/"through")
  • a bare day-of-month, or date arithmetic beyond a plain whole-day offset
COMPUTE the ISO yourself and call query_range ONLY when the question is a fully explicit
calendar date / clock time (e.g. "July 9", "3/22", "2pm on the 8th") or a simple whole-day
offset (e.g. "in 5 days", "2 days ago").
If you are not sure, use resolve_range. Call exactly one path per question.
```

## On cheating the test (we caught one)

The first version of v2 listed actual eval items as trigger examples ("Christmas",
"Labor Day", "since March", "the last 7 days", "December 25", …) — verbatim test queries
the model could string-match. That is teaching the test and it inflated v1/v3 (v1 76→71,
v3 79→73 once cleaned; v2 held at 80). The fix: triggers are stated by *category* with
*held-out* examples, enforced by a contamination guard (`src/harness/task8.ts`) that throws
if any eval query appears in a routing prompt. Naming the hard categories is fair (it is the
research finding); naming the test items is not.

## Frontier comparison (Opus 4.8, single-repeat scale check)

| policy | Haiku (small, K=3) | Opus 4.8 (frontier, K=1) |
|---|---|---|
| always ISO | 63% | 77% |
| always resolve | 72% | 93% |
| routing v1 | 71% | 97% |
| routing v2 | 80% | 80% |
| routing v3 | 73% | 90% |

Two findings hold at frontier: the base task is markedly easier (always-ISO 63%→77%),
and **the resolver still clearly earns its place** — always-resolve beats always-ISO by
16 points (93% vs 77%) even on the stronger model.

**Do NOT read a per-tier prompt preference into this** (e.g. "v1 is better for frontier,
v2 for small models"). That is reading single-draw noise. The frontier column is K=1, so
each cell has a wide interval: opus route-v1 29/30 = 97% [83–99] and route-v2 24/30 = 80%
[63–91] **overlap**, so they are statistically indistinguishable — and there is no
mechanism by which a more-explicit routing prompt would *hurt* a stronger model. Even the
small-model ordering is soft (Haiku v2 80% [70–87] vs v1 71% [61–79] overlap). The honest
reading is "any reasonable category-routing prompt lands high at both tiers, and the
resolver still helps," not a re-ranking of the variants. Settling whether the best routing
prompt truly differs by tier would need ≥K=3 on the frontier model (and may still not
separate at n=30). The prompt-iteration conclusion rests on the small-model K=3 run; the
frontier run is a one-repeat scale check.

## Caveats

Haiku only (labels and needs-resolve set are Haiku's); K=3, n=30, 5 needs-resolve items —
read the policy ordering and the recall jump (53%→80%), not the decimals (top rows are
within confidence intervals). Hardness labels in `routing-eval.ts` come from single-shot
Task 4; the runner re-derives needs-resolve from this run's bookends, so the analysis does
not depend on the stale labels.

## Re-deriving for another model

Run the bookends (`TASK8_CONDITIONS=iso,resolve`) for the new model; the runner reports
its needs-resolve set (items where its ISO fails and resolve fixes). Re-run the routing
prompts against it. `artifacts/routing-eval.json` is the self-contained drop-in set.
