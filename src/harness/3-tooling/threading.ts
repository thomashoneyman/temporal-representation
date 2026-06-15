/**
 * Task 7 — multi-hop threading & drift. `npm run threading`
 *
 * Drives each chain as ONE conversation: per hop, the model gets the next instruction
 * and must call query_range with the right time argument. Three arms:
 *   iso      — the model computes every date itself
 *   iso-tool — a deterministic shift_date helper is available (usage measured)
 *   ir       — a resolve_range tool accepts ScateLite expressions; defined milestones
 *              are bound (by the HARNESS, from ground truth) as refs the model can
 *              name without ever seeing the concrete dates it would need to compute
 *
 * Scoring (pure, scoring/threading.ts): the query_range args at each hop vs the
 * resolver-computed key; misses classified arithmetic / anchor-binding (via labeled
 * distractors: the value each WRONG milestone binding would produce) / wrong-operation.
 * Output: results/3-tooling/threading.json (per-hop rows + drift curve per arm/model).
 */
import { Agent } from '@mastra/core/agent';
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { CONFIG, type Provider, type Tier } from '../../../experiment.config.js';
import { CHAINS, type ChainItem } from '../../datasets/cases/09-chains.js';
import { anchorIso } from '../../datasets/cases/index.js';
import { DEFAULT_CONVENTIONS } from '../../scate-lite/conventions.js';
import type { TimeExpr } from '../../scate-lite/ir.js';
import { ZONE, type Interval } from '../../scate-lite/interval.js';
import { resolveIR } from '../../scate-lite/resolver.js';
import { z } from 'zod';
import { TimeExprThreadingSchema } from '../../scate-lite/ir.js';
import { driftCurve, scoreHop, type HopScore } from '../../scoring/threading.js';
import { lowReasoning, modelFor } from '../../mastra/models.js';
import { makeExprQueryTool, makeHybridQueryTool, makeResolveRangeTool, queryRangeTool, shiftTool } from '../../mastra/tools.js';
import { DateTime } from 'luxon';

type Arm = 'iso' | 'iso-tool' | 'ir' | 'hybrid';
const RUN_DIR = process.env.RUN_DIR ?? 'results/runs/3-tooling/threading';
// hybrid-contract iteration knobs (mini-tier exploration before any frontier confirm)
const HYBRID_STRING_EXPR = process.env.HYBRID_EXPR === 'string';
const HYBRID_GUIDED = process.env.HYBRID_GUIDE === '1';
// structural variants of the hybrid contract: '' (single dual-field tool) | 'twin'
// (separate ISO and expression query tools) | 'mode' (required discriminator) |
// 'union' (expr accepts object or JSON string)
const HYBRID_VARIANT = process.env.HYBRID_VARIANT ?? '';
// few-shot syntax examples (HYBRID_SHOTS=1): node-type compositions chosen to show
// SYNTAX without solving any chain hop (kept distant from chain instructions — the
// contamination standard applies to these surfaces too)
const FEW_SHOT = `\nExpression syntax examples (note: every nested field is a complete object):
  {"type":"shift","base":{"type":"ref","id":"contract_signed"},"by":"P45D","direction":"before"}
  {"type":"weekday","day":"thu","which":"nearest","of":{"type":"date","month":8,"day":15}}
  {"type":"range","from":{"type":"date","month":2,"day":1},"to":{"type":"date","month":2,"day":14}}`;
const HYBRID_SHOTS = process.env.HYBRID_SHOTS === '1';
// HYBRID_GRAMMAR=1: inline the grammar's JSON schema into the instructions — the fair
// string-channel contract (a string-typed expr field otherwise hides the grammar
// entirely; the model composes blind and falls back on ISO half-open habits)
const HYBRID_GRAMMAR = process.env.HYBRID_GRAMMAR === '1';
const GRAMMAR_DOC = `\nThe expression grammar (JSON Schema; note range.to is INCLUSIVE of its unit — set endExclusive:true for an exclusive boundary):\n${JSON.stringify(z.toJSONSchema(TimeExprThreadingSchema))}`;
const ARMS: Arm[] = (process.env.ARMS ? (process.env.ARMS.split(',') as Arm[]) : ['iso', 'iso-tool', 'ir']);

