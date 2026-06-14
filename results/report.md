# Report — Temporal Representation in Agent Systems

*Rendered from `results/summary.json` (answer key v0.3, prompts 30b61a223a79). Every
number here is recomputable offline from the committed raw runs; `pnpm phase2:replay` verifies the
scoring pipeline against committed fixtures. Small models (haiku 4.5, gpt-5.4-mini) ran 3 repeats;
frontier models (opus 4.8, gpt-5.5) ran 1 repeat as a scale check — their numbers are noisier. The
self-contained visualizations (`results/*-viz.html`) carry the click-to-inspect detail behind every
claim.*

*Scope vs. the design: the plan named one frontier model per provider including Gemini-3.5-flash;
Google was skipped (no API key), so this is a two-tier Anthropic + OpenAI read (four models, minus
Google). Of the named dependent variables, accuracy / determinism / clarification / cost are reported;
latency is not separately measured (the harness recorded only cell-elapsed time) and is reasoned about
structurally where it matters.*

## The one-paragraph answer

Classifying time expressions into a small formal language and letting deterministic code compute the
dates (**IR**) matched or beat the model computing dates itself (**ISO**) for **all four models on
every task family we measured** — translation, prompted steering, multi-step threading, and
compound-query decomposition — with the margin largest for the weakest model and on the hardest
slices (compound, custom-defined periods). Contrary to the 2024–25 literature, plain day-grain date
*arithmetic* is no longer a failure mode at any tier once a one-sentence grain instruction is in the
prompt; what still fails is *calendar-table* arithmetic (business days across holidays), *DST offsets*
(an ISO-only failure class), and *expression construction* in the IR arm. The production shape we
predicted going in is largely confirmed, with one revision: a standalone arithmetic/shift tool earned no place
— models rarely used it voluntarily and it never improved their best arm.

## Objective 1 — what do models prefer for "last week"? (ungraded measurement)

29 phrases × 7 anchor positions, ungraded (`preferences-viz.html`): models overwhelmingly choose
**calendar-aligned, Monday-start** readings (e.g. "last week" = previous Mon–Sun) and **calendar
months** over 30-day windows; day-pinning ("a month ago" = same day-of-month, not nearest weekday) is
the dominant convention. Divergence concentrates in a handful of phrases ("the last few months",
"recently", "mid-March") — those became the steering targets for Task 5 and the documented-conventions
block. These preferences directly seeded our locked conventions, so "exact" in every graded task means
"matches the convention models themselves most often choose," not an arbitrary house rule.

## Objective 2 — date arithmetic (H1: "LLMs will be poor at it; defer to code")

**Prediction wrong at day grain, right at the edges.** The relative-dates slice (the arithmetic test):

| arm | haiku | gpt-mini | opus | gpt-5.5 |
|---|---|---|---|---|
| direct ISO | 88% | 91% | 94% | 91% |
| IR | 99% | 89% | 97% | 97% |

In our early prompt iterations the dominant "arithmetic" failure was not wrong math at all but a
*grain* mismatch (a minute-grain instant answering a day-grain question); one guidance sentence
("answer at the grain the question implies") removed that class in both arms, and the scoring rubric
separates it from real misses (right-time-wrong-precision, not wrong-date). The genuinely hard residue: business-day counting across federal
holidays (the Task-7 Christmas hop: half of all attempts missed the holiday rule), extreme magnitudes
("in 250 days"), and ordinal arithmetic — exactly the cases deterministic code resolves for free in
the IR arm. **Verdict on H1: defer the calendar-table cases to code; plain offsets no longer need it.**

## Objective 3 — classification accuracy by category (H2: "IR beats resolving to ISO")

**Confirmed for every model, with the margin where we predicted it.** Overall (strict; Wilson 95% CI):

| arm | haiku | gpt-mini | opus | gpt-5.5 |
|---|---|---|---|---|
| direct ISO | 78% [74–82] | 84% [80–87] | 85% [78–90] | 84% [77–90] |
| ISO + preset crib | 82% [78–85] | 85% [82–88] | 87% [79–92] | 89% [82–94] |
| IR (code resolves) | 87% [84–90] | 88% [84–91] | 94% [88–97] | 92% [86–96] |

Counting documented reasonable readings (within-acceptable):

| arm | haiku | gpt-mini | opus | gpt-5.5 |
|---|---|---|---|---|
| direct ISO | 95% [92–96] | 96% [94–97] | 96% [91–98] | 96% [91–98] |
| ISO + preset crib | 96% [94–97] | 95% [93–97] | 95% [90–98] | 96% [91–98] |
| IR (code resolves) | 96% [93–97] | 95% [93–97] | 98% [94–99] | 96% [92–98] |

