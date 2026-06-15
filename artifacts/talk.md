# Talk: Giving data-analysis agents a reliable sense of time

*The showable slide deck generated from this script is `talk/index.html` (run `npm run talk`;
arrow keys to present, **N** for speaker notes). This file is the long-form script behind it —
same arc, with the concrete Q&A examples and the Mastra appendix spelled out.*

*Audience: developers building data-analysis / BI agents that must turn user time expressions
into the dates a query needs. Numbers are from this repo (small: claude-haiku-4-5,
gpt-5.4-mini, 3 repeats; frontier: claude-opus-4-8, gpt-5.5, 1 repeat; Anthropic + OpenAI;
Gemini was in scope but skipped for lack of a key). Arc: **measurements → the existing ISO
research → the ScateLite hypothesis → results → proposed architectures.***

---

## 0. The seam

A user says "utilization last quarter, weekdays only." Somewhere that becomes
`ts >= '2026-01-01' AND ts < '2026-04-01' AND dow IN (1..5)`.

> Every data-analysis agent has this seam. The whole talk is one question: should the
> *model* produce those dates, or should *code*?

---

# Part 1 — Measurements (what models actually do)

Before grading anything, measure the models' *default* behavior, ungraded — so the answer
key encodes their own conventions, not a house style. (29 phrases × 7 anchor dates.)

## 1.1 Models silently disagree on what words mean

Real Phase-1 example — "this week," asked on a Sunday:

```
"this week"   model → Apr 19 → Apr 26   (Sunday-start week)
              key   → Apr 13 → Apr 20   (Monday–Sunday)
```

> There is no single right answer until you pick conventions. Unprompted, models split on
> week start, on "a month ago" (same day last month vs exactly 30 days), and on whether
> periods are calendar-aligned or rolling.

## 1.2 What they converge on → our locked conventions

- "last week" = the previous **Monday–Sunday**
- "a month ago" = the **same day-of-month** last month (not 30 days)
- periods are **calendar-aligned**, not rolling N-day windows

> Encoding these in code loses nothing the models wanted — they're the models' own majority
> readings. Divergence concentrates in a few phrases ("the last few months", "recently",
> "mid-March"), which become the cases worth stressing and the clarification candidates.

---

# Part 2 — The existing ISO research

## 2.1 The literature disagrees with itself

- **Test of Time (2025):** ~90% extracting times, but **40–50%** adding/subtracting dates,
  **~15%** on durations.
- **PRIMETIME (2026):** frontier models **90–98%** translation, 85–100% on "+250 days".

> Fine, or terrible? Depends on the slice and the model — and nobody mapped it for
> business-calendar questions.

## 2.2 The weakness is real (reproduced, direct-ISO)

```
"400 days from now"     model → Oct 10 2026   key → Oct 20 2026   (off by 10 days)
"in 3 business days"    model → Dec 1 2025    key → Dec 2 2025    (asked before Thanksgiving)
```

> Large offsets drift; business-day counting trips on holidays. Hold that thought — a chunk
> of the literature's "bad arithmetic" turns out to be something else (Part 4).

---

# Part 3 — The ScateLite hypothesis

If models are shaky at *producing* dates, have them **classify** the time into a small
formal language and let deterministic code **resolve** it.

## 3.1 Same question, two jobs — "weekends in March"

```
ISO arm — the model must hand-produce all 9 ranges (one crosses the DST change):
  2026-03-01T00:00−05:00 → 03-02 … 2026-03-08T00:00−05:00 → 03-09T00:00−04:00 … (9 total)

IR arm — the model emits one expression; code expands it:
  { type:"filter", within:{ type:"date", month:3 }, weekdays:["sat","sun"] }
```

> ScateLite is a small SCATE-like grammar (dates, presets, offsets, nth-of, ranges, filters,
> grains). The resolver owns the conventions and the holiday/DST tables. Hypothesis:
> *classifying* is easier and safer than *resolving*.

## 3.2 Three arms, graded against a hand-verified key

- **ISO** — model computes the dates itself
- **ISO + crib** — same, plus a cheat sheet of precomputed common periods
- **IR** — model emits ScateLite; code resolves

