/**
 * Step-12 synthesis — `pnpm analyze` → results/summary.json + results/report.md.
 *
 * Loads every task's results file (and Task 5's raw rows, for prompted determinism),
 * flattens them into one stable cell schema, computes Wilson 95% CIs for every
 * proportion, prices every cell from recorded token usage, and fills in DESIGN's
 * Synthesis decision table with per-technique verdicts and the evidence that decided
 * them. summary.json is the single interchange the leaderboard page reads.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { CONFIG } from '../../experiment.config.js';
import { ALL_CASES, anchorIso } from '../datasets/cases/index.js';
import type { CaseItem } from '../datasets/cases/lib/types.js';
import { PRICING } from '../mastra/models.js';
import { toEnvelope } from '../representation/translation-schema.js';
import { DEFAULT_CONVENTIONS } from '../scate-lite/conventions.js';
import { intervalsEqual } from '../scate-lite/interval.js';
import { scoreTranslation } from '../scoring/translation.js';

// ── helpers ──

/** Wilson 95% interval for a proportion — sane at small n and at p near 0/1. */
function wilson(k: number, n: number): { lo: number; hi: number } {
  if (n === 0) return { lo: 0, hi: 1 };
  const z = 1.96;
  const p = k / n;
  const denom = 1 + (z * z) / n;
  const center = (p + (z * z) / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
  return { lo: Math.max(0, center - half), hi: Math.min(1, center + half) };
}

interface SummaryCell {
  task: string;
  model: string;
  arm: string;
  slice: string;
  metric: string;
  value: number;
  n: number;
  ci?: { lo: number; hi: number };
}
const cells: SummaryCell[] = [];
const prop = (task: string, model: string, arm: string, slice: string, metric: string, k: number, n: number): void => {
  if (n > 0) cells.push({ task, model, arm, slice, metric, value: k / n, n, ci: wilson(k, n) });
};

// ── Task 4 (graded translation) + Task 6 (clarify / no-time) from phase2.json ──
interface P2Cell { n: number; exact: number; withinAcceptable: number; determinism?: { itemsWithReps: number; agreeing: number }; tokens?: { in: number; out: number } }
const p2 = JSON.parse(readFileSync('results/phase2.json', 'utf8')) as {
  keyVersion: string; promptVersion: string; reps: number;
  cells: Record<string, P2Cell>;
  task6: Record<string, { clarification: { precision: number; recall: number; f1: number }; noTime: { precision: number; recall: number; f1: number } }>;
};
for (const [key, c] of Object.entries(p2.cells)) {
  const [model, arm, slice] = key.split('|');
  prop('task4', model, arm, slice, 'exact', c.exact, c.n);
  prop('task4', model, arm, slice, 'withinAcceptable', c.withinAcceptable, c.n);
}
for (const [key, t] of Object.entries(p2.task6)) {
  const [model, arm] = key.split('|');
  for (const [which, prf] of Object.entries(t)) {
    cells.push({ task: 'task6', model, arm, slice: 'ALL', metric: `${which}-precision`, value: prf.precision, n: NaN });
    cells.push({ task: 'task6', model, arm, slice: 'ALL', metric: `${which}-recall`, value: prf.recall, n: NaN });
  }
}

// ── Task 5 (steering) from task5.json ──
const t5 = JSON.parse(readFileSync('results/task5.json', 'utf8')) as {
  cells: Record<string, Record<'free' | 'steered', { exact: number; n: number }>>;
};
for (const [key, c] of Object.entries(t5.cells)) {
  const [model, arm] = key.split('|');
  prop('task5', model, arm, 'ALL', 'exact-free', Math.round(c.free.exact * c.free.n), c.free.n);
  prop('task5', model, arm, 'ALL', 'exact-steered', Math.round(c.steered.exact * c.steered.n), c.steered.n);
}

// ── Task 7 (threading) / Task 7b (decomposition) ──
const t7 = JSON.parse(readFileSync('results/task7.json', 'utf8')) as {
  cells: Record<string, { accuracy: number; withinAcceptable: number; n?: number; errors: Record<string, number> }>;
  rows: Array<{ model: string; arm: string; score: { correct: boolean } }>;
};
for (const [key, c] of Object.entries(t7.cells)) {
  const [model, arm] = key.split('|');
  const n = t7.rows.filter((r) => r.model === model && r.arm === arm).length;
  prop('task7', model, arm, 'chains', 'hop-exact', Math.round(c.accuracy * n), n);
  prop('task7', model, arm, 'chains', 'hop-withinAcceptable', Math.round(c.withinAcceptable * n), n);
}
const t7b = JSON.parse(readFileSync('results/task7b.json', 'utf8')) as {
  cells: Record<string, { n: number; exactSet: number; meanF1: number; failures: Record<string, number> }>;
};
for (const [key, c] of Object.entries(t7b.cells)) {
  const [model, arm] = key.split('|');
  prop('task7b', model, arm, 'compound', 'exact-set', Math.round(c.exactSet * c.n), c.n);
  cells.push({ task: 'task7b', model, arm, slice: 'compound', metric: 'mean-f1', value: c.meanF1, n: c.n });
}

// ── tool-contract comparison (the architecture question): for each way a tool can take
// a time argument, the per-model threading accuracy, so the summary page can render the
// verdict directly. iso/hybrid/ir come from the aggregated cells; twin is an iteration
// variant read from its run dir (same hop-row shape). ──
const MODELS_TC = ['anthropic/claude-haiku-4-5', 'openai/gpt-5.4-mini', 'anthropic/claude-opus-4-8', 'openai/gpt-5.5'];
const readHopDir = (dir: string): Array<{ model: string; score: { correct: boolean } }> =>
  existsSync(dir)
    ? readdirSync(dir).filter((f) => f.endsWith('.jsonl')).flatMap((f) =>
        readFileSync(`${dir}/${f}`, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l) as { model: string; score: { correct: boolean } }))
    : [];
