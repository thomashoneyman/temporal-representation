/**
 * Artifact #4 — Mastra scorer wrappers around the pure scoring functions.
 * Registered on the Mastra instance so they work in runEvals and Studio; the harness
 * still persists RAW outputs and re-scores in analysis with the SAME pure functions,
 * so eval-time and report-time numbers cannot disagree.
 */
import { createScorer } from '@mastra/core/evals';
import type { GroundTruth } from '../datasets/schema.js';
import { ALL_CASES } from '../datasets/cases/index.js';
import { DEFAULT_CONVENTIONS } from '../scate-lite/conventions.js';
import { toEnvelope } from '../representation/translation-schema.js';
import { scoreTranslation } from '../scoring/translation.js';

const itemById = new Map(ALL_CASES.map((c) => [c.id, c]));

function scoreRun(run: { groundTruth?: unknown; output?: unknown }, arm: 'iso' | 'ir'): number {
  const gt = run.groundTruth as GroundTruth | undefined;
  const raw = (run.output as { object?: unknown } | undefined)?.object;
  if (!gt || raw == null) return 0;
  const item = itemById.get(gt.itemId);
  if (!item) return 0;
  const score = scoreTranslation(toEnvelope(raw), item, {
    anchor: gt.anchor,
    conventions: { ...DEFAULT_CONVENTIONS, ...gt.conventions },
    ...(gt.customPresets ? { customPresets: gt.customPresets } : {}),
    window: { backMonths: 12, forwardMonths: 12 },
  }, arm);
  return score.exact ? 1 : 0;
}

/** 1 = exact-to-convention (Sev 0); the headline Task-4 number. */
export const exactISO = createScorer({
  id: 'exact-iso',
  name: 'exact-iso',
  description: 'Exact-to-convention accuracy for the concrete-dates (ISO) arm',
}).generateScore(({ run }) => scoreRun(run as never, 'iso'));

export const exactIR = createScorer({
  id: 'exact-ir',
  name: 'exact-ir',
  description: 'Exact-to-convention accuracy for the formal-expression (IR) arm',
}).generateScore(({ run }) => scoreRun(run as never, 'ir'));
