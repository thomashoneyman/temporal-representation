# `src/mastra` — experiment wiring (Mastra)

The framework-facing layer: storage, observability, the dynamic arm agents, and the
tools under test. Everything in here is experiment plumbing — the science lives in
`src/scate-lite`, `src/datasets`, and `src/scoring`.

| file | contents |
|---|---|
| `index.ts` | The Mastra instance: LibSQL storage + observability with the storage exporter (per-item traces + token usage feed the cost numbers). |
| `db.ts` | The one absolute `DB_URL`. `mastra dev` and `tsx` scripts resolve relative paths to *different* files (Studio shows agents but no datasets — the classic symptom), so the path is computed project-root-absolute once, here. |
| `models.ts` | Provider registry: provider+tier → router model string, plus the per-provider low-reasoning options held constant across arms. |
| `agents.ts` | One dynamic agent per arm (not per model×arm) — model and prompt material (anchor, org presets, optional crib/conventions) arrive per item via `requestContext`. |
| `tools.ts` | The tools under test for the threading tasks (7/7b): the range-only `queryRange`, the `shift` arithmetic helper, and the IR `resolveRange`. The scored signal is the tool *arguments*, not its stub output. |
| `scorers.ts` | A no-op presence scorer: `runEvals` requires ≥1 scorer, but ungraded runs persist raw rows as their real signal. |
