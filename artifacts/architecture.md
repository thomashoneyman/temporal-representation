# Handling time in agent systems: two recommended architectures

*Companions: `talk.md` presents these findings to a developer audience (slide-by-slide);
`guide.md` is the implementation handoff for adapting them to your own agent. This file is
the reference — the what and the why.*

*The synthesis of this repository's experiment, written as a design doc you can build
from. Every recommendation cites the measurement that decided it; the numbers come from
`results/summary.json` and the per-task pages (`results/*-viz.html`), where you can click
through to the underlying answers. Models measured: claude-haiku-4-5 and gpt-5.4-mini
(small, 3 repeats), claude-opus-4-8 and gpt-5.5 (frontier, 1 repeat).*

*Scope caveats: the design named one frontier model per provider including Gemini-3.5-flash;
Google was skipped (no API key), so this is a two-tier Anthropic + OpenAI read — four models
rather than three, minus Google. Latency was a stated dependent variable but is not separately
measured (only token cost is); where latency matters it is reasoned about structurally, not
benchmarked.*

## What the evidence says, compressed

1. **Models translate easy time well and hard time badly — and the line is now mapped.**
   Direct ISO is at or near ceiling on *specific dates* ("March 4"), *plain day-grain
   offsets* ("three days ago" — 88–94% across all four models once grain guidance is in
   the prompt), and *common named periods* at frontier. It loses, for every model, on
   **compound/filtered queries** ("past month, Tue–Thu, 8am–12pm"), **org-defined custom
   periods**, **business-day/holiday arithmetic** (half of all attempts missed a
   federal-holiday rule that was *stated in the prompt*), **bounded sets** ("weekends in
   March"), and **DST boundaries** (models copy the anchor's UTC offset onto dates in
   the other half of the year — a failure class that occurred in every model's ISO arm
   and is structurally impossible when code resolves).
2. **Classify-to-IR + deterministic resolution beats model-resolved ISO overall for
   every model we measured** (strict accuracy, all 139 questions, IR vs ISO: haiku 87
   vs 78, gpt-mini 88 vs 84, opus 94 vs 85, gpt-5.5 92 vs 84), with the margin concentrated
   in exactly the hard slices above. The weaker the model, the bigger the win.
3. **Conventions can only be truly pinned in code.** Documenting "last week = previous
   Mon–Sun" in the prompt lifts accuracy +1–5 points and converts the IR arm's
   alternative readings to exact — but the ISO arm keeps drifting (its conventions are
   baked into generation, not into an interpreter you control). Determinism across
   repeats: IR 85–86%, ISO 77–84%, and prompting the conventions did not reliably close
   that gap.
4. **A standalone date-arithmetic tool is not worth shipping.** Offered one, models used
   it in only 6–20% of eligible steps, and the cells with it never beat the same model's
   best arm without it (it was net-negative for three of four models). The resolve tool
   subsumes the arithmetic cases.