> Every item seed-relative (answer depends on "today" → nothing memorized). The crib arm
> tests whether more reference anchors alone close the gap (they don't).

---

# Part 4 — Results

## 4.1 Headline: classify-to-IR wins for every model

| | haiku | gpt-mini | opus | gpt-5.5 |
|---|---|---|---|---|
| ISO (model computes) | 78 | 84 | 85 | 84 |
| IR (code resolves) | **87** | **88** | **94** | **92** |

> Never loses overall. Biggest margin on the hard categories and the weaker model; on easy
> traffic ISO ties. Holds across translation, multi-step conversations, and compound queries.

## 4.2 The cliff, with examples

```
"the week of July 4th"            model → Jun 28 → Jul 5   key → Jun 29 → Jul 6  (week start)
"compare this month to last month" model → May 1 → May 31  key → May 1 → Jun 1   (inclusive vs half-open)
```

> Direct ISO loses, for every model, on: named periods & holidays (+13 to +26 for IR),
> company-defined periods, business-day math, ranges/sets.

## 4.3 An ISO-only failure class — DST

```
"the quarter so far (Oct 1 → now)"   model → Oct 1 2026 00:00 −05:00
                                     key   → Oct 1 2026 00:00 −04:00   (opus, ISO arm)
```

> October is EDT (−04:00); the model copied the anchor's winter offset, shifting the window
> an hour. Zone-offset errors appear only when the model writes timestamps — **impossible**
> once code resolves.

## 4.4 The arithmetic myth

One sentence — "answer at the grain the question implies" — took day-grain arithmetic to
**88–94%** across all models. The literature's failures largely reproduced as a *grain*
mismatch (a one-minute instant for a whole-day question), not wrong math.

> What genuinely stays hard: business-days across holidays, extreme magnitudes. A standalone
> arithmetic tool was used 6–20% of the time and never beat the resolver — **skip it.**

## 4.5 How a tool should accept time (the contract law)

**An expression argument works iff (a) its shape is non-optional AND (b) the grammar is
visible in-band.** (Nine contract variants.)

- **Optional** expression field → GPT-family emit degenerate `{}` (~0 well-formed in ~50 tries).
- **String, grammar hidden** → right idea, wrong conventions (fenceposts).
- **Required object** (schema = grammar) → works for every vendor.

> Ship one shared `resolve(IR)→ISO` tool with a *required* expression argument, feeding
> ISO-only domain tools. Don't sprinkle an optional "or pass an expression" field — silent
> foot-gun, especially on OpenAI models.

## 4.6 Can the agent route itself? (with the right prompt)

| policy | accuracy |
|---|---|
| always ISO | 63% |
| always resolve | 72% |
| tuned routing prompt | **80%** |

> A naive "prefer ISO, resolve the hard ones" prompt under-routes. A category-explicit
> prompt lifts hard-case delegation to ~80% and matches always-resolve — without naming any
> test item (we caught and removed that cheat; see the appendix). Caveat: it reaches top
> accuracy by resolving aggressively, so the surgical "ISO-mostly" ideal trades a few points
> for fewer tool calls.

---

# Part 5 — Proposed architectures

**Model classifies · code computes · ISO on the wire.** Two shapes:

- **Pipeline** (you control the steps): classify → resolve → validate → query. Always
  resolve. Highest accuracy. Most BI agents.
- **Free-form agent**: ISO by default for explicit dates; a *required-argument* resolve tool
  for the hard categories, routed by an explicit category list in the system prompt.

Plus: a preset crib for latency-critical easy traffic; a model-free guardrail on every tool
call (end<start, zero-length, DST-offset, implausible window); **skip** the arithmetic tool.

### What it buys you
- Hard categories: 10–25 points behind → solved.
- DST-offset and bounding-range failures → structurally impossible.
- Conventions pinned in code, not re-litigated each call.
- Model-swap becomes a measurement: re-run the eval, read the leaderboard.

> Full decision table — adopt / skip / when — in `results/overview-viz.html` and
> `artifacts/architecture.md`, every row cited to a measurement.

---

## Appendix — implementing this in Mastra (evals, scorers, the sharp edges)

*For the engineers who'll build it. Everything here is in the repo; `artifacts/guide.md` is
the full handoff.*

**Lift as-is.** `src/scate-lite/` (grammar + resolver + conventions, no framework deps) is
the spine. `src/scorers/production.ts` is the model-free guardrail. `src/datasets/` +
`src/scorers/translation-scorers.ts` are the model-swap eval.

**Eval before you trust a model.** Point `MODEL_*` env at a candidate, `npm run accuracy`,
`npm run analyze`, read the leaderboard. `npm run routing` answers "will it route its own time
questions" for the free-form-agent shape.

**Two scorer kinds, two jobs.** Eval graders (`exactISO`/`exactIR`) need ground truth —
dev-time, for `runEvals` and model-swap. The production guardrail (`temporalSanityScorer` /
`checkTimeArgs`) is model-free, runs on live traces at sampling 1.0: log-only first, then
retry-on-blocking-flag. It catches malformed/implausible windows, **not** wrong-but-plausible
ones — which is exactly why the resolver, not after-the-fact checking, is the real fix.

**Mastra sharp edges (each cost real accuracy until fixed).**
- Structured output: one mechanism for all models (`jsonPromptInjection`). Build the IR union
  with `z.union` (→ `anyOf`); `z.discriminatedUnion` emits `oneOf`, which some providers
  reject. Don't use bare `.optional()` on a recursive expression argument — make it required.
- Tool errors are part of the contract: Mastra relays your zod error verbatim to the model.
  Replace "Invalid input" with an actionable message + example — one such fix moved threading
  accuracy 91→96%.
- `createTool` registration key (not `id`) is what shows up as `toolName` in traces — register
  under the id so trajectory parsing lines up.
- Reasoning models ignore `temperature`; measure determinism with K repeats.

**Keep the numbers honest** (these caught real bugs): persist raw output and re-score offline;
keep a consensus-against-key audit (models agreeing on a "wrong" answer = likely key bug);
commit smoke fixtures with a replay check; and **never put dataset phrasing in a prompt or a
schema description** — grep rendered prompts against the dataset to enforce it (it caught three
leaks here, including one in a routing prompt).
