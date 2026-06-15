# Temporal Representation in Agent Systems

How well do LLMs turn a user's time expression — "last week", "a month ago", "weekends in
March" — into the concrete dates an agent must pass to downstream tools? This repository is
a runnable experiment that measures exactly that, and packages everything it produces so
other teams can reuse the pieces.

## The experiment in one paragraph

Models are given an anchor datetime ("right now it is …") and a user query, and asked to
translate the query's time into one of two representations: **direct ISO 8601** (the model
resolves the dates itself) or a compact **SCATE-like intermediate representation**
(`ScateLite`) that a deterministic code resolver turns into dates. Both arms are graded
against the same hand-verified answer key, across 8 query categories (specific dates,
relative dates, named presets, org-specific custom presets, ranges/sets, multi-part
queries, no-time queries, and genuinely ambiguous queries). The headline questions: where
is the performance cliff for direct ISO, does classify-to-IR beat resolve-to-ISO (H2), and
should date *arithmetic* be deferred to code (H1)? The endgame is a production decision
table: which time-handling techniques (prompt crib sheets, resolve tools, arithmetic tools,
IR-accepting tool contracts) earn their place in a real agent.

## Repository map — one directory per reusable artifact

Each directory below has its own README and is designed to be understandable (and where
marked, liftable) on its own. The four numbered artifacts are the experiment's deliverables.

| Directory | What it is | Artifact | Liftable? |
|---|---|---|---|
| `artifacts/architecture.md` | **The synthesis**: two recommended production architectures (pipeline + free-form agent), every decision grounded in the measurements, with a Mastra production appendix. | the capstone | ✅ a design doc |
| `src/scate-lite/` | The `ScateLite` IR grammar, the deterministic IR→ISO resolver, the locked conventions, and interval/calendar math. Zero framework dependencies. | **#2 IR spec + resolver**, **#3 conventions** | ✅ drop into any TS project |
| `src/datasets/` | The seeded query dataset: 139 items across 8 slices, anchors, the answer key, custom-preset definitions, crib sheets. | **#1 the temporal dataset** | ✅ JSON export, framework-agnostic |
| `src/scoring/` | Pure scoring functions: exact/distance/IoU/set-F1, the error-severity ladder, clarification & no-time metrics, drift/decomposition scoring. | (powers #4) | ✅ no framework imports |
| `src/scorers/` | Mastra `createScorer` wrappers around `src/scoring`, including the production guardrail scorer. | **#4 reusable time scorers** | Mastra projects |
| `src/mastra/` | Experiment wiring: the model registry, the dynamic translation/threading agents, and the tools under test. | — | experiment-specific |
| `src/harness/` | The run engine: Phase 1 (ungraded measurement), Phase 2 (graded evaluation), record/replay fixtures. | — | experiment-specific |
| `src/analysis/` | Aggregation, determinism math, the decision table, `summary.json` + report generation. | — | experiment-specific |
| `tests/` | Vitest suites: unit tests, the 40-case grammar smoke oracle, the full 116-item answer-key fixture, the hand-label sample. | — | — |
| `results/` | Experiment outputs: interactive HTML reports, written readouts, aggregated JSON, raw per-call records. Has its own README written for readers with no prior context. | — | — |

## Setup

```sh
npm install
cp .env.example .env   # add API keys (only needed for live model runs, not tests)
npm test              # the deterministic core — no network, no keys
```

## Commands

Offline (no API keys):

| Command | What it does |
|---|---|
| `npm test` | 324 tests: resolver + scoring units, the grammar smoke oracle, the answer-key fixture, the hand-label sample, the guardrail scorer. |
| `npm run seed` | Build + version the datasets; export JSON to `artifacts/` (content-hash idempotent). |
| `npm run phase2:replay` | Re-grade the committed smoke fixtures with the current scorer and assert the scores match — the reproducibility check. |
| `npm run analyze` | `results/summary.json` (all metrics, CIs, determinism, cost) → `results/report.md` (the narrative) → `results/summary-viz.html` (the leaderboard). |
| `npm run audit:consensus` | Standing answer-key check: flags wrong answers that multiple models agree on (our best key-defect detector). |
| `npm run <task>:viz` | Regenerate any results page from stored runs: `phase1:viz`, `preferences:viz`, `phase2:viz`, `task7:viz`, `task7b:viz`, `task8:viz`. |
| `npm run site` | Regenerate every report page + the talk from stored data and assemble the publishable site into `site/`. This is what CI deploys to GitHub Pages. |
| `npm run show-prompt` | Print the exact prompts and injected schemas each arm receives. |

Live model runs (need keys in `.env`; all are resumable — re-running skips completed rows):

| Command | What it does |
|---|---|
| `npm run phase1` / `npm run preferences` | Ungraded measurement: what do models *prefer* "last week" to mean? |
| `npm run phase2` | The main graded evaluation (Tasks 4 + 6): every question × 3 answer formats × models × repeats. |
| `npm run task5` | Steering: does documenting our conventions in the prompt pin the answers? |
| `npm run task7` / `npm run task7b` | Multi-step threading and compound-query decomposition against a range-only tool. |
| `npm run task8` | Routing discrimination: can the agent answer easy times in ISO and delegate only the hard ones? (Haiku) |
| `npm run fixtures:record` | Refresh the committed smoke fixtures + grade snapshot after an intentional scoring change. |

Useful knobs (env): `TIER=mini|frontier`, `REPS=3`, `CONCURRENCY=8`, `ARMS=iso,ir`,
`PROVIDERS=openai,anthropic`, `ANALYZE=1` (re-aggregate from stored rows without
buying any model calls — scoring changes propagate this way).

## Plugging in a new model

1. Set `MODEL_OPENAI` / `MODEL_ANTHROPIC` / `MODEL_GOOGLE` (or the `*_MINI` variants) in `.env`, or edit `experiment.config.ts`.
2. `npm run phase2` (and any of `task5`/`task7`/`task7b` you care about) — new rows land next to the old ones, keyed by model id.
3. `ANALYZE=1 npm run phase2 && npm run analyze && npm run phase2:viz` — the new model appears in the reports and leaderboard.

## Reading the results

The interactive reports and the talk are published to **GitHub Pages**:
**https://thomashoneyman.github.io/temporal-representation/**. The site is rebuilt from
the committed data on every push, so it never goes stale.

The HTML pages are **generated, not committed** — only the JSON they're built from lives
in git. To read them from a clone, run `npm run site` (regenerates everything into `site/`)
or a single `npm run <task>:viz`, then open the file.

Start with `summary-viz.html` (the leaderboard + the filled decision table), then
`results/report.md` (the narrative answering each research question). Every per-task page
(`phase2-viz.html`, `task7-viz.html`, `task7b-viz.html`, `preferences-viz.html`) is
self-contained — send the single file to anyone — and every error bar is clickable down to
the actual question, the model's actual answer, and what the key expects, so you can judge
the grading yourself. `results/README.md` explains the phases for readers with no context.

## Status

Complete through synthesis: all research tasks run (two small models at 3 repeats, two
frontier models at 1 repeat as a scale check), results aggregated, decision table filled.
The git history carries the full build story.
