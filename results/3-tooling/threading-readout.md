# Task 7 readout — multi-step threading & drift

**Run:** 10 chains (46 hops) × {ISO, ISO+shift-tool, IR, hybrid} × (2 minis × 3 reps +
2 frontier × 1 rep) = 1504 graded hops, zero harness failures. Hop keys are
resolver-derived from canonical expressions over named milestones; rows are re-scored
from stored args whenever keys/rubric change.

## The design, and why it got hardened mid-task

The original 6 chains (24 hops) were cooperative: every later reference *names* its
milestone ("…before **the review**"), depth ≤5, no state changes — and the conversation
transcript itself acts as an external memory (in the ISO arm, the model's own earlier
answers are visible). Result: ~flat drift, 95–97% ISO. The staff-engineer challenge
("are we asking hard things?") produced 4 hardened chains: **implicit references**
("when the trouble started"), a **mid-chain reschedule** (the stale-value trap),
**distractor dates**, and **depth 8**.

## Findings (re-scored, final wave, all four models)

Strict-correct per hop (within-acceptable in parens):

| arm | haiku | gpt-5.4-mini | opus 4.8 | gpt-5.5 |
|---|---|---|---|---|
| ISO (computes itself) | 88% (89) | 87% (89) | 89% (91) | 94% (94) |
| ISO + shift tool | 80% (83) | 87% (91) | 87% (89) | 94% (96) |
| IR (resolve tool + milestone refs) | **91% (94)** | 90% (92) | **100% (100)** | **96% (96)** |
| hybrid (one tool, either format) | 88% (89) | **91% (94)** | 91% (94) | 83% (83) |

(The hybrid row is the plain-optional polymorphic contract. The iteration program's
variants — nullable wrapper, string encoding, guidance, mode-discriminator, twin tools
— live in `results/runs/3-tooling/threading-hybrid-v4-nullable/` and `results/runs/3-tooling/threading-hybrid-iter/`;
the twin-tools winner is finding 8.)

Easy vs hardened chains (strict): every model loses on the hardened set in the ISO
arms (opus 96→82, gpt-5.5 100→86, gpt-mini 95→77); the IR arm loses least and at
frontier barely at all (opus IR 100→100, gpt-5.5 IR 96→95).

1. **IR leads in all four models, and the frontier tier widens its lead.** Opus 4.8
   threads 46/46 hops through the IR arm — including the depth-8 chain and every
   hardened trap — while still missing 5 hops when computing dates itself. The
   mini-tier vendor split (tool helps gpt, hurts haiku) shrinks at frontier but the
   *direction* survives: opus iso-tool ≤ opus iso; gpt-5.5 iso-tool ≥ iso.
2. **Drift is hop-type concentrated, not depth decay.** With chain composition held
   constant (the five 5-step chains), accuracy does not slide with step number; the
   deepest reference of all — re-querying a step-1 date at step 8 — is nearly perfect.
   What fails: chained business-day arithmetic from a window's edge (CH-10), and
   implicit-reference window construction (CH-07).
3. **The stale-value trap is phrasing-sensitive, not fundamental.** In an earlier wave
   with vaguer step wording, small models reused the rescheduled meeting's OLD date in
   3/6 follow-ups (both ISO arms). With the final, cleanly-worded update, 46/48
   follow-ups across all four models track the new date. The failure mode exists, but
   clean communication of state changes largely closes it.
4. **Zero anchor-binding errors anywhere** (the labeled-distractor check): no model
   ever bound the wrong *named* milestone, even at depth 8 with distractor dates.
   Naming works; pronouns and edges are what break.
5. **Zone-offset is an ISO-only failure class at both tiers.** Models copy the
   anchor's UTC offset onto dates across a DST boundary (right day, hour-shifted
   window) — it appears in haiku's and opus's ISO arms and is structurally impossible
   when code resolves.
6. **Error taxonomy splits cleanly by representation:** ISO misses are arithmetic +
   zone-offset (computation); IR misses are wrong-operation (expression construction).
   Each representation fails at its own job — H1's division of labor visible in the
   error types themselves.
