# src/scorers/

Artifact #4 — the reusable time scorers. Two kinds live here, both thin wrappers around
the pure functions in `src/scoring/` (which has no framework imports, so everything
below ports to other frameworks by replacing the wrapper).

## Eval scorers (`translation-scorers.ts`)

`exactISO` / `exactIR` grade a translation run against the dataset's answer key:
1 = exactly the conventions-correct dates, 0 otherwise. Registered on the Mastra
instance, so they work in `runEvals` and Studio. The experiment's published numbers do
NOT come from these at eval time — the harness stores raw model output and re-scores
offline with the same pure functions — but they let you grade new runs interactively
and they can never disagree with the reports, because both paths share one
implementation.

## The production guardrail (`production.ts`)

`temporalSanityScorer` is **model-free** (no LLM call, microseconds per trace — fine at
sampling rate 1.0). It cannot know what the user meant, so it never judges whether a
window is the *right* window; it flags only what is wrong on its face or matches a
failure signature we measured repeatedly in this experiment:

| flag | severity | what it caught in our runs |
|---|---|---|
| `end-before-start`, `zero-length`, `empty-set` | block | malformed args that make a query silently match nothing |
| `offset-mismatch` | warn | the DST copy-paste: a January date carrying the anchor's July UTC offset — occurred in every model's ISO arm, never under the resolver |
| `outside-window` | warn | a window years from "now" — wrong-year resolution |
| `p30d-month-suspect` | warn | "a month ago" answered as exactly 30 days when the calendar month differs — the day-pinning divergence from our preference probes |

**Usage 1 — log-only observability.** Register it on your Mastra instance (this repo
does, as `temporalSanity`) and watch the score in tracing: 1 = clean, 0.5 = warnings,
0 = a blocking flag. No behavior change; you learn your real-world flag rate first.

**Usage 2 — guardrail with retry.** Call the pure core directly in tool middleware and
retry the step on blocking flags, surfacing the messages to the model — we measured
that actionable error text materially improves repair (one rewritten validation message
moved a model's threading score 91→96%):

```ts
import { checkTimeArgs } from './production.js';

const flags = checkTimeArgs([{ start, end }], { anchor: requestAnchor, zone: 'America/New_York' });
if (flags.some((f) => f.severity === 'block')) {
  return { error: flags.map((f) => f.message).join('; ') }; // model sees this and retries
}
```

Tests: `tests/production-scorer.test.ts`.
