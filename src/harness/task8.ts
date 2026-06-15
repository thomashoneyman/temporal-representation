/**
 * Task 8 — routing discrimination. `npm run task8` (ANALYZE=1 to re-aggregate / re-export).
 *
 * Setup: a single-turn agent with TWO tools — query_range (takes concrete ISO, the
 * default path) and resolve_range (takes a ScateLite expression, returns ISO, for the
 * hard cases). The system prompt tells it to compute ISO itself and only reach for
 * resolve_range on the research-derived hard categories. For each of 30 items (15 easy /
 * 15 hard, labels empirical — see routing-eval.ts) we record which tool path it took and
 * whether the resulting window is correct, then assert BOTH:
 *   easy  → self-computed ISO (no resolve) AND correct
 *   hard  → delegated to resolve AND correct
 *
 * This measures whether "prefer ISO, delegate only the hard cases" is achievable via the
 * model's own judgment — the production question for a free-form agent. Default model is
 * Haiku (the labels are Haiku's). Raw rows → results/runs/task8/, summary → task8.json,
 * self-contained eval → artifacts/routing-eval.json.
 */
import { Agent } from '@mastra/core/agent';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { DateTime } from 'luxon';
import { CONFIG, type Provider, type Tier } from '../../experiment.config.js';
import { buildRoutingEval, type RoutingCase } from '../datasets/cases/routing-eval.js';
import { lowReasoning, modelFor } from '../mastra/models.js';
import { makeResolveRangeTool, queryRangeTool } from '../mastra/tools.js';
import { intervalsEqual, ZONE, type Interval } from '../scate-lite/interval.js';
import { expectedResolved, wallsToIntervals } from '../scoring/translation.js';

const RUN_DIR = 'results/runs/task8';
const PROVIDER = (process.env.TASK8_PROVIDER ?? 'anthropic') as Provider;
const TIER = (process.env.TASK8_TIER ?? 'mini') as Tier; // Haiku by default — it owns the labels

/**
 * Conditions are tool-policies. `iso`/`resolve` are the bookends (force one path); the
 * `route-*` conditions are ROUTING-PROMPT VARIANTS we iterate on — the production goal is
 * a prompt that makes the model reach for resolve on the hard categories and skip it on
 * trivially-explicit dates. Each condition = which tools are offered + the instruction.
 */
interface Condition { id: string; tools: 'iso' | 'both'; instr: string; isRoute: boolean }
const BOTH_END = 'Call exactly one path per question; do not call both tools.';
const CONDITIONS: Condition[] = [
  { id: 'iso', tools: 'iso', isRoute: false,
    instr: 'You answer time questions by computing the ISO dates yourself and calling query_range(start, end) with the range [start, end) the question asks for.' },
  { id: 'resolve', tools: 'both', isRoute: false,
    instr: 'You answer time questions by calling resolve_range(expr) with a ScateLite expression for the time, then query_range(start, end) with the ISO range it returns. Always resolve; do not compute dates by hand.' },
  // Routing prompts name the hard CATEGORIES (the research finding — fair guidance) but
  // must NOT use any eval item's wording as an example (that would teach the test). All
  // examples below are HELD OUT — chosen to be absent from the eval set; the
  // contamination guard at module load asserts it.
  // v1 — the original "prefer ISO, resolve only the hard categories" framing (under-routed)
  { id: 'route-v1', tools: 'both', isRoute: true, instr: [
    'You answer time questions by calling exactly one tool with the range [start, end) the question asks for.',
    'PREFER to compute the ISO dates yourself and call query_range — that is the fast path for simple, certain cases.',
    'Use resolve_range(expr) only for cases you are likely to get wrong by hand: holiday-aware or business-day math, named calendar periods, fiscal periods, ranges, or large/compound offsets.',
    BOTH_END,
  ].join('\n') },
  // v2 — explicit MUST-trigger list (by category, held-out examples) + narrow ISO whitelist
  { id: 'route-v2', tools: 'both', isRoute: true, instr: [
    'You answer each time question by calling exactly one tool with the range [start, end) it asks for. First decide the path:',
    'USE resolve_range(expr) — it resolves a ScateLite expression to ISO for you — if the question involves ANY of:',
    '  • a named holiday whose calendar date must be looked up (e.g. Veterans Day, Juneteenth, New Year\'s Day)',
    '  • a named calendar period or its boundary (a week, a month, a fiscal quarter, year-to-date)',
    '  • business days, or any fiscal-calendar period',
    '  • a range or open-ended span (a window between two dates, a rolling multi-day window, an open "since"/"through")',
    '  • a bare day-of-month, or date arithmetic beyond a plain whole-day offset',
    'COMPUTE the ISO yourself and call query_range ONLY when the question is a fully explicit calendar date / clock time (e.g. "July 9", "3/22", "2pm on the 8th") or a simple whole-day offset (e.g. "in 5 days", "2 days ago").',
    'If you are not sure, use resolve_range. ' + BOTH_END,
  ].join('\n') },
  // v3 — flip the default: resolve unless it is in a narrow explicit-date whitelist
  { id: 'route-v3', tools: 'both', isRoute: true, instr: [
    'You answer each time question with one tool call for the range [start, end) it asks for.',
    'DEFAULT: call resolve_range(expr) with a ScateLite expression; it returns ISO; then call query_range with that ISO. The resolver knows our holidays, business days, fiscal periods, week/quarter boundaries, and conventions — trust it over your own arithmetic.',
    'EXCEPTION — skip resolve_range and compute the ISO yourself ONLY when the question is a fully-specified explicit calendar date / clock time (e.g. "July 9", "3/22", "2pm on the 8th") or a simple whole-day offset (e.g. "in 5 days", "2 days ago").',
    'Everything else → resolve_range. ' + BOTH_END,
  ].join('\n') },
];
const SELECTED = process.env.TASK8_CONDITIONS ? process.env.TASK8_CONDITIONS.split(',') : CONDITIONS.map((c) => c.id);
const RUN_CONDITIONS = CONDITIONS.filter((c) => SELECTED.includes(c.id));

