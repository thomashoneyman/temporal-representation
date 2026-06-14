# Guide: taking this repo into your own data-analysis agent

*A handoff for the engineer (or coding agent) who will adapt this research into a real
product. It assumes you've skimmed `artifacts/architecture.md` (the what/why) and treats
this as the how. Goal: a time-handling layer for your agent, customized to YOUR model and
YOUR business calendar, with an eval you can re-run.*

The repo's findings are real but they are **ours** — our 8 categories, our conventions, our
two vendors, our holidays. Don't copy the conclusions blind; the value is the *method* plus
the *liftable code*. This guide is the order of operations.

---

## 0. Decide which architecture you're building

- **Pipeline** (user question → resolve → query, you control the steps; most BI/dashboard
  agents): you will *always resolve*. Simplest and most accurate. Most readers want this.
- **Free-form agent** (time appears mid-conversation, interleaved with other tools): you'll
  run ISO-by-default with a resolve tool for the hard categories, routed by a prompt.

Everything below applies to both; the free-form-specific steps are marked **[agent]**.

## 1. Lift the spine (framework-agnostic)

Copy `src/scate-lite/` wholesale — it has zero framework imports:
- `ir.ts` — the `TimeExpr` grammar (the small SCATE-like language the model emits).
- `resolver.ts` — turns a `TimeExpr` into concrete ISO intervals.
- `conventions.ts` — the documented defaults (week start, "a month ago", range bounds, …).
- `calendar.ts` / `interval.ts` — holiday table, business-day math, half-open intervals.

Also copy `src/scoring/` (pure scoring functions) and `src/scorers/production.ts` (the
model-free guardrail). None of these depend on Mastra.

## 2. Customize the conventions to your domain

Open `conventions.ts`. Every field is a real fork where teams disagree. Change the defaults
to YOUR business calendar **before** you build the answer key:
- `weekStart`, `weekDefinition` — does "last week" mean Mon–Sun or your fiscal week?
- `fiscalYearStart` — calendar quarters, or your fiscal Q1?
- `monthAgo` (pin-day vs 30-day), `rangeBounds` (inclusive vs half-open), holiday set.

If your org has custom periods ("the maintenance window", "the current sprint"), add them as
`customPresets` (named `ref`-able expressions). The conventions object is *also* renderable
prompt text (`renderConventions`) — the same defaults you encode in code, you put in the
prompt so the model's stated readings match.

> Why this first: "correct" is defined by these. Get them wrong and every downstream number
> is measuring the wrong thing.

## 3. Build a dataset for YOUR queries

Don't reuse our 139 items verbatim — they're tuned to probe *our* hypotheses. Take the
*shape* (`src/datasets/cases/`): 8 categories, seed-relative anchors, a hand-labeled sample
to trust the key independent of the resolver. Populate them with the time expressions your
users actually send (mine your logs). Keep two rules we learned the hard way:
- **Seed-relative**: vary the anchor so answers can't be memorized.
- **No dataset phrasing in any prompt or schema description** — we grep rendered prompts
  against the dataset to enforce this (`tests/prompt-parity.test.ts`); replicate it. It is
  astonishingly easy to leak the test into a routing prompt or a `.describe()` string.

## 4. Find what's hard for YOUR model (don't trust our hard-list)

Our hard categories (holidays, business-day math, named periods, ranges, DST) are a strong
prior, but hardness is model- and domain-specific. Measure it:
1. Set `MODEL_*` in `.env` to your model.
2. `pnpm phase2` then `pnpm analyze` — graded accuracy per category, ISO vs IR, for your model.
3. Read `results/summary-viz.html`. The categories where ISO trails IR are *your* hard set.

For the free-form agent, also derive the routing hard-set empirically: run the Task-8
bookends (`TASK8_CONDITIONS=iso,resolve pnpm task8`) — the runner reports the items where
your model's direct ISO fails and the resolver fixes them. Those are the cases routing must
catch.

## 5. Wire the architecture

**Pipeline:**
```
question + anchor → [LLM: classify to TimeExpr] → resolveIR(expr, conventions, customPresets)
                  → checkTimeArgs(guardrail) → query(ISO)
```
Prompt the classifier with: the anchor *and its weekday*; one grain-guidance sentence; your
custom-period definitions *with stable ids*; (optionally) the conventions block.

**[agent]:** offer your domain tools with **ISO** arguments, plus ONE `resolve(IR)→ISO` tool
whose expression argument is **required** (never an optional ISO-or-IR field — that breaks
GPT-family models). System prompt carries the anchor, grain sentence, conventions, and the
**routing hard-list from step 4**, phrased by category (e.g. "use resolve for holidays,
business-day/fiscal math, named periods, ranges"). Use held-out examples, not your eval
items.

Reference implementations: `src/mastra/tools.ts` (the tools), `src/harness/task8.ts` (the
routing prompts that worked, including the contamination guard).

## 6. Add the guardrail

Register `temporalSanityScorer` (or call `checkTimeArgs` directly in tool middleware). Start
**log-only** — watch your real-world flag rate in observability for a week. Then promote to a
retry guardrail: on a blocking flag (end<start, zero-length, empty set), return the actionable
message to the model and retry once. Tune `outside-window` to your traffic's time range.
Remember its limit: it catches malformed/implausible, not wrong-but-plausible — the resolver
is what prevents the latter.

## 7. Eval, and keep evaling

- Commit smoke fixtures + a replay check (`pnpm fixtures:record` / `pnpm phase2:replay`) so a
  future scoring or key change fails CI instead of silently shifting your numbers.
- Re-run `pnpm phase2 && pnpm analyze` whenever you consider a new model — that's your
  model-swap decision, with data.
- Keep the consensus-against-key audit pattern (`pnpm audit:consensus`): if several models
  agree on an answer your key calls wrong, your key is probably wrong — adjudicate before
  trusting the eval.

## 8. Drop-in shortcuts

- `artifacts/routing-eval.json` — a self-contained routing eval (cases, anchors, expected
  windows) you can point at your model immediately.
- `artifacts/datasets/temporal-*.json` — our dataset as JSON, if you want a starting corpus
  to edit rather than author from scratch.

---

## The five things not to re-learn the hard way

1. **Make the resolve tool's expression argument REQUIRED.** Optional → GPT emits `{}`.
2. **Put the grammar where the model can see it** (a required-object tool schema does this
   for free; a string argument needs the grammar pasted into the prompt).
3. **Write tool validation errors for the model** (what's wrong + an example), not the dev.
   One message rewrite moved threading accuracy 91→96%.
4. **One grain-guidance sentence** removes most of what looks like "bad arithmetic."
5. **Never leak dataset items into prompts/schemas** — grep to enforce it; it invalidates the
   eval and we caught ourselves doing it twice.

## When you're done, you should be able to say

- "For my model and my calendar, categories A/B/C are where ISO fails and the resolver wins."
- "My agent resolves the hard categories and self-computes the rest, validated at the tool
  boundary, and I can re-prove that with one command."
- "If I swap models, I re-run the eval and the leaderboard tells me what changed."