5. **In multi-step work, naming beats memory.** Across 1,128 graded conversation steps,
   not one attempt bound the wrong *named* milestone — even eight steps back, past
   distractor dates. What broke instead: implicit references ("when the trouble
   started"), window-edge business-day math, and stale values after a mid-conversation
   reschedule (largely fixed by phrasing the update cleanly).
6. **Tool error messages are load-bearing.** One unhelpful validation string ("Invalid
   input") cost a frontier model 4 of its 46 threading steps; rewriting it (what's
   wrong + a literal example) recovered them. Write tool errors for the model, not the
   developer.
7. **Models don't invent time, but they don't ask either.** "No time here" detection is
   essentially solved (≥80%, mostly 100%). Asking for clarification on genuinely
   ambiguous phrases is not: recall 38–71%. If clarification matters to your product,
   you must engineer it; you cannot prompt it into existence.

Two architectures follow. Pick by control flow: if time resolution can be an explicit
step, use A; if time is woven through free-form agent turns, use B. They share one
component — the resolver — and one principle: **the model classifies, code computes,
and ISO is the wire format between steps.**

---

## Architecture A — the pipeline (user question → retrieved data)

For structured workflows (data analysis, report generation, dashboard Q&A) where you
control the steps.

```
user question + anchor ("now")
   │
   ▼
[1] TRANSLATE (one LLM call, structured output)
      → { kind: "time" | "none",  value: <IR expression>,  ambiguity: 1–5,  reasoning }
   │
   ├─ kind = "none" ──────────────► run the query with no time filter
   ├─ ambiguity ≥ threshold ──────► ask the user (offer the default reading as a button)
   ▼
[2] RESOLVE (deterministic code — the resolver, no LLM)
      conventions + org-defined periods + window clamp → concrete ISO interval(s)
   │
   ▼
[3] VALIDATE (model-free guardrail: end<start, zero-length, offset, plausible window)
   │
   ▼
[4] EXECUTE: query/tool calls receive plain ISO — downstream code never sees the IR
```

Design decisions, with the evidence:

- **Classify everything to IR here, not just hard cases.** In a pipeline the IR costs
  one structured-output call you were making anyway (~1.2k extra input tokens for the
  injected grammar; $0.17/100 questions extra at small-model prices) and buys the hard
  slices, pinned conventions, and determinism. There is no per-tool latency argument
  against it because resolution happens once. This is where IR's 4–9 point overall
  lead lives (and far more on the hard slices alone).
- **The translate prompt needs exactly four things** (each measurably mattered):
  the anchor with its weekday spelled out; one grain-guidance sentence ("answer at the
  grain the question implies — a day-grain question gets a whole day"); your org's
  custom period definitions **with stable ids** the expression can reference (our
  early "IR adherence tax" was entirely a missing-ids bug); and the conventions block
  *only if you want the model's stated readings to match your resolver's* — resolution
  follows the resolver's conventions regardless.
- **Clarification is a threshold on the model's own ambiguity rating, not a behavior
  you request.** Models under-ask (recall ≤71%) but their self-rated ambiguity is
  usable signal: gate on `ambiguity ≥ 4`, and when you do ask, present the resolver's
  default reading as the accept-button — most "ambiguous" questions have a safe default
  the user will confirm.
- **No-time needs no special handling** beyond letting the model answer `kind: "none"`
  — that part is solved.
- **On a wrong or unresolvable expression**, return a repair-oriented error (name the
  bad node, show a literal correct example) and retry the translate call once. Measured
  effect of message quality alone: +5 points on a frontier model.

## Architecture B — the free-form agent (time woven through the conversation)

For general agents where any turn may contain time, references to earlier turns, and
tool calls — and you don't control the step sequence.

The question you actually face: *do I teach the main agent the IR, or keep it on ISO and
give it an escape hatch for the hard cases?* The honest answer from the data is sharper
than "teach a hard-case list": **what governs accuracy is the routing rate — how often
the model actually sends time through the resolver — and that is set by the default
instruction, not by the tool layout.** "Resolve by default" drove 93–100% routing and
the ceiling accuracy; "use the expression for the hard cases" left models under-routing
(gpt-mini as low as 1%), so the agent silently collapses to plain-ISO accuracy. None of
the contracts removes the model's choice — even the dedicated resolve arm's query tool
accepts ISO, so the model *could* self-compute; it routes because it is told to. The
implication: if you need the hard-category accuracy, make resolution the default and let
ISO be the exception, not the reverse. If plain-ISO accuracy is good enough for your
traffic (frontier model, easy slices), the ISO-default agent is fine and cheaper — just
know that a rarely-invoked "escape hatch" will, in fact, rarely be invoked.

We measured this directly and iterated the routing prompt (Task 8: Haiku, 30 single-window
items, same items under five policies). Answer accuracy: **always-ISO 63% · always-resolve
72% · light "prefer ISO" routing prompt 71% · tuned category-routing prompt 80%.** A naive
"prefer ISO, resolve the hard cases" prompt under-routes (delegates 53% of the items that
genuinely need the resolver). But **iterating the prompt fixes it**: stating the hard
*categories* explicitly (holidays, business-day/fiscal math, named periods, ranges, bare
day-of-month) lifts delegation of needs-resolve items to 80% and accuracy to 80% — matching
or edging always-resolve. So the model *can* be prompted to route. Two honest caveats:
(1) the tuned prompt reaches top accuracy by resolving aggressively (~70% of items), so the
surgical "ISO-mostly, delegate only the few hard ones" ideal trades some accuracy for fewer
tool calls — pick your point on that curve; (2) naming the hard *categories* is fair
guidance (it is the research finding), but naming the test items is not — our first tuned
prompt listed eval queries verbatim and inflated the numbers; the honest prompt uses
held-out examples behind a contamination guard. Practical rule: **a tuned category-routing
prompt works and is a valid alternative to always-resolve; if you want guaranteed accuracy
with no prompt-tuning risk, resolve by default, or make the routing deterministic in the
scaffold.** (`results/task8-viz.html`, `results/task8-readout.md`; drop-in eval at
`artifacts/routing-eval.json`.)

```
main agent (system prompt: anchor + grain sentence + conventions + the hard-case list)
   │
   ├── easy time, model is confident ──► tools take plain ISO {start, end}
   │                                      (validated at the boundary by the guardrail)
   │
   └── hard case (see list) ──► resolve tool: IR expression in → concrete ISO out
                                 (single range, or the full window list for compound
                                  queries) — agent then passes the RESOLVED ISO onward
```

Design decisions, with the evidence:

- **Why not IR-everywhere:** at frontier, direct ISO ties IR for tool arguments on easy
  steps (H3 held at frontier: gpt-5.5 ISO = IR in both threading and decomposition),
  and resolved values being *copied* between tools gain nothing from re-expression. The
  IR's win is on hard cases; route only those through it. (If your agent runs on a
  small/unknown model, shift the default toward the resolve tool — the IR contract won
  *everything* at small-model tier, +17 points on decomposition for the weakest model.)
- **The hard-case list to put in the system prompt** — "use resolve_range for:"
  business-day or holiday-aware arithmetic; org-defined periods (sprint, maintenance
  window, fiscal anything); compound/filtered windows (weekday/time-of-day filters);
  enumerating multiple windows for a one-range-per-call tool; anything anchored to a
  named earlier milestone; crossing a DST boundary. This list is the experiment's slice
  results restated as instructions.
- **The ISO escape hatch is part of the IR.** The grammar's `iso` leaf lets an already-
  resolved value (a prior tool result) thread through a larger expression ("3 business
  days after {iso: 2026-01-12}") without asking the model to re-derive it.
- **An expression channel works iff its shape is non-optional AND the grammar is
  visible in-band — the "either ISO or IR" hybrid is fine once you obey that law.**
  We iterated this contract through nine variants (schema wrappers, two encodings,
  prompt guidance with few-shot, a required mode-discriminator, twin tools, and
  grammar-inlining). The accuracy differences sit within their confidence intervals;
  the *channel behavior* is categorical and is the real finding:
  - **Optional object field** → GPT-family models emit degenerate `{}` (≈0 well-formed
    expressions in ~50 attempts across wrappers, guidance, and a mode discriminator):
    under strict function-calling they have no legal way to *skip* an optional object,
    so `{}` is the escape. Schema clarity and prompting did not fix it.
  - **String field with the grammar hidden** → models compose *complete but
    conventionally wrong* expressions (ISO half-open habits against an inclusive
    grammar — fenceposts everywhere).
  - **Required object field** (twin tools, or the dedicated resolve tool) → the
    advertised JSON schema *is* the grammar, so both conditions hold; both vendors
    route (28–70%) and compose correctly (73/74 well-formed in twin).
  - **String field with the grammar pasted into the prompt** → both conditions hold by
    other means; expression composition jumps to 35/35 correct, fenceposts gone.

  The two law-satisfying variants (a **required** object field; a **string carrying the
  grammar in-band**) were diagnostics to isolate the rule — twin tools, in particular,
  doubles the tool count per operation and is *not* a shape you would ship. The
  production answer is the dedicated **resolve-then-query** boundary: one shared resolve
  tool emitting ISO, feeding ISO domain tools. It obeys the same law (its advertised
  schema is the grammar; its expression argument is required) applied once centrally, it
  is the only contract with accuracy separation (90–100% for every model), and it scales
  — you add one resolve tool, not an IR variant of every tool. The single rule to carry
  out of the nine variants: **if an expression ever enters a tool, it must be a required
  argument with the grammar visible; the cleanest way to satisfy that is one shared
  resolve tool, not an expression argument sprinkled across your domain tools.**
- **Name milestones; rebind on update.** Have the agent (or your scaffold) give dates
  established mid-conversation stable names, available to the resolve tool as `ref`
  bindings. Zero of 1,128 steps mis-bound a named reference; implicit references are
  what fail. When a value changes ("the meeting moved"), restate the change explicitly
  — the stale-value failures we measured were phrasing-sensitive, not memory failures.
- **Validate every time argument at the tool boundary, both formats.** The model-free
  guardrail (end<start, zero-length, empty set, implausible window, DST offset
  mismatch) catches the ISO-only failure classes cheaply at sampling rate 1.0. Return
  blocking flags to the model as repair-oriented errors; log warnings.
- **Skip the standalone shift/arithmetic tool** (evidence point 4). If you already have
  the resolve tool, arithmetic is an expression.

### When you'd still choose differently

- **Latency-critical, frontier-only, easy-slice traffic:** plain ISO + the preset crib
  (precompute "last week"/"this quarter"/YTD into the prompt; +1–5 points, ~zero cost,
  no tool round-trip) may be all you need. Measure your traffic against the slice
  results before adding machinery.
- **You cannot ship a resolver:** then at minimum ship the guardrail validation and the
  conventions block, and expect the compound/custom slices to run 10–25 points below
  the rest.

---

## Appendix — Mastra-specific production notes

Everything in this repo that is liftable, and the sharp edges we hit wiring it.

**Reusing the pieces.** `src/scate-lite/` is the IR grammar + resolver + conventions
(no framework imports) — lift it whole. `src/scorers/production.ts` is the guardrail:
register `temporalSanityScorer` on your Mastra instance for log-only observability, or
call `checkTimeArgs` in tool middleware to gate/retry (both usages shown in
`src/scorers/README.md`). `src/datasets/` + `src/scorers/translation-scorers.ts` are
the model-swap eval: point `MODEL_*` env at a candidate model, `pnpm phase2 && pnpm
analyze`, and read the same leaderboard before switching.

**Structured output.** Use one mechanism for every model — we used
`structuredOutput: { schema, jsonPromptInjection: true }` — because provider-native
JSON schema support diverges exactly where this domain needs it: recursive schemas and
`oneOf` are rejected by some providers. Build the IR union with `z.union` (compiles to
`anyOf`), never `z.discriminatedUnion` (`oneOf`). Avoid `.optional()` without
null-tolerance for OpenAI strict mode — models emit explicit `null`s.

**Tools.** `createTool` + agent `tools: {...}` — the *registration key* (not the tool's
`id`) is what comes back as `toolName` in tool-call records; register under the id to
keep them aligned. Mastra validates tool input against your zod `inputSchema` *before*
`execute` and relays zod's message verbatim to the model — so attach a custom `error`
to the IR union; zod's default "Invalid input" is the unhelpful string that measurably
cost hops. Resolve-tool bindings (named milestones, org presets) arrive cleanly via a
closure or `requestContext`; rebuild the agent's tools per step with current bindings.

**Prompting details that mattered** (each is a measured effect, not taste): state the
anchor's weekday, not just the timestamp; include the grain-guidance sentence in *both*
arms or you'll measure grain mismatch and call it arithmetic failure; give org
definitions stable ids and state them; keep dataset phrasing out of every prompt
surface including schema `.describe()` strings (we caught three "teach-the-test" leaks
with a contamination test that greps rendered prompts+schemas against dataset queries —
worth replicating); stamp a `PROMPT_VERSION` hash of all prompt surfaces into every
logged row so results are never silently compared across prompt edits.

**Reasoning knobs.** Set per-model low-reasoning options explicitly
(`reasoningEffort`/`thinking` budgets differ per provider, and newer models may need
adaptive thinking flags). Reasoning models ignore `temperature` — determinism is
something you *measure* with repeats, never assume.

**Keeping the numbers honest in production.** Persist raw model outputs and re-score
offline (our `ANALYZE=1` pattern) so scoring fixes propagate without re-buying calls;
keep a consensus-against-key audit (multiple models agreeing on a "wrong" answer is
your best key-defect detector — it caught two real key bugs here); and commit smoke
fixtures with a replay check so any scoring drift fails CI.