7. **Tool-contract quality is measurable (H3).** gpt-5.5's only IR misses came from
   sending a malformed sub-expression (`of: {}`), getting back a bare "Invalid input",
   and abandoning the hop after three blind retries. Repairing ONLY the validation
   message (what's wrong + an example; prompt surfaces unchanged, verified by
   PROMPT_VERSION) and re-running the affected cells moved gpt-5.5's IR arm 91→96%.
   The feedback path of a tool is part of its contract.

8. **Hybrid tool contracts obey a law: an expression channel works IFF its shape is
   non-optional AND the grammar is visible in-band.** Nine contract variants (schema
   wrappers, two encodings, guidance, few-shot, a mode discriminator, twin tools,
   grammar-inlining). Accuracy differences between variants are within their
   confidence intervals; the channel behavior is categorical and is the finding:
   - **Optional object field** (canonical, nullable wrapper, +guidance, mode
     discriminator): GPT-family models emit degenerate `{}` — ≈0 well-formed
     expressions across ~50 attempts. Under strict function-calling there is no legal
     way to *skip* an optional object, so `{}` is the escape; clarity and prompting
     did not fix it.
   - **String field, grammar hidden** (string, string+guidance): models compose
     complete-but-wrong expressions — ISO half-open habits against the inclusive
     grammar, fencepost-dominated (gpt-mini 4/25 correct).
   - **Required object field** (twin tools; also the dedicated resolve arm): the
     advertised schema *is* the grammar, both conditions hold — both vendors route
     (28–70%) and compose well (twin: 73/74 well-formed across 4 models).
   - **String field with the grammar inlined**: both conditions hold by other means —
     expression composition jumps to 35/35 correct, fenceposts gone, haiku 47/47
     strict.

   Two designs satisfy the law (twin tools, string+grammar); neither beats the
   dedicated **resolve-then-query** contract, which is the same law applied once at a
   central boundary and is the only design with accuracy separation (90–100% for every
   model, opus 46/46). Production rule: resolve-then-query first; if the time argument
   must live on the domain tool, use a required object or a grammar-carrying string;
   never an optional expression field.

## Audit trail (what we fixed on our side before believing the numbers)

- CH-03's milestone was named `campaign_end` while holding the whole campaign *range* —
  models reasonably anchored its start. Renamed `campaign_window`.
- The resolve tool's docs never mentioned `endExclusive` or the last-day-of-a-window
  idiom — added (interface documentation, symmetric by the audit standard).
- CH-07 hop 2 was **re-keyed**: "the first full week after" a Monday go-live naturally
  means the next Mon–Sun week — 12/15 model answers agreed with each other against our
  original 7-days-from-Tuesday key. The models were right; the key moved.
- Misses with the right wall-clock day but wrong UTC offset got their own error class
  rather than counting as "wrong window."
- CH-10's "3 business days after the migration window closed" counts across Christmas:
  the key (window's last covered day, holiday-aware) and the documented alternative
  (the exclusive-end day, also holiday-aware) are both accepted; answers that forgot
  the holiday rule the prompt states remain strict misses. Cross-model consensus was
  checked (`npm run audit:consensus` pattern) before keeping the key.
- The resolve tool returned an unactionable "Invalid input" on malformed expressions —
  only OpenAI models ever sent one (23×), so only their IR cells were re-run after the
  fix (old rows discarded after the fix).

- The hybrid arm's first run was discarded entirely: our extraction scored each hop's FIRST query call,
  but the dual-format tool produces retry loops, so models were graded on attempts
  they had already repaired. Fixed to score the final call (with failed expressions
  kept in the audit trail) and re-run.
- A null-rejection theory of the GPT `{}` pathology was tested and REFUTED: the tool
  layer strips explicit nulls before validation, so GPT's null-bearing calls were
  never rejected (an earlier direct-safeParse test bypassed that normalization and
  misled us). The nullable-wrapper variant run that theory motivated became the
  brittleness measurement in finding 8 — a useful accident, kept with its provenance.

## Caveats

Frontier models ran K=1 (each frontier cell is 46 hops, so one hop ≈ 2 points); minis
K=3. CH-10's late-hop misses partially cascade from one underspecified phrasing
("after the migration window closed" — boundary vs last-covered-day) — kept, because
production conversations are exactly this underspecified, but flagged and
acceptable-set covered.
