/**
 * Phase 2 — Task 4: GRADED translation accuracy. `npm run phase2`
 * Arms: iso · iso-preset (ISO + pre-resolved crib) · ir, × provider × REPS over all 8
 * slices, against the v0.2 answer key; plus the chrono-node baseline computed locally
 * (no LLM). Raw rows → results/runs/phase2/; ANALYZE=1 re-aggregates offline into
 * results/phase2.json: per slice × arm × model — exact (Sev 0), within-acceptable
 * (≤ Sev 4), off-by-one rate, severity histogram, failure tags, determinism, cost.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { DateTime } from 'luxon';
import { CONFIG, type Provider } from '../../experiment.config.js';
import { ALL_CASES, anchorIso } from '../datasets/cases/index.js';
import type { CaseItem, Slice } from '../datasets/cases/lib/types.js';
import { PROMPT_VERSION, type Arm } from '../datasets/render.js';
import { toEnvelope } from '../representation/translation-schema.js';
import { chronoBaseline } from '../scate-lite/baseline.js';
import { DEFAULT_CONVENTIONS } from '../scate-lite/conventions.js';
import { intervalsEqual } from '../scate-lite/interval.js';
import { clarificationPRF, expectedResolved, noTimePRF, scoreTranslation, signalsClarify, wallsToIntervals, type Envelope, type TranslationScore } from '../scoring/translation.js';
import { describeIntervals } from '../scoring/interpretation.js';
import { runCell, type RunRow } from './engine.js';

const RUN_DIR = 'results/runs/phase2';
const SLICES: Slice[] = ['specific', 'relative', 'named', 'custom', 'ranges', 'multipart', 'notime', 'ambiguous'];
const ARMS: Arm[] = ['iso', 'iso-preset', 'ir'];

const keyFor: Record<Provider, string | undefined> = {
  openai: process.env.OPENAI_API_KEY,
  anthropic: process.env.ANTHROPIC_API_KEY,
  google: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
};
const providers = CONFIG.providers.filter((p) => Boolean(keyFor[p]));

// ── live runs ──
if (!process.env.ANALYZE) {
  for (const provider of providers) {
    for (const arm of ARMS) {
      for (let rep = 1; rep <= CONFIG.reps; rep++) {
        for (const slice of SLICES) {
          for (let attempt = 1; attempt <= 3; attempt++) {
            try {
              const { items, errors } = await runCell({
                dataset: `temporal-${slice}`,
                agentId: arm === 'ir' ? 'translate-ir' : 'translate-iso',
                arm,
                provider,
                tier: CONFIG.tier,
                rep,
                task: 'task4',
                runDir: RUN_DIR,
                ...(arm === 'iso-preset' ? { modifiers: { crib: true } } : {}),
              });
              console.log(`task4 ${provider}/${CONFIG.tier} ${arm} rep${rep} ${slice}: ${items} items, ${errors} errors${attempt > 1 ? ` (attempt ${attempt})` : ''}`);
              break;
            } catch (err) {
              console.log(`task4 ${provider}/${CONFIG.tier} ${arm} rep${rep} ${slice}: attempt ${attempt} failed: ${(err as Error).message.slice(0, 140)}`);
              if (attempt < 3) await new Promise((r) => setTimeout(r, 5000 * attempt));
            }
          }
        }
      }
    }
  }
}

// ── grading (pure re-score from raw rows) ──

const itemById = new Map<string, CaseItem>(ALL_CASES.map((c) => [c.id, c]));

const ctxOf = (item: CaseItem) => ({
  anchor: anchorIso(item.anchor),
  conventions: { ...DEFAULT_CONVENTIONS, ...item.conventionsOverride },
  ...(item.customPresets ? { customPresets: item.customPresets } : {}),
  window: CONFIG.window,
});

function loadRows(): RunRow[] {
  if (!existsSync(RUN_DIR)) return [];
  return readdirSync(RUN_DIR)
    .filter((f) => f.endsWith('.jsonl'))
    .flatMap((f) => readFileSync(`${RUN_DIR}/${f}`, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l) as RunRow));
}

interface GradedRow {
  model: string;
  arm: string;
  rep: number;
  itemId: string;
  slice: string;
  score: TranslationScore;
  envelope: Envelope | null;
  usage?: { inputTokens?: number; outputTokens?: number };
}

const rows = loadRows();
console.log(`grading ${rows.length} raw rows from ${RUN_DIR}`);

const graded: GradedRow[] = [];
for (const row of rows) {
  const item = itemById.get(row.itemId);
  if (!item) continue;
  const envelope = row.raw === null ? null : toEnvelope(row.raw);
  const score: TranslationScore =
    envelope === null
      ? { exact: false, withinAcceptable: false, severity: 6, tags: ['no-output'], clarifySignal: false, noTimeAnswer: false, unresolvable: true }
      : scoreTranslation(envelope, item, ctxOf(item), row.arm === 'ir' ? 'ir' : 'iso');
  graded.push({ model: row.model, arm: row.arm, rep: row.rep, itemId: row.itemId, slice: row.slice, score, envelope, usage: row.usage as GradedRow['usage'] });
}

// ── chrono baseline (local, no LLM): graded once per item ──
const baselineCells: Record<string, CellAgg> = {};
{
  const fake: GradedRow[] = [];
  for (const item of ALL_CASES) {
    const resolved = chronoBaseline(item.query, anchorIso(item.anchor));
    const envelope: Envelope =
      resolved === null
        ? { kind: 'none', reasoning: 'chrono: no parse' }
        : {
            kind: 'time',
            value:
              resolved.intervals.length >= 2
                ? { cardinality: 'set', members: resolved.intervals }
                : { cardinality: 'range', start: resolved.intervals[0].start, end: resolved.intervals[0].end, bounds: '[)' },
            ambiguity: 1,
            reasoning: 'chrono',
          };
    const score = scoreTranslation(envelope, item, ctxOf(item), 'iso');
    fake.push({ model: 'chrono-node', arm: 'baseline', rep: 1, itemId: item.id, slice: item.slice, score, envelope });
  }
  graded.push(...fake);
}

// ── aggregation ──
interface CellAgg {
  n: number;
  exact: number;
  timeCorrect: number;
  withinAcceptable: number;
  offByOne: number;
  unresolvable: number;
  sevHist: Record<string, number>;
  tags: Record<string, number>;
  determinism?: { itemsWithReps: number; agreeing: number };
  tokens?: { in: number; out: number };
}

type CellKey = string; // `${model}|${arm}|${slice}` and `${model}|${arm}|ALL`
const cells: Record<CellKey, CellAgg> = {};
/** Underlying rows per (cell × severity): what the model answered vs what the key
 *  expects, deduped — powers the click-a-segment table in the report. */
