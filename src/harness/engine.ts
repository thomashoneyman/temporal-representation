/**
 * The run engine: one wrapper around `runEvals` used by every task.
 * Loads items from a seeded dataset, builds per-item requestContext (provider/tier,
 * anchor, org definitions, optional crib/convention), runs graded or ungraded, and
 * appends one JSONL row per item with the RAW captured output + usage + timing —
 * analysis re-scores raw outputs with the pure scoring functions, so the persisted
 * record is the source of truth regardless of how scorers evolve.
 */
import { runEvals } from '@mastra/core/evals';
import { RequestContext } from '@mastra/core/request-context';
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { CONFIG, type Provider, type Tier } from '../../experiment.config.js';
import { PROMPT_DEFINITIONS } from '../datasets/cases/index.js';
import { cribSheet, PROMPT_VERSION, type Arm } from '../datasets/render.js';
import type { GroundTruth } from '../datasets/schema.js';
import { mastra } from '../mastra/index.js';
import { capturedScorer } from '../mastra/scorers.js';
import { modelFor } from '../mastra/models.js';

export interface CellOpts {
  dataset: string; // seeded dataset name, e.g. 'temporal-relative'
  agentId: 'translate-iso' | 'translate-ir';
  arm: Arm;
  provider: Provider;
  tier: Tier;
  rep: number;
  task: string; // 'phase1' | 'task4' | …
  graded?: boolean;
  modifiers?: { crib?: boolean; convention?: string };
  runDir: string; // results/runs/<run-id>
  itemFilter?: (gt: GroundTruth) => boolean;
}

export interface RunRow {
  task: string;
  arm: Arm;
  provider: Provider;
  tier: Tier;
  model: string;
  rep: number;
  promptVersion: string;
  itemId: string;
  slice: string;
  raw: unknown; // the structured object (or null + error)
  error?: string;
  usage?: unknown;
  ms: number;
}


function buildRC(gt: GroundTruth, opts: CellOpts): RequestContext {
  const rc = new RequestContext();
  rc.set('provider', opts.provider);
  rc.set('tier', opts.tier);
  rc.set('arm', opts.arm);
  rc.set('anchor', gt.anchor);
  if (gt.customPresets) rc.set('customPresetsText', PROMPT_DEFINITIONS);
  if (opts.modifiers?.crib) rc.set('crib', cribSheet(gt.anchor));
  if (opts.modifiers?.convention) rc.set('convention', opts.modifiers.convention);
  return rc;
}

export async function runCell(opts: CellOpts): Promise<{ items: number; errors: number }> {
  const list = await mastra.datasets.list({ perPage: 100 });
  const rec = list.datasets?.find((d: { name: string }) => d.name === opts.dataset);
  if (!rec) throw new Error(`dataset not seeded: ${opts.dataset} (run npm run seed)`);
  const dataset = await mastra.datasets.get({ id: rec.id });
  const res = await dataset.listItems({ perPage: 1000 });
  const items = (Array.isArray(res) ? res : res.items) as Array<{ input: unknown; groundTruth: GroundTruth }>;
  const filtered = opts.itemFilter ? items.filter((it) => opts.itemFilter!(it.groundTruth)) : items;

  mkdirSync(opts.runDir, { recursive: true });
  const file = `${opts.runDir}/${opts.task}-${opts.provider}-${opts.tier}-${opts.arm}-rep${opts.rep}.jsonl`;

  // RESUMABLE: skip items this cell already recorded (a transient API error mid-cell
  // costs a retry of the missing items, never a rerun of paid calls).
  const done = new Set<string>(
    existsSync(file)
      ? readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l) as RunRow).filter((r) => r.raw !== null).map((r) => r.itemId)
      : [],
  );
  const selected = filtered.filter((it) => !done.has(it.groundTruth.itemId));
  if (selected.length === 0) return { items: 0, errors: 0 };
  let errors = 0;
  const cellStart = Date.now();

  await runEvals({
    target: mastra.getAgentById(opts.agentId),
    concurrency: CONFIG.concurrency,
    scorers: [capturedScorer], // no-op; analysis re-scores from raw — Phase 1 is ungraded by design
    data: selected.map((it) => ({
      input: it.input as string,
      groundTruth: it.groundTruth,
      requestContext: buildRC(it.groundTruth, opts),
    })),
    onItemComplete: ({ item, targetResult }) => {
      const gt = item.groundTruth as GroundTruth;
      const r = targetResult as { object?: unknown; error?: unknown; usage?: unknown };
      const raw = r.object ?? null;
      if (raw === null) errors++;
      const row: RunRow = {
        task: opts.task,
        arm: opts.arm,
        provider: opts.provider,
        tier: opts.tier,
        model: modelFor(opts.provider, opts.tier),
        rep: opts.rep,
        promptVersion: PROMPT_VERSION,
        itemId: gt.itemId,
        slice: gt.slice,
        raw,
        ...(raw === null ? { error: String((r.error as Error)?.message ?? 'no structured object') } : {}),
        usage: (targetResult as { usage?: unknown }).usage,
        ms: Date.now() - cellStart, // elapsed within the cell (not per-item latency)
      };
      appendFileSync(file, `${JSON.stringify(row)}\n`);
    },
  });
  return { items: selected.length, errors };
}
