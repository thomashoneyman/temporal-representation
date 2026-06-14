# `src/scoring` — pure scoring functions

The deterministic grading logic, with zero framework imports. These functions are the
report's single source of truth: the harness captures raw model outputs and applies
them in analysis; the Mastra scorer wrappers (`src/scorers/`, Artifact #4) reuse the
same functions, so eval-time and report-time numbers can never disagree.

## The error-severity ladder (how wrong is wrong?)

Headline accuracy is **Sev 0** (exact to convention), but a model that picked a
defensible alternative reading is very different from one that added instead of
subtracted. Every graded answer gets one ordinal severity:

| Sev | Label | Example |
|---|---|---|
| 0 | Exact | — |
| 1 | Off-by-one | "through Friday" ending Friday 00:00 instead of Saturday 00:00 (the fencepost) |
| 2 | Near | within ±3 grain units |
| 3 | Grain / convention | the whole day for "3pm"; a Sun-start or rolling-7 "last week" |
| 4 | Interpretation divergence | a documented acceptable alternative: the 30-day "month ago", the current-year "March 4" |
| 5 | Wrong operation | "3 days ago" answered 3 days *ahead* |
| 6 | Wrong | unrelated date, or a time invented for a no-time query |

We report three accuracy bands per slice/arm: **Sev 0**, **≤ Sev 4** (within defensible
readings), and the **Sev-1 off-by-one rate** on its own (the signature LLM failure).

## The point rule

A point answer is **exact iff its start instant equals the key's start at minute
precision**. Grain is reported as a separate `grainMatch` flag, never folded into
exactness — at a round timestamp like `16:00:00`, an ISO answer can't express whether
it means the minute or the hour, and we only care about grains down to the minute
(always-zeroed seconds are fine). Answering the *whole day* for an hour-grain question
is still penalized (Sev 3 `grain-too-coarse`) because its start instant is wrong.

## Files

| file | what it scores |
|---|---|
| `translation.ts` | Tasks 4/5/6: per-cardinality scoring (point start-equality, range IoU + fencepost detection, set time-coverage F1 + collapse tags), the severity ladder, acceptable-set membership for ambiguous items, clarification & no-time precision/recall, ambiguity calibration. |
| `threading.ts` | Task 7: per-hop correctness from tool-call time args, the drift curve (accuracy vs chain depth), and the error taxonomy — `arithmetic` (right anchor, wrong math) vs `anchor-binding` (bound the wrong milestone, detected via labeled distractors) vs `wrong-operation`. |
| `decomposition.ts` | Task 7b: precision/recall/F1 over the set of `query_range` calls vs the resolver's expansion, with the failure taxonomy (`collapsed-to-bounding-range` is the headline). |
| `interpretation.ts` | Phase 1 (ungraded): classifies a model's resolution against a probe's labeled candidate readings (`pinned` vs `calendar30`, …) with an explicit `other` bucket — a third reading is a finding, not an error. |

## Fairness invariant

Scoring always **re-resolves the model's raw output** with the pure resolver against
the item's anchor. The resolver produces the *key* and resolves the *IR arm's
expression*; it is never allowed to touch the ISO arm's scored output — that would
smuggle code arithmetic into the arm whose whole point is measuring the model's own.
