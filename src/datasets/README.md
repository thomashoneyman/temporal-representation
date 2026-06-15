# `src/datasets` — the temporal dataset + answer key

**Artifact #1.** 139 seeded queries across 8 slices (116 in v0.1; v0.3 added a hard-arithmetic and cross-category expansion), each with an anchor datetime, a
hand-authored canonical `ScateLite` expression, and the expected resolution. A
business-calendar analog to the Test-of-Time / PRIMETIME benchmarks: instead of academic
edge cases, these are the time expressions real users put in front of data-analysis
agents.

## How the answer key stays trustworthy

Three independent layers, all enforced by `npm test`:

1. **Derivation** — every gradeable item's expected intervals are reproduced by running
   the deterministic resolver on the item's canonical IR (`tests/answer-key.test.ts`).
   The key is never hand-typed arithmetic alone.
2. **Hand-label cross-check** — `cases/handlabeled.ts` holds a cross-slice sample whose
   ISO values (including exact UTC offsets across DST changes) were derived by a human
   from first principles, with the derivation written down. The resolver must agree with
   0 disagreements (`tests/handlabel.test.ts`).
3. **Structure checks** — slice counts, unique IDs, half-open sanity, set sizes, and the
   DST boundary cases (23-hour days are compared as intervals, never assumed 24h).

## The 8 slices (and what each one illuminates)

| Slice | n | What it measures |
|---|---|---|
| `specific` | 15 | Bare-date occurrence ("March 4" said in June → which year?), same-day weekday+time, the invalid Feb 29 edge, hour-grain points. |
| `relative` | 34 | **Date arithmetic (H1)** — boundary crossings, business days over holidays, and the headline probe pair: "a month ago" (calendar, pinned) vs "30 days ago" (exact). |
| `named` | 23 | Week start & membership (incl. a Sunday anchor), to-date inclusivity (YTD/MTD/QTD), holiday rules, past-holiday rolling, a self-reference probe (asked ON Halloween). |
| `custom` | 12 | Org presets defined **only in the prompt** (fiscal year, sprints, billing cycles) — out-of-training generalization, and whether an in-prompt definition overrides a global default. |
| `ranges` | 19 | End-inclusivity fenceposts ("through the 4th"), open ranges ("since March" / "from June onward"), the first-week-of-month fork, rolling windows that exclude today, date-sets. |
| `multipart` | 14 | Compound structure: AND / OR / NOT / COMPARE / mixed-shape / multi-window queries that expand to a set of ranges — the decomposition task (7b) source. |
| `notime` | 8 | Whether models invent a time when none exists ("the latest report", "open incidents"). |
| `ambiguous` | 14 | No safe single default ("around the holidays") → acceptable sets + should-clarify labels, with over-clarification controls. |

## Files

| file | contents |
|---|---|
| `cases/00-anchors.ts` | The 9 seed anchors (A1–A9) and why each was chosen. Every item is seed-relative — answers depend on the anchor, never on memorized dates. |
| `cases/01-specific.ts` … `cases/08-ambiguous.ts` | The items, one numbered file per slice, with probes, acceptable variants, and per-item notes. |
| `cases/handlabeled.ts` | The human-derived validation sample — **self-contained**: each row restates its query, anchor, the conventions used, the DST table, and a step-by-step derivation, so it can be re-verified with nothing but a calendar. |
| `cases/lib/` | Support code: the item schema (`types.ts`) and tiny IR constructors (`build.ts`) that keep case files reading like tables. |
| `cases/index.ts` | Aggregates the slices into `ALL_CASES` / `SLICES`. |

## Authoring rules (for expanding the dataset)

- **Seed-relative always**: a new item must change its answer when the anchor moves.
- **Author the IR, derive the key**: never hand-type an expected interval without the
  canonical IR that produces it (the hand-label file is the deliberate exception).
- Bare weekdays/dates are pinned per-anchor (`which: 'this'|'next'`) where the phrasing
  implies a reading — the grammar deliberately has no time-aware "bare" roll.
- Alternative defensible readings go in `acceptable` (they score as interpretation
  divergence, Sev 4, not as real misses); probe items also label their candidate
  readings for the ungraded Phase-1 tally.
- Keep new items inside the anchor ±12-month window.