const accFromRows = (rs: Array<{ model: string; score: { correct: boolean } }>) =>
  Object.fromEntries(MODELS_TC.map((m) => {
    const sub = rs.filter((r) => r.model === m);
    return [m, sub.length ? sub.filter((r) => r.score.correct).length / sub.length : null];
  }));
const armRows = (arm: string) => t7.rows.filter((r) => r.arm === arm) as Array<{ model: string; score: { correct: boolean }; usedHelper?: boolean; hybridMode?: string }>;
const accFromArm = (arm: string) => accFromRows(armRows(arm));
// routing rate = fraction of hops sent through the expression/resolve path (not self-computed)
const routeRange = (rows: Array<{ model: string; usedHelper?: boolean; hybridMode?: string }>, kind: 'helper' | 'expr'): string => {
  const rates = MODELS_TC.map((m) => {
    const sub = rows.filter((r) => r.model === m);
    if (!sub.length) return null;
    const routed = sub.filter((r) => (kind === 'helper' ? r.usedHelper : r.hybridMode === 'expr')).length;
    return routed / sub.length;
  }).filter((x): x is number => x != null);
  return rates.length ? `${Math.round(Math.min(...rates) * 100)}–${Math.round(Math.max(...rates) * 100)}%` : '—';
};
// The realistic production shapes only. Twin tools (two variants of the same query op)
// was an experimental DIAGNOSTIC to isolate the required-vs-optional-argument variable —
// you would not ship a doubled tool per operation — so it lives in the task-7 deep-dive,
// not in this production-facing table. Its lesson is folded into the recommended row.
const toolContract = [
  { contract: 'Query tool takes ISO only', shape: 'the model computes every date itself; no expression path', role: 'floor', perModel: accFromArm('iso'),
    verdict: 'Fine for easy traffic and the safe default in a free-form agent; leaves the hard categories (named/custom/ranges/business-day) on the table and admits two ISO-only failure classes (DST offset, bounding-range collapse).' },
  { contract: 'One tool takes ISO *or* IR (optional polymorphic field)', shape: 'a single query tool with an optional expression field', role: 'avoid', perModel: accFromArm('hybrid'),
    verdict: `Anti-pattern. GPT-family models emit degenerate {} into an optional expression field and route only ${routeRange(armRows('hybrid'), 'expr')} of hops; the channel silently degrades to plain ISO plus a foot-gun. Choosing ISO is never penalized — the failures are the broken expression path.` },
  { contract: 'Dedicated resolve(IR)→ISO, then ISO query', shape: 'separate resolve tool emits ISO; domain tools take ISO; instruction: resolve by default', role: 'ceiling', perModel: accFromArm('ir'),
    verdict: `The accuracy ceiling and the recommendation. Query tools still take ISO; IR enters at one shared resolve boundary that emits ISO. The win is NOT structural — the model could still self-compute (query takes ISO) — it is the "resolve by default" instruction, which drives ${routeRange(armRows('ir'), 'helper')} routing here vs the hybrid\'s selective ${routeRange(armRows('hybrid'), 'expr')}. High routing is what reaches 90–100%; self-computed hops are the misses. (A required expression argument is also what makes that path safe — the optional-field anti-pattern above is the contrast; if a time arg must live on a domain tool, make it required, but prefer this shared boundary.)` },
];

