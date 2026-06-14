/**
 * Phase 1 — Task 2: UNGRADED measurement of interpretation preferences.
 * `pnpm phase1` runs provider × arm (iso, ir) × REPS over all 8 translation slices
 * and writes raw rows to results/runs/phase1/; then aggregates distributions into
 * results/phase1.json: probe tallies (pinned vs calendar-30, week start, occurrence…),
 * none/unresolvable rates, week-start evidence, and per-item determinism across reps.
 *
 * ANALYZE=1 skips the live runs and re-aggregates existing rows.
 * REPS / PROVIDERS / TIER come from the environment (smoke: REPS=1).
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { CONFIG, type Provider } from '../../experiment.config.js';
import { ALL_CASES, anchorIso } from '../datasets/cases/index.js';
import type { CaseItem, Slice } from '../datasets/cases/lib/types.js';
import { PROMPT_VERSION } from '../datasets/render.js';
import { toEnvelope } from '../representation/translation-schema.js';
import { DEFAULT_CONVENTIONS } from '../scate-lite/conventions.js';
import { intervalsEqual, type Resolved } from '../scate-lite/interval.js';
import { classifyProbe, describeIntervals, interpretationFeatures } from '../scoring/interpretation.js';
import { resolveActual } from '../scoring/translation.js';
import { runCell, type RunRow } from './engine.js';

const RUN_DIR = 'results/runs/phase1';
const SLICES: Slice[] = ['specific', 'relative', 'named', 'custom', 'ranges', 'multipart', 'notime', 'ambiguous'];
const ARMS = (process.env.ARMS ? process.env.ARMS.split(',') : ['iso', 'ir']) as Array<'iso' | 'ir'>;
// ITEMS_FILE: optional JSON ({phase1: [ids]}) restricting to a subset (frontier cost control).
const subset: string[] | null = process.env.ITEMS_FILE
  ? (JSON.parse(readFileSync(process.env.ITEMS_FILE, 'utf8')) as { phase1: string[] }).phase1
  : null;

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
          // Up to 3 attempts per cell; runCell resumes, so retries only redo missing items.
          for (let attempt = 1; attempt <= 3; attempt++) {
            try {
              const { items, errors } = await runCell({
                dataset: `temporal-${slice}`,
                agentId: arm === 'ir' ? 'translate-ir' : 'translate-iso',
                arm,
                provider,
                tier: CONFIG.tier,
                rep,
                task: 'phase1',
                runDir: RUN_DIR,
                ...(subset ? { itemFilter: (gt) => subset.includes(gt.itemId) } : {}),
              });
              console.log(`phase1 ${provider}/${CONFIG.tier} ${arm} rep${rep} ${slice}: ${items} items, ${errors} errors${attempt > 1 ? ` (attempt ${attempt})` : ''}`);
              break;
            } catch (err) {
              console.log(`phase1 ${provider}/${CONFIG.tier} ${arm} rep${rep} ${slice}: attempt ${attempt} failed: ${(err as Error).message.slice(0, 160)}`);
              if (attempt === 3) console.log('  giving up on this cell (resume by re-running pnpm phase1)');
              else await new Promise((r) => setTimeout(r, 5000 * attempt));
            }
          }
        }
      }
    }
  }
}

// ── aggregation (re-scores RAW rows with the pure functions — re-runnable offline) ──

function loadRows(): RunRow[] {
  if (!existsSync(RUN_DIR)) return [];
  return readdirSync(RUN_DIR)
    .filter((f) => f.endsWith('.jsonl'))
    .flatMap((f) => readFileSync(`${RUN_DIR}/${f}`, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l) as RunRow));
}

const itemById = new Map<string, CaseItem>(ALL_CASES.map((c) => [c.id, c]));

type RowResolution = { kind: 'none' } | { kind: 'unresolvable'; why: string; value: unknown } | { kind: 'time'; resolved: Resolved };

function resolveRow(row: RunRow, item: CaseItem): RowResolution {
  if (row.raw === null) return { kind: 'unresolvable', why: row.error ?? 'no structured object', value: null };
  const env = toEnvelope(row.raw);
  if (env.kind === 'none') return { kind: 'none' };
  try {
    const resolved = resolveActual(row.arm === 'ir' ? 'ir' : 'iso', env.value, {
      anchor: anchorIso(item.anchor),
      conventions: { ...DEFAULT_CONVENTIONS, ...item.conventionsOverride },
      ...(item.customPresets ? { customPresets: item.customPresets } : {}),
      window: CONFIG.window,
    });
    return { kind: 'time', resolved };
  } catch (err) {
    return { kind: 'unresolvable', why: String((err as Error).message).slice(0, 80), value: env.value };
  }
}

interface CellAgg {
  rows: number;
  noneRate: number;
  unresolvableRate: number;
  /** none-on-notime / notime rows (correct abstention) vs none elsewhere (suspect). */
  noTime: { recall: number; overAbstain: Array<{ itemId: string; query: string; n: number }> };
  /** distinct resolver-rejection signatures: why + an example value. */
  rejections: Array<{ why: string; example: string; n: number }>;
  probeTallies: Record<string, { axis: string; query: string; counts: Record<string, number>; otherDetails: Record<string, number> }>;
  weekStartEvidence: Record<string, number>; // start weekday of week-grain answers
  determinism: { itemsWithReps: number; agreeingItems: number; agreementRate: number };
}

