# `src/mastra` — experiment wiring (Mastra)

The framework-facing layer: storage, observability, and (from build step 5 onward) the
dynamic arm agents and the tools under test. Everything in here is experiment plumbing —
the science lives in `src/scate-lite`, `src/datasets`, and `src/scoring`.

| file | contents |
|---|---|
| `index.ts` | The Mastra instance: LibSQL storage + observability with the storage exporter (per-item traces + token usage feed the cost numbers). |
| `db.ts` | The one absolute `DB_URL`. `mastra dev` and `tsx` scripts resolve relative paths to *different* files (Studio shows agents but no datasets — the classic symptom), so the path is computed project-root-absolute once, here. |

Coming in later steps: `models.ts` (provider registry + low-reasoning options + pricing),
`agents.ts` (one dynamic agent per arm — model and prompt material arrive per item via
`requestContext`), `tools/` (the range-only query tool, the shift helper, the IR
boundary resolver).
