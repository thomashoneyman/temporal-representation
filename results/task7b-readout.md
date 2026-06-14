# Task 7b readout — decomposition (compound query → multiple range-only calls)

**Run:** 17 compound questions × {ISO, ISO+shift-tool, IR} × (2 minis × 3 reps + 2
frontier × 1 rep) = 510 graded attempts, zero harness failures. The downstream tool
accepts ONE contiguous range per call; correct behavior is one `query_range` call per
separate window. Ground truth is the resolver's expansion of each query,
**adjacency-merged**: "weekdays this week" is one contiguous window, so one Mon→Sat
call is correct — only windows separated by a real gap (a weekend, the lunch hour)
must stay separate calls. Three candidate items merged to a single window and were
excluded from the pool.

## Results (exact-set rate; mean F1 in parens)

| arm | haiku | gpt-5.4-mini | opus 4.8 | gpt-5.5 |
|---|---|---|---|---|
| ISO (enumerates itself) | 65% (93) | 71% (97) | 88% (98) | **88% (100)** |
| ISO + shift tool | 61% (92) | **80% (98)** | 82% (98) | 82% (98) |
| IR (code enumerates) | **82% (97)** | 76% (98) | **94% (99)** | **88% (100)** |

1. **Offloading enumeration to code helps most where it is needed most.** IR lifts
   haiku +17 points over plain ISO and opus +6; for the OpenAI models IR ties or
   trails their best ISO arm slightly. The Task-7 vendor split reappears: at mini
   tier the shift tool is gpt's best arm and haiku's worst.
2. **At frontier the tool advantage disappears and IR leads or ties.** Opus: IR 94 >
   ISO 88 > tool 82. gpt-5.5: IR 88 = ISO 88 > tool 82. The deterministic
   *arithmetic* helper is mildly net-negative for every model here — extra round
   trips, no enumeration help — while the *enumeration* helper (IR) never hurts.
3. **The feared failure is real but small-model-only:** collapsing many windows into
   one bounding range that sweeps in unasked time occurred only in haiku's two ISO
   arms (6 attempts total) — never at frontier, and never in any IR arm.
4. **The dominant failure everywhere is wrong-day-or-time-window** — right call
   structure, misplaced windows (a Tue–Thu set landing on the wrong week; morning
   windows at the wrong hours). In the IR arm this is expression-construction error;
   in the ISO arms it is calendar arithmetic. Same division of labor as Task 7.
5. **Helper adoption is voluntary and split:** told the helpers exist, models used
   resolve_set in 88–100% of IR-arm attempts, but shift_date in only 6–20% of
   tool-arm attempts.

## Caveats

Frontier K=1 (17 attempts per cell — one question ≈ 6 points); minis K=3. The pool is
17 items, so per-item idiosyncrasies matter: see the "hardest compound questions"
section of `task7b-viz.html` and judge the misses directly (every bar opens the
actual calls made vs the windows expected).
