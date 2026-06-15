# Phase 1 readout — Task 2: interpretation preferences (ungraded)

**Run:** 2,320 calls = 116 items × {ISO, IR} × {gpt-5.4-mini, claude-haiku-4-5} × 5 reps.
Prompt version `a501c6dd407f`. Raw rows: `results/runs/1-measurement/consistency/`; aggregate: `results/1-measurement/consistency.json`.
(Window-preference detail is measured separately by the preference grid — `results/preferences-readout.md`.)

## How to read the two arms (they answer different questions)

- **ISO arm — the preference channel.** The model commits to concrete dates, so every
  answer reveals its reading. All week-start / occurrence / bounds conclusions below
  come from ISO cells.
- **IR arm — valid ONLY where the grammar forces a choice.** `P1M` vs `P30D`,
  `date.which`, `weekday.which`, and ref-vs-recompute are genuine model decisions.
  Anything routed through a preset or a bare date resolves under **our** conventions —
  those tallies are resolver echo, not findings, and are excluded here.
- **IR arm — the operational channel.** Determinism, schema adherence, and encoding
  style are properties of using a grammar at all; they are Phase-1 findings in their
  own right (and feed the Phase-2 design + the production decision table).

## A. Model preferences (ISO arm; IR only where it genuinely chooses)

1. **Day-of-month pinning is unanimous — and real in BOTH channels (40/40).**
   ISO arms computed Feb 12 (pinned), never Feb 10 (30-day); IR arms freely chose
   `P1M`, never `P30D`. The C7 `pin-day` default is confirmed; the literature's
   "30-day month" worry does not appear in these models.
2. **Bare dates in the past: models prefer the most-recent reading; our default says
   next-occurrence.** "March 4" said on Mar 12 → `currentYear` 10/10 (ISO); gpt-5.4-mini
   reads past holidays as most-recent 10/10 (Labor Day → 2025-09-01). When the date is
   ~9 months past (S1-02) the split shifts toward `next` — distance matters.
   **Strongest Task-3 fork: consider flipping C4 toward most-recent/nearest** (re-keys
   S1-01/02, N3-19/20, G5-08).
3. **"Next Friday" = the coming Friday (ISO: 12/15 across models; IR `which` choices
   agree 10/10).** Evidence against the locked C4a week-relative text.
4. **Week start (ISO only): haiku prefers Monday (9/10); gpt-5.4-mini splits and leans
   Sunday at the weekend anchor** (N3-04 from a Sunday: `sunStart` 4/5).
5. **Same-day readings confirmed:** "Tuesday at 3pm" asked Tuesday 11:00 = today (ISO
   10/10; IR `which:'this'` 7/10). "First week of March" = days 1–7 (ISO 8/10).
   Halloween asked ON Halloween = today (ISO 10/10).
6. **DST offsets are an ISO-arm failure class.** gpt-5.4-mini wrote `-04:00` on the EST
   start of "last week" in 4/5 reps — right week, one hour off. The IR arm cannot make
   this error by construction (the resolver assigns offsets). Expect this as a Phase-2
   severity bucket, not just a curiosity.

## B. IR-arm operational findings (not preferences — channel properties)

7. **Determinism: IR ≫ ISO.** Identical output across 5 reps: IR 82.4% (haiku) / 77.8%
   (gpt-5.4-mini) vs ISO 61.3% / 62.4%. Classification is more stable than computation —
   an ungraded signal in H2's direction, to be confirmed by graded Task 4.
8. **Schema adherence: no IR tax after a contract fix.** An apparent 1.6–7.1%
   unresolvable rate in the IR arm turned out to be OUR bug: the prompt's org-preset
   definitions never stated the ids, so models invented natural-language ref names the
   resolver rejected. With ids stated (and lenient id matching), unresolvable = 0.0% in
   every cell — both minis handle the recursive grammar flawlessly when the contract is
   actually communicated. (Kept as a finding about contract design, not model capability.)
9. **Encoding styles diverge within the same grammar:** on custom presets, gpt-5.4-mini
   defers via `ref` (37/50 — the intended use) while haiku re-derives the definitions
   compositionally (8/50 `ref`), partially re-importing model computation into the IR
   arm. Needs a dedicated ref-vs-recompute tally in Task 4 scoring.
10. **Grammar-usability traps observed:** bare dates emitted without `which` fall to the
    org default and can land a year off ("March 1 through 4" → 2027 under `next`, 3/5
    haiku reps); encoding a quarter as a day-range collides with grain-inclusive ends
    (Apr 2 instead of Apr 1). Both argue for Task-5 steering text and/or `.describe()`
    nudges — and both are measurable failure tags in Phase 2.

## Implications queued for Task 3 (the convention gate)

| Fork (DATASET §9) | Evidence (ISO channel) | Suggested action |
|---|---|---|
| C4 bare-date occurrence (`next`) | 10/10 current-year for near-past dates; gpt 10/10 most-recent holidays | Discuss flipping to `nearest` (re-key S1-01/02, N3-19/20, G5-08) |
| C4a "next <weekday>" (week-relative) | 12/15 coming-Friday | Flip to coming (matches B8-04's annotation) |
| C7 month-ago (`pin-day`) | 40/40 pinned (both channels) | Keep (confirmed) |
| First-week (`days-1-7`) | 8/10 | Keep (confirmed) |
| Week start (`mon`) | haiku Mon; gpt split/Sun-leaning | Keep `mon`; report gpt's Sunday lean |

---

# Preference-grid findings (105 queries × 7 anchor positions × 2 models × 5 reps)

Full tables: `results/preferences-readout.md`. Instrument: `src/datasets/preference-grid.ts`.

1. **Calendar periods are production-safe for direct ISO.** "Last/this month/quarter/year",
   "last/this weekend", "end of the month": ≥28/35 the calendar reading at every anchor
   position, both models. "This month" = the full calendar month, not month-to-date.
2. **The two models hold DIFFERENT mental models of rolling windows.** gpt-5.4-mini reads
   every rolling phrase to-the-instant (toNow 35/35 on "last 30 days", 35/35 "past week",
   34/35 "past month", 32/35 YTD-to-instant). Haiku reads day-grain windows — and
   systematically commits the N+1 fencepost: "the last 30 days" = a 31-day window
   [today−30, today+1) in 25/35 reps (count back 30 AND include today). our design predicted
   duration off-by-ones; they appear here as an *interpretation*, not an arithmetic slip.
3. **"The past month" is the most divergent phrase measured:** haiku → prior calendar
   month (17/35) or even month-to-date (8/35); gpt → rolling-to-now (34/35). Our C9
   default (rolling [anchor−1mo, today)) matches NEITHER dominant reading — Task-3 flag.
4. **Weeks are the flaky frontier.** "This/last week" split Mon-start vs Sun-start within
   models and BY POSITION (haiku drifts toward Sun-start midweek and at month boundaries;
   gpt is Mon-solid on "last week" but splits on "this week"). Combined with Phase 1's
   week findings: weeks need pinning (crib sheet or resolve tool) in production.
5. **YTD end is a model-level convention disagreement:** haiku includes today as a whole
   day (= our C8), gpt runs to the instant.

**Production-shape implication (decision-table preview):** named calendar periods can go
direct-ISO; weeks, rolling windows, and every "past …" phrase carry genuine cross-model
interpretation variance and belong in the preset crib / resolve tool bucket.