// ── determinism: unprompted (Task 4 cells) vs prompted (recomputed from Task 5 raws) ──
const determinism: Record<string, { unprompted?: number; prompted?: number; n?: number }> = {};
for (const [key, c] of Object.entries(p2.cells)) {
  const [model, arm, slice] = key.split('|');
  // K=1 frontier cells have no real repeats (a stray retry row is noise, not data)
  if (slice !== 'ALL' || !c.determinism || c.determinism.itemsWithReps < 20 || model === 'chrono-node') continue;
  (determinism[`${model}|${arm}`] ??= {}).unprompted = c.determinism.agreeing / c.determinism.itemsWithReps;
  determinism[`${model}|${arm}`]!.n = c.determinism.itemsWithReps;
}
{
  // prompted: same identical-resolved-output-across-reps definition, over the steered rows
  interface RawRow { model: string; arm: string; rep: number; itemId: string; raw: unknown; task: string }
  const itemById = new Map<string, CaseItem>(ALL_CASES.map((c) => [c.id, c]));
  const ctxOf = (item: CaseItem) => ({
    anchor: anchorIso(item.anchor),
    conventions: { ...DEFAULT_CONVENTIONS, ...item.conventionsOverride },
    ...(item.customPresets ? { customPresets: item.customPresets } : {}),
    window: CONFIG.window,
  });
  const rows: RawRow[] = existsSync('results/runs/task5')
    ? readdirSync('results/runs/task5').filter((f) => f.endsWith('.jsonl')).flatMap((f) =>
        readFileSync(`results/runs/task5/${f}`, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l) as RawRow))
    : [];
  for (const model of [...new Set(rows.map((r) => r.model))]) {
    for (const arm of [...new Set(rows.map((r) => r.arm))]) {
      const byItem = new Map<string, RawRow[]>();
      for (const r of rows) if (r.model === model && r.arm === arm) byItem.set(r.itemId, [...(byItem.get(r.itemId) ?? []), r]);
      let withReps = 0, agreeing = 0;
      for (const list of byItem.values()) {
        if (list.length < 2) continue;
        const resolved = list.map((r) => {
          const item = itemById.get(r.itemId);
          if (!item || r.raw === null) return null;
          const env = toEnvelope(r.raw);
          return env === null ? null : scoreTranslation(env, item, ctxOf(item), r.arm === 'ir' ? 'ir' : 'iso').resolved ?? null;
        });
        withReps++;
        const [first, ...rest] = resolved;
        if (rest.every((x) => (x && first ? intervalsEqual(x.intervals, first.intervals) : x === first))) agreeing++;
      }
      if (withReps) (determinism[`${model}|${arm}`] ??= {}).prompted = agreeing / withReps;
    }
  }
}

// ── cost: token usage × pricing, normalized to $ per 100 questions ──
const cost: Record<string, { per100Questions: number; tokensPerAnswer: { in: number; out: number } }> = {};
for (const [key, c] of Object.entries(p2.cells)) {
  const [model, arm, slice] = key.split('|');
  if (slice !== 'ALL' || !c.tokens || !PRICING[model]) continue;
  const dollars = (c.tokens.in * PRICING[model].in + c.tokens.out * PRICING[model].out) / 1e6;
  cost[`${model}|${arm}`] = {
    per100Questions: (dollars / c.n) * 100,
    tokensPerAnswer: { in: Math.round(c.tokens.in / c.n), out: Math.round(c.tokens.out / c.n) },
  };
}