const keyFor: Record<Provider, string | undefined> = {
  openai: process.env.OPENAI_API_KEY,
  anthropic: process.env.ANTHROPIC_API_KEY,
  google: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
};
const providers = CONFIG.providers.filter((p) => Boolean(keyFor[p]));

import { chainCtx, chainKeys } from '../../datasets/cases/lib/chain-keys.js';
const ctxFor = chainCtx;

const armInstructions = (arm: Arm, anchor: string, milestones: string[]): string => {
  const weekday = DateTime.fromISO(anchor, { zone: ZONE }).weekdayLong;
  return [
    `You are a data assistant executing a multi-step investigation. At each step, call query_range exactly once with the half-open ISO time range [start, end) the step asks for, then briefly confirm. Treat the Anchor as the current date/time; never use the real clock.`,
    `Anchor (treat as now): ${anchor} (${weekday}). Time zone America/New_York.`,
    arm === 'iso-tool'
      ? 'A deterministic shift_date tool is available for date arithmetic — prefer it over computing dates yourself.'
      : arm === 'ir'
        ? `Use resolve_range to turn time expressions into concrete ranges instead of computing dates yourself.${milestones.length ? ` Defined milestones you can reference by id: ${milestones.join(', ')}.` : ''}`
        : arm === 'hybrid' && HYBRID_VARIANT === 'twin'
          ? `Two query tools are available: query_range takes concrete ISO start+end — use it when the dates are simple and certain. query_range_expr takes a ScateLite expression it resolves internally — use it for the hard cases: business-day or holiday-aware arithmetic; anything computed from a named earlier milestone; week/month/quarter alignment; and windows that cross a daylight-saving change.${milestones.length ? ` Defined milestones you can reference inside the expression by id: ${milestones.join(', ')}.` : ''}${HYBRID_SHOTS ? FEW_SHOT : ''}${HYBRID_GRAMMAR ? GRAMMAR_DOC : ''}`
          : arm === 'hybrid'
          ? `query_range accepts the time either way: concrete ISO start+end, or a ScateLite expression in \`expr\` that it resolves internally${HYBRID_STRING_EXPR ? ' (send the expression as a JSON string)' : ''}. Use concrete ISO when the dates are simple and certain. Use \`expr\` for the hard cases: business-day or holiday-aware arithmetic; anything computed from a named earlier milestone; week/month/quarter alignment; and windows that cross a daylight-saving change.${milestones.length ? ` Defined milestones you can reference inside expr by id: ${milestones.join(', ')}.` : ''}${HYBRID_VARIANT === 'mode' ? ' Set mode FIRST ("iso" or "expr"), then fill only that representation.' : ''}${HYBRID_GUIDED ? `\nExample of a complete expression${HYBRID_STRING_EXPR ? ' (as a string)' : ''}: ${HYBRID_STRING_EXPR ? '"{\\"type\\":\\"shift\\",\\"base\\":{\\"type\\":\\"ref\\",\\"id\\":\\"<milestone>\\"},\\"by\\":\\"P2D\\",\\"direction\\":\\"after\\"}"' : '{"type":"shift","base":{"type":"ref","id":"<milestone>"},"by":"P2D","direction":"after"}'}. Every nested field (base, from, to, of) must be a COMPLETE object — never {} or omitted-but-required. If you cannot form the expression, compute concrete ISO instead.` : ''}${HYBRID_SHOTS ? FEW_SHOT : ''}${HYBRID_GRAMMAR ? GRAMMAR_DOC : ''}`
          : '',
  ].filter(Boolean).join('\n');
};

interface HopRow {
  chainId: string; arm: Arm; provider: Provider; model: string; rep: number;
  hop: number; depth: number; bindsTo: string;
  args: { start: string; end: string } | null;
  usedHelper: boolean;
  /** hybrid arm only: which representation the model chose for this hop's call. */
  hybridMode?: 'iso' | 'expr';
  /** Every helper-tool invocation this hop (resolve_range exprs / shift_date inputs)
   *  with its result — the data needed to tell representation-misleads from model-slips. */
  helperCalls?: Array<{ name: string; input: unknown; output?: unknown }>;
  score: HopScore;
  usage: { in: number; out: number };
}

