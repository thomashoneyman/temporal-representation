/**
 * Model-free no-op scorer: runEvals demands ≥1 scorer, but ungraded runs (Phase 1)
 * persist RAW rows as their real signal. Registered on the Mastra instance so score
 * persistence doesn't warn.
 */
import { createScorer } from '@mastra/core/evals';

export const capturedScorer = createScorer({
  id: 'captured',
  name: 'captured',
  description: 'no-op presence scorer for ungraded runs (1 = a structured object was produced)',
}).generateScore(({ run }) => ((run.output as { object?: unknown } | undefined)?.object != null ? 1 : 0));
