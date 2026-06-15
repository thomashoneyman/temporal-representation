# src/analysis/

The synthesis layer: everything here reads the per-task results files (and, where
noted, the committed raw runs) and produces the experiment's final artifacts. Nothing
here calls a model — it is all offline and re-runnable.

| script | command | produces |
|---|---|---|
| `summary.ts` | `npm run analyze:summary` | `results/summary.json` — every task's metrics flattened into one cell schema (task × model × arm × slice × metric) with Wilson 95% CIs, plus determinism (unprompted vs with-conventions, recomputed from raw repeats), cost (recorded tokens × list pricing), and the filled production decision table |
| `report.ts` | (part of `npm run analyze`) | `results/report.md` — the narrative: each research objective and hypothesis answered with numbers pulled from `summary.json` at render time, so prose can't drift from data |
| `summary-viz.ts` | (part of `npm run analyze`) | `results/summary-viz.html` — the one-page leaderboard, rendered from `summary.json` only; self-contained and shareable |
| `consensus-audit.ts` | `npm run audit:consensus` | a standing answer-key check: flags any wrong answer that ≥2 different models agree on with ≥30% share — historically our best detector of key defects. Human adjudicates each flag; adjudicated clusters are suppressed in-file with their verdicts. Exits 1 when an unadjudicated flag exists. |

`npm run analyze` runs summary → report → leaderboard in order.

Methodology notes reviewers usually ask about:

- **CIs** are Wilson 95% intervals on proportions; frontier cells ran 1 repeat so their
  intervals are wide and noted as a scale check, not a primary comparison.
- **Determinism** = all repeats of an item produced an identical resolved answer
  (interval equality, not string equality). Only cells with ≥20 repeated items count.
- **Cost** uses recorded per-answer token usage from the runs themselves, multiplied by
  list prices in `src/mastra/models.ts` (`PRICING`, dated in-file).
