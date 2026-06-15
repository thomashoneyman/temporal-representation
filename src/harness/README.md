# `src/harness` — the run engine

Experiment execution: feeding seeded dataset items through the arm agents and
persisting what comes back. Everything here is deliberately dumb about scoring — runs
capture **raw** structured outputs (plus usage and timing) as JSONL, and analysis
re-scores those rows with the pure functions in `src/scoring`, so a scoring change
never requires re-spending model calls.

| file | what it does |
|---|---|
| `engine.ts` | `runCell(...)`: one (dataset × arm × model × rep) cell through `runEvals`, with per-item requestContext (anchor, org definitions, optional crib/convention) and one JSONL row per item. Every row carries `promptVersion` — the fingerprint of the exact prompt template + injected schemas — so results are never silently compared across prompt edits. |
| `consistency.ts` | Task 2, the ungraded measurement: provider × arm × REPS over all 8 slices, then aggregation into `results/1-measurement/consistency.json` (probe tallies with an `other` bucket, none/unresolvable rates, week-start evidence, per-item rep-agreement). `ANALYZE=1` re-aggregates offline. |
| `probe.ts` | The step-5 one-off: verifies a live model fills each arm's schema and the resolver resolves it; validates model IDs. |
| `show-prompt.ts` | Offline prompt inspection via a mock model — prints the VERBATIM messages a provider would receive (saved to `artifacts/prompt-previews/`). |

Knobs (env): `PROVIDERS`, `TIER` (mini default — preliminary work stays cheap),
`REPS`, `CONCURRENCY`, `ANALYZE`.
