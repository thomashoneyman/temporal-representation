# talk/

The presentation deck. `index.html` is a self-contained, keyboard-navigable slide deck
(no CDN, no build step) — present it on the live site
(**https://thomashoneyman.github.io/temporal-representation/talk/**) or open it in any
browser after generating it. It is **generated, not committed** (see below): run
`npm run talk` (or `npm run site`) to produce `talk/index.html`.

- **→ / Space / click-right**: next · **← / click-left**: previous · **Home/End**: jump
- **N**: toggle speaker notes (per-slide, drawn from `artifacts/talk.md`)
- Bottom-right shows slide number; the green bar at top is progress.

It is **generated** by `npm run talk` (`src/harness/talk-viz.ts`): the slide narrative is
authored in that script, and the headline numbers (the IR-vs-ISO table, the routing
policies) are pulled live from `results/overview.json` and `results/4-routing/routing.json`, so the
slides can't drift from the data. Re-run `npm run talk` after any re-analysis.

Companion docs in `artifacts/`: `talk.md` (the full speaker script, including the Mastra
evals/scorers appendix), `architecture.md` (the reference), `guide.md` (the build handoff).