async function runChain(chain: ChainItem, arm: Arm, provider: Provider, rep: number): Promise<HopRow[]> {
  const anchor = anchorIso(chain.anchor);
  const keys = chainKeys(chain);
  const boundPresets: Record<string, TimeExpr> = {};
  const rows: HopRow[] = [];
  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [
    { role: 'user', content: chain.setup },
    { role: 'assistant', content: 'Understood. Ready for the first step.' },
  ];

  for (const [i, hop] of chain.hops.entries()) {
    const milestoneNames = Object.keys(boundPresets);
    // Register under the tool IDs — Mastra reports the registration KEY as toolName.
    // (loosely typed: the three tools have distinct id/schema generics)
    const tools: Record<string, unknown> =
      arm === 'hybrid'
        ? HYBRID_VARIANT === 'twin'
          ? { query_range: queryRangeTool, query_range_expr: makeExprQueryTool(() => boundPresets, () => anchor) }
          : { query_range: makeHybridQueryTool(() => boundPresets, () => anchor, { stringExpr: HYBRID_STRING_EXPR, mode: HYBRID_VARIANT === 'mode', unionExpr: HYBRID_VARIANT === 'union' }) }
        : { query_range: queryRangeTool };
    if (arm === 'iso-tool') tools.shift_date = shiftTool;
    if (arm === 'ir') tools.resolve_range = makeResolveRangeTool(() => boundPresets, () => anchor);
    const agent = new Agent({
      id: `t7-${arm}`, name: `t7-${arm}`,
      description: 'threading arm',
      model: modelFor(provider, CONFIG.tier as Tier),
      instructions: armInstructions(arm, anchor, milestoneNames),
      tools: tools as never,
    });
    let args: { start: string; end: string } | null = null;
    let usedHelper = false;
    let hybridMode: 'iso' | 'expr' | undefined;
    let usage = { in: 0, out: 0 };
    let helperCalls: Array<{ name: string; input: unknown }> = [];
    try {
      const res = await agent.generate([...messages, { role: 'user', content: hop.instruction }] as never, {
        maxSteps: 6,
        providerOptions: lowReasoning(provider, CONFIG.tier as Tier) as never,
      });
      const r = res as { toolCalls?: Array<{ toolName?: string; args?: unknown; input?: unknown }>; text?: string; usage?: { inputTokens?: number; outputTokens?: number }; steps?: unknown[] };
      usage = { in: r.usage?.inputTokens ?? 0, out: r.usage?.outputTokens ?? 0 };
      // shape-tolerant scan over the whole result for tool calls (SDK result shapes vary)
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
          if (a && typeof a === 'object' && !calls.some((c) => c.name === name && JSON.stringify(c.args) === JSON.stringify(a))) {
            calls.push({ name, args: a as Record<string, unknown> });
          }
        }
        for (const v of Object.values(o)) scan(v, depth + 1);
      })(res, 0);
      usedHelper = calls.some((c) => c.name === 'shift_date' || c.name === 'resolve_range');
      helperCalls = calls
        .filter((c) => c.name === 'shift_date' || c.name === 'resolve_range')
        .map((c) => ({ name: c.name, input: c.args }));
      // the LAST matching call is authoritative: a failed attempt (validation error,
      // unresolvable expr) triggers a retry, and the retry is what the query ran on
      const qrCalls = calls.filter((c) =>
        (c.name === 'query_range' && (typeof c.args.start === 'string' && typeof c.args.end === 'string' || c.args.expr != null)) ||
        (c.name === 'query_range_expr' && c.args.expr != null));
      const qr = qrCalls[qrCalls.length - 1];
      if (qr) {
        if (qr.name === 'query_range' && typeof qr.args.start === 'string' && typeof qr.args.end === 'string') {
          // a malformed timestamp (we saw a stray brace) must score as a miss, not
          // crash the chain-run inside scoreHop
          if (DateTime.fromISO(qr.args.start).isValid && DateTime.fromISO(qr.args.end).isValid) {
            args = { start: qr.args.start, end: qr.args.end };
          } else {
            helperCalls.push({ name: 'query_range.malformed-iso', input: qr.args });
          }
          if (arm === 'hybrid') hybridMode = 'iso';
        } else if (qr.args.expr != null) {
          if (typeof qr.args.expr === 'string') {
            try { qr.args.expr = JSON.parse(qr.args.expr); } catch { qr.args.expr = { unparseable: qr.args.expr }; }
          }
          // resolve exactly as the tool did (same deterministic ctx) to get the
          // effective interval the query ran over; keep the expr (and any failure)
          // for the audit trail either way
          hybridMode = 'expr';
          try {
            const r = resolveIR(qr.args.expr as TimeExpr, ctxFor(anchor, boundPresets), { requireShape: 'range' });
            args = { start: r.intervals[0].start, end: r.intervals[0].end };
            helperCalls.push({ name: 'query_range.expr', input: qr.args.expr });
          } catch (err) {
            args = null;
            helperCalls.push({ name: 'query_range.expr-error', input: { expr: qr.args.expr, error: String((err as Error).message).slice(0, 160) } });
          }
        }
      }

      messages.push({ role: 'user', content: hop.instruction });
      messages.push({ role: 'assistant', content: (r.text ?? 'done').slice(0, 400) });
    } catch (err) {
      messages.push({ role: 'user', content: hop.instruction });
      messages.push({ role: 'assistant', content: `(error: ${(err as Error).message.slice(0, 80)})` });
    }
    const key = keys[i];
    const score: HopScore = args
      ? scoreHop([{ start: args.start, end: args.end }], { expected: key.expected, distractors: key.distractors })
      : { correct: false, errorClass: 'wrong-operation' };
    rows.push({
      chainId: chain.id, arm, provider, model: modelFor(provider, CONFIG.tier as Tier), rep,
      hop: i + 1, depth: i + 1, bindsTo: hop.bindsTo, args, usedHelper,
      ...(hybridMode ? { hybridMode } : {}),
      ...(helperCalls.length ? { helperCalls } : {}),
      score, usage,
    });
    // Bind ground-truth milestones for the NEXT hop (the harness, not the model, owns
    // bindings — so a hop graded wrong doesn't poison later keys).
    if (hop.defines) {
      const iv = key.expected[0];
      boundPresets[hop.defines] = { type: 'iso', start: iv.start, end: iv.end } as TimeExpr;
    }
  }
  return rows;
}