Per-slice winner (best arm per model, strict):

| slice | haiku | gpt-mini | opus | gpt-5.5 | best arm |
|---|---|---|---|---|---|
| specific | 93% (iso-preset) | 98% (iso-preset) | 100% (ir) | 100% (iso) | iso-preset |
| relative | 99% (ir) | 91% (iso) | 97% (ir) | 97% (ir) | ir |
| named | 86% (ir) | 91% (ir) | 91% (iso-preset) | 96% (ir) | ir |
| custom | 86% (ir) | 97% (ir) | 100% (ir) | 100% (ir) | ir |
| ranges | 93% (ir) | 93% (ir) | 95% (ir) | 95% (ir) | ir |
| multipart | 74% (iso-preset) | 76% (iso) | 93% (iso) | 79% (iso) | iso |
| notime | 100% (iso) | 100% (iso) | 100% (iso) | 100% (iso-preset) | iso |
| ambiguous | 74% (ir) | 76% (iso) | 86% (ir) | 71% (iso) | ir |

The rule-based baseline (chrono) sits far below every model arm — the PRIMETIME finding reproduces.
IR's lead concentrates in **compound/multipart**, **custom presets**, and **ranges/sets**; on easy
slices ISO ties it. The 2-point IR "adherence tax" we measured early was OUR bug (missing ids in the
org-definitions block), not the representation's cost — after the fix, unresolvable IR is 0.0%.

## Objective 4 — multi-part questions driving tool calls (Tasks 7 & 7b; H3)

**H3 ("ISO tool params will be just as accurate as IR") holds only at frontier.** Threading (hop-exact
across 10 multi-step investigations): IR is the best arm for all four models (haiku 91% vs
88% ISO; opus 100% vs 89%). Decomposition (exact set of range-only calls
for compound queries): haiku 82% IR vs 65% ISO; gpt-5.5 ties (88% both). Structural findings:

- **Drift is hop-type-, not depth-concentrated**: with chain composition held constant, accuracy does
  not decay with step number; re-querying a step-1 date at step 8 is nearly perfect, and **zero**
  attempts ever bound the wrong *named* milestone. Implicit references and window-edge business-day
  math are what break.
- **Two failure classes exist only under the ISO contract**: DST zone-offset errors, and (small models
  only) collapsing a windowed query into one bounding range that sweeps in unasked time.
- **The stale-value trap is phrasing-sensitive**: with vague wording small models reused a rescheduled
  date in half the follow-ups; with a clean update, 46/48 attempts tracked it.