const rows = loadRows();
console.log(`\naggregating ${rows.length} rows from ${RUN_DIR}`);

const cells: Record<string, CellAgg> = {};
const WEEKDAY_NAMES = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

for (const model of [...new Set(rows.map((r) => r.model))]) {
  for (const arm of ['iso', 'ir'] as const) {
    const cellRows = rows.filter((r) => r.model === model && r.arm === arm);
    if (cellRows.length === 0) continue;
    let none = 0;
    let unresolvable = 0;
    let noneOnNoTime = 0;
    let noTimeRows = 0;
    const overAbstain = new Map<string, { itemId: string; query: string; n: number }>();
    const rejections = new Map<string, { why: string; example: string; n: number }>();
    const probeTallies: CellAgg['probeTallies'] = {};
    const weekStartEvidence: Record<string, number> = {};
    const byItem = new Map<string, Resolved[]>();

    for (const row of cellRows) {
      const item = itemById.get(row.itemId);
      if (!item) continue;
      if (item.slice === 'notime') noTimeRows++;
      const r = resolveRow(row, item);
      if (r.kind === 'none') {
        none++;
        if (item.slice === 'notime') noneOnNoTime++;
        else {
          const cur = overAbstain.get(item.id) ?? { itemId: item.id, query: item.query, n: 0 };
          cur.n++;
          overAbstain.set(item.id, cur);
        }
        continue;
      }
      if (r.kind === 'unresolvable') {
        unresolvable++;
        const cur = rejections.get(r.why) ?? { why: r.why, example: JSON.stringify(r.value).slice(0, 110), n: 0 };
        cur.n++;
        rejections.set(r.why, cur);
        continue;
      }
      byItem.set(row.itemId, [...(byItem.get(row.itemId) ?? []), r.resolved]);
      if (item.probe) {
        const t = (probeTallies[item.id] ??= { axis: item.probe.axis, query: item.query, counts: {}, otherDetails: {} });
        const label = classifyProbe(r.resolved, item);
        t.counts[label] = (t.counts[label] ?? 0) + 1;
        if (label === 'other') {
          const desc = describeIntervals(r.resolved.intervals);
          t.otherDetails[desc] = (t.otherDetails[desc] ?? 0) + 1;
        }
      }
      const feats = interpretationFeatures(r.resolved);
      if (item.granularity === 'week' && feats.cardinality === 'range' && feats.startWeekday !== null) {
        const wd = WEEKDAY_NAMES[feats.startWeekday - 1];
        weekStartEvidence[wd] = (weekStartEvidence[wd] ?? 0) + 1;
      }
    }

    // Determinism: all reps of an item resolve to identical intervals.
    let withReps = 0;
    let agreeing = 0;
    for (const resolutions of byItem.values()) {
      if (resolutions.length < 2) continue;
      withReps++;
      const [first, ...rest] = resolutions;
      if (rest.every((r) => intervalsEqual(r.intervals, first.intervals))) agreeing++;
    }

    cells[`${model}/${arm}`] = {
      rows: cellRows.length,
      noneRate: none / cellRows.length,
      unresolvableRate: unresolvable / cellRows.length,
      noTime: { recall: noTimeRows ? noneOnNoTime / noTimeRows : 1, overAbstain: [...overAbstain.values()].sort((a, b) => b.n - a.n) },
      rejections: [...rejections.values()].sort((a, b) => b.n - a.n).slice(0, 10),
      probeTallies,
      weekStartEvidence,
      determinism: { itemsWithReps: withReps, agreeingItems: agreeing, agreementRate: withReps ? agreeing / withReps : 1 },
    };
  }
}

mkdirSync('results', { recursive: true });
writeFileSync(
  'results/phase1.json',
  JSON.stringify(
    { generatedAt: new Date().toISOString(), promptVersion: PROMPT_VERSION, tier: CONFIG.tier, reps: CONFIG.reps, cells },
    null,
    2,
  ),
);
console.log(`wrote results/phase1.json (${Object.keys(cells).length} cells)`);
