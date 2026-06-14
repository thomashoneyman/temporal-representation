# Results

Everything in this directory is an output of the experiment. This page explains what
you're looking at, assuming no prior context.

## The experiment in three sentences

When a person asks a software assistant about "last week" or "the past month", the
assistant's AI model has to turn that phrase into concrete dates before it can query
anything. This project measures how well AI models do that: which dates they *think*
such phrases mean, how consistently they choose, and how accurately they translate —
under two different answer formats. The end goal is practical guidance for anyone
building an assistant that must handle time expressions: what models handle reliably on
their own, and where they need help from conventional code.

## The two phases (why some files say "phase 1")

The experiment deliberately runs in two passes:

- **Phase 1 — measurement (no grading).** First we just *observe*: given an ambiguous
  phrase, which reading does each model reach for? Is it consistent across repeats?
  Does the choice change with the day of the week the question is asked on? Nothing is
  marked right or wrong — there is no answer key in this phase, because deciding what
  "right" means is exactly what we're gathering evidence for.
- **Phase 2 — evaluation (graded).** Using Phase 1's findings, we lock one documented
  interpretation for every ambiguous case ("last week means the previous Monday–Sunday")
  into an answer key, then score each model and answer format against it: exact-match
  accuracy, how *far off* wrong answers are, and which kinds of mistakes each format
  makes. Underway — see `phase2-viz.html`.

The split matters because grading first would bake our own assumptions into the answer
key. Measuring first means the conventions we lock are informed by what models (and
people) actually mean.

## The two answer formats you'll see compared

- **Concrete dates** (called *ISO* in file names): the model answers with actual
  timestamps — it does the calendar arithmetic itself.
- **Formal expression** (called *IR*): the model answers with a small structured
  expression like "the week before the current one", and *our deterministic code*
  computes the dates. The model classifies; code calculates.

Comparing these tests a core hypothesis: models are better at recognizing what a phrase
means than at computing dates. Where the formats differ in reliability, that difference
is the finding.

## Files

| File | What it is | Start here? |
|---|---|---|
| `phase1-viz.html` | **Interactive report** of Phase 1: how consistently each model answers, whether it invents times for questions that have none, and which reading it picks on deliberately ambiguous questions. Open in any browser; hover the bars. | ✅ |
| `preferences-viz.html` | **Interactive report** of the preference grid: ~29 common business time phrases ("the past month", "year to date", "early next week"), each asked at 7 different calendar positions, showing which concrete dates each model chose and how that shifts with the asking date. | ✅ |
| `phase1-readout.md` | The written analysis of Phase 1 — findings with counts, caveats about what each measurement can and cannot claim, and the convention decisions the data feeds into. | for detail |
| `phase2-viz.html` | **Interactive report** of the graded evaluation: every answer scored against the answer key on a best-to-worst severity ladder, grouped by answering method, per question category. | ✅ |
| `preferences-readout.md` | The preference grid as plain tables (the same data as the HTML, less digestible). | reference |
| `summary-viz.html` | **The leaderboard** — the whole experiment on one page: the short answer, the proposed architecture, the "what should a tool accept" verdict, per-task tables, determinism/cost, and the filled decision table. Start here. | ✅ |
| `report.md` | The written synthesis: each objective + hypothesis answered with numbers, the decision table, and the "we predicted X, found Y" close. | ✅ |
| `task7-viz.html` / `task7-readout.md` | **Multi-step threading**: keeping time references straight across a conversation, plus the tool-contract law (how a tool should accept time). | for detail |
| `task7b-viz.html` / `task7b-readout.md` | **Compound-query decomposition**: one filtered request → multiple range calls. | for detail |
| `task8-viz.html` / `task8-readout.md` | **Routing discrimination**: can the agent be prompted to answer easy times in ISO and delegate only the hard ones to the resolver? (the free-form-agent question) | for detail |
| `phase1.json` / `phase2.json` / `preferences.json` / `task5.json` / `task7.json` / `task7b.json` / `task8.json` / `summary.json` | The aggregated numbers behind the reports, machine-readable. The HTML pages are generated from these. | tooling |
| `runs/` | Raw per-call records (one JSON line per model call: the question, the model's full answer, token usage). Everything above is recomputed from these; nothing is hand-edited. | provenance |

## How to trust these numbers

- Every model call is recorded raw in `runs/` before any interpretation; the reports are
  derived from those records by deterministic code and can be regenerated (`pnpm
  phase1:viz`, `pnpm preferences:viz`).
- Each record carries a fingerprint of the exact prompt that produced it, so numbers are
  never silently compared across prompt changes.
- Repeated questions (5×) separate "the model believes X" from "the model flips coins".
- When a model's answer matched none of our anticipated readings, it is shown as
  "something else" with the actual answer preserved — several findings came from
  noticing patterns in exactly those.

## Models measured so far

`claude-haiku-4-5` (Anthropic) and `gpt-5.4-mini` (OpenAI) — the small, fast tier that
typical applications use by default — measured on everything, 5 repeats each.

`claude-opus-4-8` and `gpt-5.5` (the frontier tier) were then run **only on the questions
where the two small models showed any disagreement** (between repeats, between each other,
or between answer formats; concrete-dates format, 3 repeats). That keeps the comparison
sharp and cheap — but it means frontier aggregate numbers describe a deliberately harder
subset and should never be compared 1:1 against the small models' full-set numbers.