// ── the DESIGN Synthesis decision table, filled ──
const pc = (model: string, arm: string, slice: string, metric = 'exact'): number => {
  const c = cells.find((x) => x.task === 'task4' && x.model === model && x.arm === arm && x.slice === slice && x.metric === metric);
  return c ? Math.round(c.value * 100) : NaN;
};
const decisionTable = [
  {
    technique: 'Direct ISO, no tool',
    adoptWhen: 'the ISO arm already clears the accuracy + determinism bar on a slice',
    verdict: 'ADOPT for the easy majority at frontier; insufficient alone',
    evidence: `Frontier ISO is strong on specific dates (opus ${pc('anthropic/claude-opus-4-8', 'iso', 'specific')}%, gpt-5.5 ${pc('openai/gpt-5.5', 'iso', 'specific')}%) and — contrary to the 2024-25 literature — on day-grain arithmetic (relative slice: opus ${pc('anthropic/claude-opus-4-8', 'iso', 'relative')}%, gpt-5.5 ${pc('openai/gpt-5.5', 'iso', 'relative')}%) once one grain-guidance sentence is in the prompt. But ISO never beats IR overall for ANY model (Task 4 ALL), trails on compound/custom slices, and is the only arm producing DST zone-offset errors (Task 7).`,
  },
  {
    technique: 'Preset crib',
    adoptWhen: 'a precomputed preset measurably lifts a flaky-but-common case',
    verdict: 'ADOPT, narrowly — cheap insurance, not a fix',
    evidence: `The crib lifts ISO +1..+5pt overall (Task 4: e.g. gpt-5.5 ${pc('openai/gpt-5.5', 'iso', 'ALL')}→${pc('openai/gpt-5.5', 'iso-preset', 'ALL')}%, opus ${pc('anthropic/claude-opus-4-8', 'iso', 'ALL')}→${pc('anthropic/claude-opus-4-8', 'iso-preset', 'ALL')}%) and steering conventions in the prompt converts IR's reasonable-alternatives to exact while ISO's persist (Task 5). It never closes the ISO→IR gap.`,
  },
  {
    technique: 'Resolve tool / tools accept a restricted IR',
    adoptWhen: 'IR beats ISO on a slice (custom presets, ranges/sets)',
    verdict: 'ADOPT — the headline result',
    evidence: `IR leads or ties ISO for all four models on overall translation (Task 4 ALL: haiku ${pc('anthropic/claude-haiku-4-5', 'ir', 'ALL')} vs ${pc('anthropic/claude-haiku-4-5', 'iso', 'ALL')}, gpt-mini ${pc('openai/gpt-5.4-mini', 'ir', 'ALL')} vs ${pc('openai/gpt-5.4-mini', 'iso', 'ALL')}, opus ${pc('anthropic/claude-opus-4-8', 'ir', 'ALL')} vs ${pc('anthropic/claude-opus-4-8', 'iso', 'ALL')}, gpt-5.5 ${pc('openai/gpt-5.5', 'ir', 'ALL')} vs ${pc('openai/gpt-5.5', 'iso', 'ALL')}), with the biggest margins exactly where predicted: compound/multipart and custom presets. It holds in tool-threading (Task 7: IR best cell for all four) and decomposition (Task 7b: haiku +17pt, opus 94% vs 88%).`,
  },
  {
    technique: 'Arithmetic / shift tool',
    adoptWhen: "the model's own arithmetic is below bar or drifts over hops",
    verdict: 'SKIP as a standalone tool — fold arithmetic into resolve',
    evidence: `Day-grain arithmetic is no longer below bar with grain guidance (Task 4 relative slice ≥${Math.min(pc('anthropic/claude-opus-4-8', 'iso', 'relative'), pc('openai/gpt-5.5', 'iso', 'relative'))}% at frontier); the residual failures are business-day/holiday table arithmetic and extreme magnitudes. Offered a shift tool, models used it in only 6–20% of attempts and it was net-NEGATIVE or neutral in both threading (Task 7: haiku 80 vs 88 plain-ISO) and decomposition (Task 7b: every model's tool arm ≤ its plain-ISO arm at frontier). The resolve tool already subsumes the arithmetic cases.`,
  },
  {
    technique: 'Tool contract: ISO vs shape-restricted IR',
    adoptWhen: 'ISO has significant threading/decomposition errors and a shape-restricted IR contract is better',
    verdict: 'ADOPT IR-capable boundaries for weak/unknown models; ISO params acceptable at frontier',
    evidence: `H3 ("ISO params will be just as accurate") holds only at frontier (gpt-5.5: ISO ties IR in both Task 7 and 7b). At small-model tier the IR contract wins (Task 7 haiku 91 vs 88; Task 7b haiku 82 vs 65), the bounding-range collapse occurs ONLY under ISO contracts, and zone-offset (DST) errors are structurally impossible under the IR contract. Also measured: the tool's VALIDATION FEEDBACK is part of the contract (fixing one error message moved gpt-5.5's IR threading 91→96%), and iterated through nine hybrid-contract variants and found a sharp law: an expression channel works IFF its shape is non-optional AND the grammar is visible in-band. Optional object fields make GPT-family models emit degenerate {} (~0 well-formed in ~50 attempts); a string field with the grammar hidden yields fenceposts; a required object (schema IS the grammar) or a grammar-inlined string both work for every vendor (35/35 expressions correct in the string+grammar case). None beats resolve-then-query — the same law applied once at a central boundary — which remains the accuracy recommendation (90-100% for every model).`,
  },
];

// ── write summary.json ──
const summary = {
  keyVersion: p2.keyVersion,
  promptVersion: p2.promptVersion,
  models: [...new Set(cells.map((c) => c.model))].filter((m) => m !== 'chrono-node'),
  baseline: 'chrono-node',
  slices: [...new Set(cells.filter((c) => c.task === 'task4').map((c) => c.slice))],
  tasks: ['task4', 'task5', 'task6', 'task7', 'task7b'],
  cells,
  determinism,
  cost,
  decisionTable,
  toolContract,
};
writeFileSync('results/summary.json', JSON.stringify(summary, null, 1));
console.log(`wrote results/summary.json (${cells.length} cells, ${Object.keys(determinism).length} determinism rows, ${Object.keys(cost).length} cost rows)`);