// ── run: chain-runs are independent across (provider × arm × rep × chain) — execute
// them through a worker pool (within a chain, hops stay strictly sequential). ──
if (!process.env.ANALYZE) {
  mkdirSync(RUN_DIR, { recursive: true });
  const jobs: Array<{ provider: Provider; arm: Arm; rep: number; chain: ChainItem; file: string }> = [];
  for (const provider of providers) {
    for (const arm of ARMS) {
      for (let rep = 1; rep <= CONFIG.reps; rep++) {
        const file = `${RUN_DIR}/t7-${provider}-${CONFIG.tier}-${arm}-rep${rep}.jsonl`;
        const done = new Set(
          existsSync(file)
            ? readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map((l) => (JSON.parse(l) as HopRow).chainId)
            : [],
        );
        for (const chain of CHAINS) {
          if (!done.has(chain.id)) jobs.push({ provider, arm, rep, chain, file });
        }
      }
    }
  }
  console.log(`task7: ${jobs.length} chain-runs queued (concurrency ${CONFIG.concurrency})`);
  const queue = [...jobs];
  await Promise.all(
    Array.from({ length: Math.min(CONFIG.concurrency, queue.length) }, async () => {
      for (let job = queue.shift(); job !== undefined; job = queue.shift()) {
        try {
          const rows = await runChain(job.chain, job.arm, job.provider, job.rep);
          for (const row of rows) appendFileSync(job.file, `${JSON.stringify(row)}\n`);
          const okN = rows.filter((r) => r.score.correct).length;
          console.log(`task7 ${job.provider}/${CONFIG.tier} ${job.arm} rep${job.rep} ${job.chain.id}: ${okN}/${rows.length} hops correct`);
        } catch (err) {
          console.log(`task7 ${job.provider}/${CONFIG.tier} ${job.arm} rep${job.rep} ${job.chain.id}: FAILED ${(err as Error).message.slice(0, 120)}`);
        }
      }
    }),
  );
}

// ── aggregate: drift curve + error taxonomy per (model × arm) ──
// Rows are RE-SCORED from their stored args against the CURRENT chain keys, so key
// or rubric corrections never require re-buying model calls.
const keyCache = new Map(CHAINS.map((c) => [c.id, chainKeys(c)]));
const chainById = new Map(CHAINS.map((c) => [c.id, c]));
const rawRows: HopRow[] = existsSync(RUN_DIR)
  ? readdirSync(RUN_DIR).filter((f) => f.endsWith('.jsonl')).flatMap((f) =>
      readFileSync(`${RUN_DIR}/${f}`, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l) as HopRow))
  : [];