- **Tool feedback is part of the contract**: repairing one unhelpful validation message ("Invalid
  input") moved gpt-5.5's IR threading 91→96% — measured, not hypothetical.

## Objective 5 — determinism and clarification (Tasks 5 & 6)

Determinism (identical resolved output across 3 repeats, same prompt): unprompted ISO 77–84%,
IR 85–86%; adding the conventions block (prompted) moved haiku-ISO 77→83% but gpt-ISO 84→78% — and
steering converts IR's reasonable-alternative answers to exact while ISO's persist. **You can pin the
convention reliably via the IR's resolver; you cannot fully pin it via prompt.** Clarification: models
**under-ask** (recall 38–71% on genuinely-ambiguous items) but their asks are mostly warranted
(precision 50–80% after we fixed a metric artifact that counted correct no-time abstentions as false
positives). No-time detection is essentially solved (every cell ≥80%, most at 100%) — models do not
invent times for "who owns the billing service?".

## Cost (from recorded usage × list pricing, $ per 100 questions)

| arm | haiku | gpt-mini | opus | gpt-5.5 |
|---|---|---|---|---|
| iso | $0.40 | $0.07 | $1.16 | $0.98 |
| iso-preset | $0.46 | $0.08 | $1.43 | $1.15 |
| ir | $0.57 | $0.09 | $2.08 | $1.48 |

IR costs ~1.4–1.8× ISO per question (the injected grammar is ~1.2k extra input tokens) — at mini-tier
absolute prices (under a cent per question) the accuracy gain dominates; at frontier the crib arm is
the cost-efficient middle when IR's margin is small for that model.

## The Synthesis decision table, filled

| Technique | Adopt it when... | Verdict | Evidence |
|---|---|---|---|
| **Direct ISO, no tool** | the ISO arm already clears the accuracy + determinism bar on a slice | **ADOPT for the easy majority at frontier; insufficient alone** | Frontier ISO is strong on specific dates (opus 80%, gpt-5.5 100%) and — contrary to the 2024-25 literature — on day-grain arithmetic (relative slice: opus 94%, gpt-5.5 91%) once one grain-guidance sentence is in the prompt. But ISO never beats IR overall for ANY model (Task 4 ALL), trails on compound/custom slices, and is the only arm producing DST zone-offset errors (Task 7). |
| **Preset crib** | a precomputed preset measurably lifts a flaky-but-common case | **ADOPT, narrowly — cheap insurance, not a fix** | The crib lifts ISO +1..+5pt overall (Task 4: e.g. gpt-5.5 84→89%, opus 85→87%) and steering conventions in the prompt converts IR's reasonable-alternatives to exact while ISO's persist (Task 5). It never closes the ISO→IR gap. |
| **Resolve tool / tools accept a restricted IR** | IR beats ISO on a slice (custom presets, ranges/sets) | **ADOPT — the headline result** | IR leads or ties ISO for all four models on overall translation (Task 4 ALL: haiku 87 vs 78, gpt-mini 88 vs 84, opus 94 vs 85, gpt-5.5 92 vs 84), with the biggest margins exactly where predicted: compound/multipart and custom presets. It holds in tool-threading (Task 7: IR best cell for all four) and decomposition (Task 7b: haiku +17pt, opus 94% vs 88%). |
| **Arithmetic / shift tool** | the model's own arithmetic is below bar or drifts over hops | **SKIP as a standalone tool — fold arithmetic into resolve** | Day-grain arithmetic is no longer below bar with grain guidance (Task 4 relative slice ≥91% at frontier); the residual failures are business-day/holiday table arithmetic and extreme magnitudes. Offered a shift tool, models used it in only 6–20% of attempts and it was net-NEGATIVE or neutral in both threading (Task 7: haiku 80 vs 88 plain-ISO) and decomposition (Task 7b: every model's tool arm ≤ its plain-ISO arm at frontier). The resolve tool already subsumes the arithmetic cases. |
| **Tool contract: ISO vs shape-restricted IR** | ISO has significant threading/decomposition errors and a shape-restricted IR contract is better | **ADOPT IR-capable boundaries for weak/unknown models; ISO params acceptable at frontier** | H3 ("ISO params will be just as accurate") holds only at frontier (gpt-5.5: ISO ties IR in both Task 7 and 7b). At small-model tier the IR contract wins (Task 7 haiku 91 vs 88; Task 7b haiku 82 vs 65), the bounding-range collapse occurs ONLY under ISO contracts, and zone-offset (DST) errors are structurally impossible under the IR contract. Also measured: the tool's VALIDATION FEEDBACK is part of the contract (fixing one error message moved gpt-5.5's IR threading 91→96%), and iterated through nine hybrid-contract variants and found a sharp law: an expression channel works IFF its shape is non-optional AND the grammar is visible in-band. Optional object fields make GPT-family models emit degenerate {} (~0 well-formed in ~50 attempts); a string field with the grammar hidden yields fenceposts; a required object (schema IS the grammar) or a grammar-inlined string both work for every vendor (35/35 expressions correct in the string+grammar case). None beats resolve-then-query — the same law applied once at a central boundary — which remains the accuracy recommendation (90-100% for every model). |

## We predicted X, found Y

- *Predicted:* LLMs are poor at date arithmetic (H1). *Found:* poor only at calendar-table arithmetic
  and extreme magnitudes; day-grain offsets are solved with one prompt sentence. Defer the former to
  code; don't buy a tool for the latter.
- *Predicted:* IR classification beats direct ISO (H2). *Found:* confirmed for all four models, margin
  widest on compound/custom slices and for the weakest model.
- *Predicted:* ISO tool params would keep up with IR (H3). *Found:* true at frontier only; at small-model
  tier the IR contract wins threading and decomposition, and two ISO-only failure classes (DST offsets,
  bounding-range collapse) disappear under it.
- *Predicted production shape:* direct ISO for the easy majority + preset crib + resolve(IR→ISO) tool +
  shape-restricted boundaries. *Found:* confirmed, minus the standalone arithmetic tool (net-negative or
  unused everywhere we offered it), plus one addition we did not predict: **the resolve tool's
  validation-error text is load-bearing** — write it for the model, not the developer.
- *Predicted (stretch):* a tool accepting either ISO or the IR, model's choice, would obviate the dedicated
  resolve tool. *Found:* the hybrid is buildable but governed by a sharp law discovered through nine contract
  variants — the expression channel works **iff its shape is non-optional AND the grammar is visible in-band**.
  Optional object fields make GPT-family models emit degenerate `{}` (≈0 well-formed expressions in ~50
  attempts); a string field with the grammar hidden yields fencepost errors; a required object (its schema IS
  the grammar) or a string with the grammar inlined both work for every vendor. None beats the dedicated
  resolve-then-query tool — the same law applied once at a central boundary — which remains the recommendation.