interface RoutingRow {
  id: string;
  condition: string;
  hardness: 'easy' | 'hard';
  expectedRoute: 'resolve' | 'iso';
  rep: number;
  model: string;
  actualRoute: 'resolve' | 'iso' | 'none';
  correct: boolean;
  routeMatch: boolean;
  pass: boolean; // routeMatch && correct
  answered: string | null;
}

function expectedIntervals(c: RoutingCase): { key: Interval[]; acceptable: Interval[][] } {
  return {
    key: expectedResolved(c.item)!.intervals,
    acceptable: (c.item.acceptable ?? []).map((w) => wallsToIntervals(w)),
  };
}
const isCorrect = (actual: Interval[], c: RoutingCase): boolean => {
  const { key, acceptable } = expectedIntervals(c);
  return intervalsEqual(actual, key) || acceptable.some((a) => intervalsEqual(actual, a));
};

async function runCase(c: RoutingCase, cond: Condition, rep: number): Promise<RoutingRow> {
  const weekday = DateTime.fromISO(c.anchor, { zone: ZONE }).weekdayLong;
  const tools = cond.tools === 'iso'
    ? { query_range: queryRangeTool }
    : { query_range: queryRangeTool, resolve_range: makeResolveRangeTool(() => ({}), () => c.anchor) };
  const agent = new Agent({
    id: 't8', name: 't8', description: 'routing eval',
    model: modelFor(PROVIDER, TIER),
    instructions: `${cond.instr}\nAnchor (treat as now): ${c.anchor} (${weekday}). Time zone America/New_York.`,
    tools: tools as never,
  });
  let actualRoute: RoutingRow['actualRoute'] = 'none';
  let answered: Interval[] | null = null;
  let answeredStr: string | null = null;
  try {
    const res = await agent.generate([{ role: 'user', content: `Query ${c.query}.` }] as never, {
      maxSteps: 5,
      providerOptions: lowReasoning(PROVIDER, TIER) as never,
    });
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    (function scan(node: unknown, depth: number): void {
      if (node == null || depth > 9) return;
      if (Array.isArray(node)) { for (const el of node) scan(el, depth + 1); return; }
      if (typeof node !== 'object') return;
      const o = node as Record<string, unknown>;
      const name = (o.toolName ?? o.name) as string | undefined;
      if (typeof name === 'string' && (o.input !== undefined || o.args !== undefined)) {
        let a = o.input ?? o.args;
        if (typeof a === 'string') { try { a = JSON.parse(a); } catch { /* keep */ } }
        if (a && typeof a === 'object' && !calls.some((cc) => cc.name === name && JSON.stringify(cc.args) === JSON.stringify(a))) {
          calls.push({ name, args: a as Record<string, unknown> });
        }
      }
      for (const v of Object.values(o)) scan(v, depth + 1);
    })(res, 0);
    const usedResolve = calls.some((cc) => cc.name === 'resolve_range');
    const qr = calls.find((cc) => cc.name === 'query_range' && typeof cc.args.start === 'string' && typeof cc.args.end === 'string');
    // route is what the model REACHED FOR: resolve if it called the resolver at all
    actualRoute = usedResolve ? 'resolve' : qr ? 'iso' : 'none';
    if (qr) {
      answered = [{ start: qr.args.start as string, end: qr.args.end as string }];
    } else if (usedResolve) {
      // it resolved but never issued the query — score the resolver output it received
      const rr = calls.find((cc) => cc.name === 'resolve_range');
      const outScan = JSON.stringify(res).match(/"start":"([^"]+)","end":"([^"]+)"/);
      if (outScan) answered = [{ start: outScan[1], end: outScan[2] }];
      void rr;
    }
    if (answered) answeredStr = `${answered[0].start} → ${answered[0].end}`;
  } catch {
    actualRoute = 'none';
  }
  const correct = answered ? isCorrect(answered, c) : false;
  const routeMatch = actualRoute === c.expectedRoute;
  return { id: c.id, condition: cond.id, hardness: c.hardness, expectedRoute: c.expectedRoute, rep, model: modelFor(PROVIDER, TIER), actualRoute, correct, routeMatch, pass: routeMatch && correct, answered: answeredStr };
}

