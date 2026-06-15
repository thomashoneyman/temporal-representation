# fixtures/

Committed model responses for offline replay — the repo's reproducibility guarantee.

`accuracy-smoke.jsonl` holds the raw structured outputs the two small models gave for a
smoke subset of the graded run (the first two questions of each category × all three
answer formats × repeat 1). They are recorded verbatim from `results/runs/2-accuracy/accuracy/` by
`npm run fixtures:record`, which also snapshots their grades to
`results/2-accuracy/smoke/accuracy-smoke.json`.

`npm run accuracy:replay` re-grades the fixtures with the **current** scorer — no network,
no API keys — and exits non-zero if any score differs from the committed snapshot. So:

- anyone can verify our published numbers follow from the published model responses;
- any change to the scoring rules or the answer key shows up as a replay failure —
  when the change is intentional, re-record and the diff is reviewable in git history.
