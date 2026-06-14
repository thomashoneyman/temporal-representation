# artifacts/

The experiment's committed, liftable outputs — everything here is consumable without
running any code in this repo.

| file | what it is |
|---|---|
| `architecture.md` | **The synthesis**: the two recommended production architectures (explicit-pipeline and free-form agent), every design decision grounded in the measurements, plus a Mastra production appendix. Start here if you came for the conclusions. |
| `talk.md` | A **presentation script** of the findings and recommendations for developers building data-analysis agents — slide-by-slide, with the load-bearing numbers and a Mastra evals/scorers appendix. |
| `guide.md` | An **implementation handoff**: how to take this repo, customize the findings to your own model and business calendar, and build the time-handling layer (with the five things not to re-learn the hard way). |
| `datasets/temporal-*.json` | The dataset, one JSON file per question category: every item with its query, anchor, answer key (concrete wall-clock intervals), acceptable alternative readings, and labels. A business-calendar analog to Test-of-Time / PRIMETIME — usable as an eval set in any framework. |
| `dataset-versions.json` | Seed manifest: dataset ids, item counts, and content-hash versions (seeding is idempotent; the hash changes only when items change). |
| `prompt-previews/` | The exact rendered prompts each arm receives, snapshotted for review — what the models actually saw. |

The other liftable pieces live in source form: the IR grammar + resolver + conventions
(`src/scate-lite/`), the pure scoring functions (`src/scoring/`), and the eval +
guardrail scorers (`src/scorers/`).