const samples: Record<string, Array<{ q: string; asked: string; expected: string; actual: string; tags: string; n: number }>> = {};
function addSample(key: string, item: CaseItem, g: GradedRow): void {
  const expected = item.expected
    ? describeIntervals(expectedResolved(item)!.intervals)
    : item.isNoTime
      ? '“no time here”'
      : item.acceptable?.length
        ? item.acceptable.map((w) => describeIntervals(wallsToIntervals(w))).join('  ·or·  ')
        : item.region
          ? `any window inside ${describeIntervals(wallsToIntervals([item.region]))}`
          : 'any of the documented acceptable readings';
  const actual =
    g.envelope === null
      ? '(no valid output)'
      : g.envelope.kind === 'none'
        ? 'said “no time here”'
        : g.score.resolved
          ? describeIntervals(g.score.resolved.intervals)
          : '(unresolvable expression)';
  const asked = DateTime.fromISO(anchorIso(item.anchor), { zone: 'America/New_York' }).toFormat('ccc, MMM d yyyy HH:mm');
  const list = (samples[key] ??= []);
  const existing = list.find((r) => r.q === item.query && r.actual === actual);
  if (existing) existing.n++;
  else list.push({ q: item.query, asked, expected, actual, tags: g.score.tags.join(', '), n: 1 });
}
const blank = (): CellAgg => ({ n: 0, exact: 0, timeCorrect: 0, withinAcceptable: 0, offByOne: 0, unresolvable: 0, sevHist: {}, tags: {} });

const GRADEABLE = new Set(ALL_CASES.filter((c) => c.expected || c.slice === 'ambiguous' || c.slice === 'notime').map((c) => c.id));
/** The v0.3 hard expansion, aggregated as its own pseudo-slice (large/chained/ordinal
 *  arithmetic + cross-category hard items) so the report can isolate difficulty. */
const HARD_V03 = new Set([
  ...Array.from({ length: 14 }, (_, i) => `R2-${21 + i}`),
  'S1-15', 'N3-22', 'N3-23', 'G5-18', 'G5-19', 'M6-13', 'M6-14', 'C4-11', 'C4-12',
]);
for (const g of graded) {
  if (!GRADEABLE.has(g.itemId)) continue;
  for (const sliceKey of [g.slice, 'ALL', ...(HARD_V03.has(g.itemId) ? ['HARD'] : [])]) {
    const key = `${g.model}|${g.arm}|${sliceKey}`;
    if (sliceKey !== 'ALL') addSample(`${key}|${g.score.severity}`, itemById.get(g.itemId)!, g);
    const c = (cells[key] ??= blank());
    c.n++;
    if (g.score.exact) c.exact++;
    if (g.score.timeCorrect ?? g.score.exact) c.timeCorrect++;
    if (g.score.withinAcceptable) c.withinAcceptable++;
    if (g.score.offByOne) c.offByOne++;
    if (g.score.unresolvable) c.unresolvable++;
    c.sevHist[g.score.severity] = (c.sevHist[g.score.severity] ?? 0) + 1;
    for (const t of g.score.tags) c.tags[t] = (c.tags[t] ?? 0) + 1;
    if (g.usage) {
      c.tokens ??= { in: 0, out: 0 };
      c.tokens.in += g.usage.inputTokens ?? 0;
      c.tokens.out += g.usage.outputTokens ?? 0;
    }
  }
}