// ── live run (resumable, parallel) ──
const cases = buildRoutingEval();

// Contamination guard: a routing prompt may name hard CATEGORIES (the research finding)
// but must never contain an eval item's wording as an example — that would teach the test.
// Assert no eval query appears (normalized) inside any routing instruction.
{
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const queries = cases.map((c) => norm(c.query)).filter((q) => q.length >= 4);
  for (const cond of CONDITIONS.filter((c) => c.isRoute)) {
    const instr = norm(cond.instr);
    const leak = queries.find((q) => instr.includes(q));
    if (leak) throw new Error(`routing prompt ${cond.id} contains an eval query verbatim ("${leak}") — that teaches the test. Use a held-out example.`);
  }
}
if (!process.env.ANALYZE) {
  mkdirSync(RUN_DIR, { recursive: true });
  const jobs: Array<{ c: RoutingCase; cond: Condition; rep: number; file: string }> = [];
  for (const cond of RUN_CONDITIONS) {
    for (let rep = 1; rep <= CONFIG.reps; rep++) {
      const file = `${RUN_DIR}/t8-${PROVIDER}-${TIER}-${cond.id}-rep${rep}.jsonl`;
      const done = new Set(existsSync(file) ? readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map((l) => (JSON.parse(l) as RoutingRow).id) : []);
      for (const c of cases) if (!done.has(c.id)) jobs.push({ c, cond, rep, file });
    }
  }
  console.log(`task8: ${jobs.length} cases queued across ${RUN_CONDITIONS.map((c) => c.id).join('/')} (concurrency ${CONFIG.concurrency})`);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(CONFIG.concurrency, jobs.length) }, async () => {
    while (next < jobs.length) {
      const job = jobs[next++];
      const row = await runCase(job.c, job.cond, job.rep);
      writeFileSync(job.file, `${JSON.stringify(row)}\n`, { flag: 'a' });
    }
  }));
}

// ── aggregate ──
const thisModel = modelFor(PROVIDER, TIER);
const rows: RoutingRow[] = (existsSync(RUN_DIR)
  ? readdirSync(RUN_DIR).filter((f) => f.endsWith('.jsonl')).flatMap((f) => readFileSync(`${RUN_DIR}/${f}`, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l) as RoutingRow))
  : [])
  .filter((r) => r.model === thisModel); // keep tiers separate when both are on disk
const OUT = TIER === 'frontier' ? 'results/task8-frontier.json' : 'results/task8.json';

const frac = (xs: RoutingRow[], pred: (r: RoutingRow) => boolean) => (xs.length ? xs.filter(pred).length / xs.length : 0);
const byCond = (id: string) => rows.filter((r) => r.condition === id);
const acc = (id: string) => frac(byCond(id), (r) => r.correct);
const haveBookends = byCond('iso').length > 0 && byCond('resolve').length > 0;

