# fixtures/

Committed model responses for offline replay — the repo's reproducibility guarantee.

`phase2-smoke.jsonl` holds the raw structured outputs the two small models gave for a
smoke subset of the graded run (the first two questions of each category × all three
answer formats × repeat 1). They are recorded verbatim from `results/runs/phase2/` by
`pnpm fixtures:record`, which also snapshots their grades to
`results/smoke/phase2-smoke.json`.

`pnpm phase2:replay` re-grades the fixtures with the **current** scorer — no network,
no API keys — and exits non-zero if any score differs from the committed snapshot. So:

- anyone can verify our published numbers follow from the published model responses;
- any change to the scoring rules or the answer key shows up as a replay failure —
  when the change is intentional, re-record and the diff is reviewable in git history.