// Re-score every row against the CURRENT keys. Additionally detect CASCADES: a hop
// graded wrong against ground truth, but matching what the hop's expression yields
// when the MODEL'S OWN earlier answers serve as the milestone bindings — i.e. correct
// local reasoning propagating an earlier divergence (often a defensible reading of an
// underspecified step). Locally right, globally off; its own class, not 'arithmetic'.
const byTrajectory = new Map<string, HopRow[]>();
for (const r of rawRows) {
  const k = `${r.model}|${r.arm}|${r.rep}|${r.chainId}`;
  byTrajectory.set(k, [...(byTrajectory.get(k) ?? []), r]);
}
const all: HopRow[] = [];
for (const [, traj] of byTrajectory) {
  traj.sort((a, b) => a.hop - b.hop);
  const chain = chainById.get(traj[0].chainId);
  const keys = keyCache.get(traj[0].chainId);
  const selfBindings: Record<string, TimeExpr> = {};
  for (const row of traj) {
    const hop = chain?.hops[row.hop - 1];
    const k = keys?.[row.hop - 1];
    if (!hop || !k) { all.push(row); continue; }
    let score: HopScore = row.args
      ? scoreHop([{ start: row.args.start, end: row.args.end }], { expected: k.expected, acceptable: k.acceptable, distractors: k.distractors })
      : { correct: false, errorClass: 'wrong-operation' };
    if (!score.correct && row.args && Object.keys(selfBindings).length) {
      try {
        const selfKey = resolveIR(hop.canonicalIR, ctxFor(anchorIso(chain.anchor), selfBindings)).intervals;
        const selfScore = scoreHop([{ start: row.args.start, end: row.args.end }], { expected: selfKey });
        if ((selfScore.correct || selfScore.errorClass === 'zone-offset') &&
            JSON.stringify(selfKey) !== JSON.stringify(k.expected)) {
          score = { correct: false, errorClass: 'cascade' };
        }
      } catch { /* self-derivation unresolvable — keep ground-truth classification */ }
    }
    all.push({ ...row, score });
    // Self-bindings follow the MODEL's answers at defining hops (fall back to truth
    // when it made no call, so later self-derivations stay well-defined).
    if (hop.defines) {
      const iv = row.args ?? { start: k.expected[0].start, end: k.expected[0].end };
      selfBindings[hop.defines] = { type: 'iso', start: iv.start, end: iv.end } as TimeExpr;
    }
  }
}
console.log(`\naggregating ${all.length} hop rows (re-scored against current keys)`);

const out: Record<string, unknown> = {};
for (const model of new Set(all.map((r) => r.model))) {
  for (const arm of new Set(all.map((r) => r.arm))) {
    const rows = all.filter((r) => r.model === model && r.arm === arm);
    if (!rows.length) continue;
    const errors: Record<string, number> = {};
    for (const r of rows) if (!r.score.correct) errors[r.score.errorClass ?? '?'] = (errors[r.score.errorClass ?? '?'] ?? 0) + 1;
    out[`${model}|${arm}`] = {
      hops: rows.length,
      accuracy: rows.filter((r) => r.score.correct).length / rows.length,
      withinAcceptable: rows.filter((r) => r.score.correct || r.score.errorClass === 'acceptable-alternative').length / rows.length,
      drift: driftCurve(rows.map((r) => ({ depth: r.depth, correct: r.score.correct }))),
      errors,
      helperUseRate: rows.filter((r) => r.usedHelper).length / rows.length,
      noCallRate: rows.filter((r) => r.args === null).length / rows.length,
      ...(arm === 'hybrid' ? { exprUseRate: rows.filter((r) => r.hybridMode === 'expr').length / rows.length } : {}),
    };
  }
}
mkdirSync('results', { recursive: true });
// variant/iteration runs (RUN_DIR override) keep their aggregate next to their rows —
// only the canonical run dir owns results/3-tooling/threading.json
writeFileSync(RUN_DIR === 'results/runs/3-tooling/threading' ? 'results/3-tooling/threading.json' : `${RUN_DIR}/aggregate.json`, JSON.stringify({ generatedAt: new Date().toISOString(), tier: CONFIG.tier, reps: CONFIG.reps, cells: out, rows: all }, null, 2));
console.log('wrote results/3-tooling/threading.json');