// ── correctness-FIRST framing (the metric the previous version got wrong) ──
// We do NOT reward "routed the hard label"; we reward getting the answer right, as
// cheaply as possible. An item only NEEDS routing when the model can't do it by hand:
// derive that empirically from THIS run's bookends — needsResolve = always-ISO usually
// wrong here AND always-resolve fixes it. A hard-labeled item the model nails in ISO
// (e.g. "Christmas" → 12-25..12-26) is correctly self-computed, not a routing failure.
const perItemMode = (id: string, condId: string) => byCond(condId).filter((r) => r.id === id);
const itemAccUnder = (id: string, condId: string) => {
  const rs = perItemMode(id, condId);
  return rs.length ? rs.filter((r) => r.correct).length / rs.length : null;
};
const items = cases.map((c) => {
  const isoAcc = itemAccUnder(c.id, 'iso');
  const resolveAcc = itemAccUnder(c.id, 'resolve');
  const needsResolve = haveBookends && isoAcc != null && resolveAcc != null && isoAcc <= 0.5 && resolveAcc >= 0.5;
  const perCond = Object.fromEntries(RUN_CONDITIONS.map((cd) => {
    const rs = perItemMode(c.id, cd.id);
    return [cd.id, { n: rs.length, correct: rs.filter((r) => r.correct).length, delegated: rs.filter((r) => r.actualRoute === 'resolve').length, sample: rs.find((r) => r.answered)?.answered ?? '(no call)' }];
  }));
  return { id: c.id, query: c.query, labelHardness: c.hardness, isoAcc, resolveAcc, needsResolve, perCond };
});
const needsResolveIds = new Set(items.filter((i) => i.needsResolve).map((i) => i.id));
const isoFineIds = new Set(items.filter((i) => !i.needsResolve && i.isoAcc != null && i.isoAcc >= 0.5).map((i) => i.id));

// per-condition scorecard. For routing prompts the goal: match always-resolve ACCURACY
// while resolving fewer items (skip the ones ISO handles). Recall = of items that NEED
// resolve, how many did it route; over-resolve = of ISO-fine items, how many it routed.
const conditions = RUN_CONDITIONS.map((cd) => {
  const rs = byCond(cd.id);
  const needRs = rs.filter((r) => needsResolveIds.has(r.id));
  const fineRs = rs.filter((r) => isoFineIds.has(r.id));
  return {
    id: cd.id, isRoute: cd.isRoute, n: rs.length,
    answerAccuracy: frac(rs, (r) => r.correct),
    resolveRate: frac(rs, (r) => r.actualRoute === 'resolve'),
    recallNeedsResolve: cd.isRoute ? frac(needRs, (r) => r.actualRoute === 'resolve') : null,
    accuracyOnNeedsResolve: needRs.length ? frac(needRs, (r) => r.correct) : null,
    overResolveOnFine: cd.isRoute ? frac(fineRs, (r) => r.actualRoute === 'resolve') : null,
  };
});

const summary = {
  model: modelFor(PROVIDER, TIER),
  reps: CONFIG.reps,
  n: rows.length,
  conditions,
  bookends: { isoAccuracy: acc('iso'), resolveAccuracy: acc('resolve'), n: byCond('iso').length },
  needsResolveCount: needsResolveIds.size,
  isoFineCount: isoFineIds.size,
  items,
};
mkdirSync('results', { recursive: true });
writeFileSync(OUT, JSON.stringify(summary, null, 1));
console.log(`\nwrote ${OUT} — ${rows.length} rows`);
console.log(`bookends: always-ISO ${(acc('iso') * 100).toFixed(0)}% · always-resolve ${(acc('resolve') * 100).toFixed(0)}% · ${needsResolveIds.size} items genuinely need resolve`);
for (const c of conditions) {
  const tail = c.isRoute ? `  recall(needs-resolve) ${((c.recallNeedsResolve ?? 0) * 100).toFixed(0)}%  over-resolve(fine) ${((c.overResolveOnFine ?? 0) * 100).toFixed(0)}%` : '';
  console.log(`${c.id.padEnd(10)} acc ${(c.answerAccuracy * 100).toFixed(0)}%  resolve-rate ${(c.resolveRate * 100).toFixed(0)}%${tail}`);
}

// self-contained drop-in export
const exportCases = cases.map((c) => {
  const { key, acceptable } = expectedIntervals(c);
  return { id: c.id, query: c.query, anchor: c.anchor, hardness: c.hardness, expected: key, acceptable };
});
writeFileSync('artifacts/routing-eval.json', JSON.stringify({ note: 'Routing-discrimination eval. hardness labels are Haiku-empirical (direct-ISO failures in Task 4); the runner also derives needs-resolve from the always-ISO/always-resolve bookends. Goal: a routing prompt matching always-resolve accuracy at a lower resolve-rate.', cases: exportCases }, null, 1));
console.log('wrote artifacts/routing-eval.json');
