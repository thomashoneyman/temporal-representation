/**
 * Task 7b — decomposition. `pnpm task7b` (ANALYZE=1 to re-aggregate only).
 * A compound query ("Tue–Thu 8am–12pm over the past month") meets a downstream tool
 * that accepts ONE contiguous range per call. Correct behavior: one query_range call
 * per sub-window. The arms change who enumerates:
 *   iso       → the model computes and enumerates every window itself
 *   iso-tool  → + shift_date for the arithmetic (enumeration still on the model)
 *   ir        → + resolve_set: the model sends ONE expression, code expands it to the
 *               concrete window list, the model issues the calls from that list
 * Scored signal: the SET of query_range calls vs the resolver's expansion (set P/R/F1
 * + the DESIGN failure modes: collapsed-to-bounding-range, missing/extra windows,
 * wrong day/time window, wrong count). Raw rows → results/runs/task7b/.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { Agent } from '@mastra/core/agent';
import { DateTime } from 'luxon';
import { CONFIG, type Provider, type Tier } from '../../experiment.config.js';
import { ALL_CASES, anchorIso } from '../datasets/cases/index.js';
import type { CaseItem } from '../datasets/cases/lib/types.js';
import { lowReasoning, modelFor } from '../mastra/models.js';
import { makeResolveSetTool, queryRangeTool, shiftTool } from '../mastra/tools.js';
import { ZONE, type Interval } from '../scate-lite/interval.js';
import { scoreDecomposition, type DecompositionScore } from '../scoring/decomposition.js';
import { expectedResolved } from '../scoring/translation.js';

type Arm = 'iso' | 'iso-tool' | 'ir';
const RUN_DIR = 'results/runs/task7b';
const ARMS: Arm[] = (process.env.ARMS ? (process.env.ARMS.split(',') as Arm[]) : ['iso', 'iso-tool', 'ir']);

const keyFor: Record<Provider, string | undefined> = {
  openai: process.env.OPENAI_API_KEY,
  anthropic: process.env.ANTHROPIC_API_KEY,
  google: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
};
const providers = CONFIG.providers.filter((p) => Boolean(keyFor[p]));

/** Every graded item whose key is a SET of windows separated by real gaps —
 *  decomposition is only meaningful when more than one call is required. (Adjacent
 *  windows merge: "weekdays this week" is ONE contiguous range, so it doesn't qualify.) */
const ITEMS: Array<{ item: CaseItem; expected: Interval[] }> = ALL_CASES.flatMap((item) => {
  if (!item.expected) return [];
  const expected = expectedResolved(item)!.intervals;
  return scoreDecomposition(expected, expected).expectedCount >= 2 ? [{ item, expected }] : [];
});

const armInstructions = (arm: Arm, item: CaseItem): string => {
  const anchor = anchorIso(item.anchor);
  const weekday = DateTime.fromISO(anchor, { zone: ZONE }).weekdayLong;
  return [
    `You are a data assistant. The query_range tool accepts ONE contiguous half-open ISO time range [start, end) per call. When a request covers several separate windows, issue one query_range call per window so the calls together cover exactly what was asked — no more, no less. Then briefly confirm. Treat the Anchor as the current date/time; never use the real clock.`,
    `Anchor (treat as now): ${anchor} (${weekday}). Time zone America/New_York.`,
    `Conventions: weeks run Monday–Sunday; business days are Monday–Friday excluding US federal holidays; "weekdays" means Monday–Friday.`,
    arm === 'iso-tool'
      ? 'A deterministic shift_date tool is available for date arithmetic — prefer it over computing dates yourself.'
      : arm === 'ir'
        ? 'Use resolve_set to expand the request into its concrete list of ranges instead of enumerating windows yourself, then call query_range once per returned range.'
        : '',
  ].filter(Boolean).join('\n');
};