// determinism per (model, arm): identical resolved output across reps
for (const model of [...new Set(graded.map((g) => g.model))]) {
  for (const arm of [...new Set(graded.map((g) => g.arm))]) {
    const byItem = new Map<string, GradedRow[]>();
    for (const g of graded) {
      if (g.model !== model || g.arm !== arm) continue;
      byItem.set(g.itemId, [...(byItem.get(g.itemId) ?? []), g]);
    }
    let withReps = 0;
    let agreeing = 0;
    for (const list of byItem.values()) {
      if (list.length < 2) continue;
      withReps++;
      const [first, ...rest] = list;
      const same = rest.every((g) =>
        g.score.resolved && first.score.resolved
          ? intervalsEqual(g.score.resolved.intervals, first.score.resolved.intervals)
          : g.envelope?.kind === first.envelope?.kind,
      );
      if (same) agreeing++;
    }
    const key = `${model}|${arm}|ALL`;
    if (cells[key]) cells[key].determinism = { itemsWithReps: withReps, agreeing };
  }
}

// Task 6 metrics per (model, arm), plus the per-item rows behind each bucket so the
// report's bars can show the reader the actual questions (agree with the key or not?).
const task6: Record<string, { clarification: ReturnType<typeof clarificationPRF>; noTime: ReturnType<typeof noTimePRF> }> = {};
const task6Samples: Record<string, Array<{ q: string; asked: string; expected: string; actual: string; n: number }>> = {};
function addTask6Sample(key: string, item: CaseItem, g: GradedRow, expected: string): void {
  const actualWindow = g.score.resolved ? describeIntervals(g.score.resolved.intervals) : '(unresolvable)';
  const actual =
    g.envelope!.kind === 'none'
      ? 'said \u201cno time here\u201d'
      : signalsClarify(g.envelope!)
        ? `flagged for clarification (answered ${actualWindow} as its best guess)`
        : `answered ${actualWindow}`;
  const asked = DateTime.fromISO(anchorIso(item.anchor), { zone: 'America/New_York' }).toFormat('ccc, MMM d yyyy HH:mm');
  const list = (task6Samples[key] ??= []);
  const existing = list.find((r) => r.q === item.query && r.actual === actual);
  if (existing) existing.n++;
  else list.push({ q: item.query, asked, expected, actual, n: 1 });
}
for (const model of [...new Set(graded.map((g) => g.model))]) {
  for (const arm of [...new Set(graded.filter((g) => g.model === model).map((g) => g.arm))]) {
    const sub = graded.filter((g) => g.model === model && g.arm === arm && g.envelope !== null);
    task6[`${model}|${arm}`] = {
      clarification: clarificationPRF(sub.map((g) => ({ item: itemById.get(g.itemId)!, signaled: signalsClarify(g.envelope!) }))),
      noTime: noTimePRF(sub.map((g) => ({ item: itemById.get(g.itemId)!, answeredNone: g.envelope!.kind === 'none' }))),
    };
    for (const g of sub) {
      const item = itemById.get(g.itemId)!;
      const signaled = signalsClarify(g.envelope!);
      const answeredNone = g.envelope!.kind === 'none';
      const base = `${model}|${arm}`;
      // The clarify question is only live for items that HAVE a time — no-time items
      // are scored by the no-time buckets below (their abstention is correct there).
      const safeDefault = item.expected
        ? describeIntervals(expectedResolved(item)!.intervals)
        : item.acceptable?.length
          ? item.acceptable.map((w) => describeIntervals(wallsToIntervals(w))).join('  \u00b7or\u00b7  ')
          : item.region
            ? `anything inside ${describeIntervals(wallsToIntervals([item.region]))}`
            : '(rubric-graded)';
      if (!item.isNoTime && !item.clarifyOptional && item.shouldClarify) {
        addTask6Sample(`${base}|clar-${signaled ? 'hit' : 'miss'}`, item, g, 'hand-labeled: genuinely ambiguous \u2014 asking is the right move');
      } else if (!item.isNoTime && !item.clarifyOptional && signaled) {
        addTask6Sample(`${base}|clar-unneeded`, item, g, `hand-labeled: safe default exists \u2014 ${safeDefault}`);
      }
      if (item.isNoTime) {
        addTask6Sample(`${base}|notime-${answeredNone ? 'hit' : 'miss'}`, item, g, 'hand-labeled: no time period in this question');
      } else if (answeredNone && !(item.slice === 'ambiguous' && item.shouldClarify)) {
        addTask6Sample(`${base}|notime-falseflag`, item, g, 'hand-labeled: HAS a time period \u2014 \u201cno time\u201d is wrong');
      }
    }
  }
}

mkdirSync('results', { recursive: true });
writeFileSync(
  'results/phase2.json',
  JSON.stringify(
    { generatedAt: new Date().toISOString(), promptVersion: PROMPT_VERSION, tier: CONFIG.tier, reps: CONFIG.reps, keyVersion: 'v0.3', cells, task6, task6Samples, samples, ...(Object.keys(baselineCells).length ? { baselineCells } : {}) },
    null,
    2,
  ),
);
console.log(`wrote results/phase2.json (${Object.keys(cells).length} cells)`);