interface DecompRow {
  itemId: string; slice: string; query: string; arm: Arm; provider: Provider; model: string; rep: number;
  calls: Interval[];
  usedHelper: boolean;
  helperCalls?: Array<{ name: string; input: unknown }>;
  score: DecompositionScore;
  usage: { in: number; out: number };
}

async function runItem(entry: { item: CaseItem; expected: Interval[] }, arm: Arm, provider: Provider, rep: number): Promise<DecompRow> {
  const { item, expected } = entry;
  const tools: Record<string, unknown> = { query_range: queryRangeTool };
  if (arm === 'iso-tool') tools.shift_date = shiftTool;
  if (arm === 'ir') tools.resolve_set = makeResolveSetTool(() => ({ anchor: anchorIso(item.anchor), ...(item.customPresets ? { customPresets: item.customPresets } : {}) }));
  const agent = new Agent({
    id: `t7b-${arm}`, name: `t7b-${arm}`,
    description: 'decomposition arm',
    model: modelFor(provider, CONFIG.tier as Tier),
    instructions: armInstructions(arm, item),
    tools: tools as never,
  });
  let calls: Interval[] = [];
  let usedHelper = false;
  let helperCalls: Array<{ name: string; input: unknown }> = [];
  let usage = { in: 0, out: 0 };
  try {
    const res = await agent.generate([{ role: 'user', content: `Query ${item.query}.` }] as never, {
      maxSteps: 30, // worst key has 22 windows; leave room for sequential callers
      providerOptions: lowReasoning(provider, CONFIG.tier as Tier) as never,
    });
    const r = res as { usage?: { inputTokens?: number; outputTokens?: number } };
    usage = { in: r.usage?.inputTokens ?? 0, out: r.usage?.outputTokens ?? 0 };
    const found: Array<{ name: string; args: Record<string, unknown> }> = [];
    (function scan(node: unknown, depth: number): void {
      if (node == null || depth > 9) return;
      if (Array.isArray(node)) { for (const el of node) scan(el, depth + 1); return; }
      if (typeof node !== 'object') return;
      const o = node as Record<string, unknown>;
      const name = (o.toolName ?? o.name) as string | undefined;
      if (typeof name === 'string' && (o.input !== undefined || o.args !== undefined)) {
        let a = o.input ?? o.args;
        if (typeof a === 'string') { try { a = JSON.parse(a); } catch { /* keep */ } }
        if (a && typeof a === 'object' && !found.some((c) => c.name === name && JSON.stringify(c.args) === JSON.stringify(a))) {
          found.push({ name, args: a as Record<string, unknown> });
        }
      }
      for (const v of Object.values(o)) scan(v, depth + 1);
    })(res, 0);
    calls = found
      .filter((c) => c.name === 'query_range' && typeof c.args.start === 'string' && typeof c.args.end === 'string')
      .map((c) => ({ start: c.args.start as string, end: c.args.end as string }));
    usedHelper = found.some((c) => c.name === 'shift_date' || c.name === 'resolve_set');
    helperCalls = found
      .filter((c) => c.name === 'shift_date' || c.name === 'resolve_set')
      .map((c) => ({ name: c.name, input: c.args }));
  } catch {
    // scored as zero calls below
  }
  return {
    itemId: item.id, slice: item.slice, query: item.query, arm, provider,
    model: modelFor(provider, CONFIG.tier as Tier), rep,
    calls, usedHelper, ...(helperCalls.length ? { helperCalls } : {}),
    score: scoreDecomposition(calls, expected), usage,
  };
}

// ── run: items are independent across (provider × arm × rep × item) → worker pool ──
if (!process.env.ANALYZE) {
  mkdirSync(RUN_DIR, { recursive: true });
  const jobs: Array<{ provider: Provider; arm: Arm; rep: number; entry: { item: CaseItem; expected: Interval[] }; file: string }> = [];
  for (const provider of providers) {
    for (const arm of ARMS) {
      for (let rep = 1; rep <= CONFIG.reps; rep++) {
        const file = `${RUN_DIR}/t7b-${provider}-${CONFIG.tier}-${arm}-rep${rep}.jsonl`;
        const done = new Set(
          existsSync(file)
            ? readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map((l) => (JSON.parse(l) as DecompRow).itemId)
            : [],
        );
        for (const entry of ITEMS) if (!done.has(entry.item.id)) jobs.push({ provider, arm, rep, entry, file });
      }
    }
  }
  console.log(`task7b: ${jobs.length} item-runs queued (concurrency ${CONFIG.concurrency})`);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONFIG.concurrency, jobs.length) }, async () => {
      while (next < jobs.length) {
        const job = jobs[next++];
        try {
          const row = await runItem(job.entry, job.arm, job.provider, job.rep);
          writeFileSync(job.file, `${JSON.stringify(row)}\n`, { flag: 'a' });
          console.log(`task7b ${job.provider}/${CONFIG.tier} ${job.arm} rep${job.rep} ${job.entry.item.id}: F1 ${row.score.f1.toFixed(2)} (${row.score.callCount}/${row.score.expectedCount} calls)`);
        } catch (err) {
          console.log(`task7b ${job.provider} ${job.arm} rep${job.rep} ${job.entry.item.id}: FAILED ${(err as Error).message.slice(0, 120)}`);
        }
      }
    }),
  );
}

// ── aggregation (re-scores stored calls against the current key) ──
const all: DecompRow[] = existsSync(RUN_DIR)
  ? readdirSync(RUN_DIR).filter((f) => f.endsWith('.jsonl')).flatMap((f) =>
      readFileSync(`${RUN_DIR}/${f}`, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l) as DecompRow))
  : [];
console.log(`aggregating ${all.length} decomposition rows (re-scored against current keys)`);

const expectedById = new Map(ITEMS.map(({ item, expected }) => [item.id, expected]));
// drop rows whose item left the pool (e.g. its merged key became a single range)
const all2 = all.filter((row) => expectedById.has(row.itemId));
for (const row of all2) row.score = scoreDecomposition(row.calls, expectedById.get(row.itemId)!);

const cells: Record<string, { n: number; exactSet: number; meanF1: number; precision: number; recall: number; failures: Record<string, number>; helperUse: number }> = {};
for (const model of [...new Set(all2.map((r) => r.model))]) {
  for (const arm of ARMS) {
    const rows = all2.filter((r) => r.model === model && r.arm === arm);
    if (!rows.length) continue;
    const failures: Record<string, number> = {};
    let tp = 0, actualN = 0, expectedN = 0;
    for (const r of rows) {
      for (const f of r.score.failures) failures[f] = (failures[f] ?? 0) + 1;
      tp += r.score.exactMembers;
      actualN += r.score.callCount;
      expectedN += r.score.expectedCount;
    }
    cells[`${model}|${arm}`] = {
      n: rows.length,
      exactSet: rows.filter((r) => r.score.exact).length / rows.length,
      meanF1: rows.reduce((acc, r) => acc + r.score.f1, 0) / rows.length,
      precision: actualN ? tp / actualN : 0,
      recall: expectedN ? tp / expectedN : 0,
      failures,
      helperUse: rows.filter((r) => r.usedHelper).length / rows.length,
    };
  }
}
writeFileSync('results/task7b.json', JSON.stringify({ generatedAt: '(stamped by run log)', reps: CONFIG.reps, cells, rows: all2 }, null, 1));
console.log('wrote results/task7b.json');
for (const [k, v] of Object.entries(cells)) {
  console.log(`${k}: exact-set ${(v.exactSet * 100).toFixed(0)}% · mean F1 ${(v.meanF1 * 100).toFixed(0)} · P ${(v.precision * 100).toFixed(0)} / R ${(v.recall * 100).toFixed(0)} · helper ${(v.helperUse * 100).toFixed(0)}%`);
}
