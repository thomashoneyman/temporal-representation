/**
 * Preference-grid runner — `npm run preferences`.
 * ISO arm ONLY (presets in the IR arm resolve under OUR conventions and reveal nothing
 * about the model's reading). Runs phrase × anchor-position × provider × REPS, resumable
 * at item level; classifies each answer against the grid's code-generated candidate
 * readings; writes results/preferences.json + a readable results/preferences-readout.md.
 *
 * ANALYZE=1 re-aggregates without live calls.
 */
import { RequestContext } from '@mastra/core/request-context';
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { CONFIG, type Provider } from '../../experiment.config.js';
import { buildGrid, POSITIONS, PHRASES, type GridItem, type PositionId } from '../datasets/preference-grid.js';
import { PROMPT_VERSION } from '../datasets/render.js';
import { toEnvelope } from '../representation/translation-schema.js';
import { mastra } from '../mastra/index.js';
import { modelFor } from '../mastra/models.js';
import { classifyAgainst, describeIntervals } from '../scoring/interpretation.js';
import { resolveActual } from '../scoring/translation.js';
import { DEFAULT_CONVENTIONS } from '../scate-lite/conventions.js';

const RUN_DIR = 'results/runs/preferences';
// ITEMS_FILE: optional JSON ({grid: [ids]}) restricting the run to a subset — used to
// run frontier models only on items where the minis diverged (cost control).
const subset: string[] | null = process.env.ITEMS_FILE
  ? (JSON.parse(readFileSync(process.env.ITEMS_FILE, 'utf8')) as { grid: string[] }).grid
  : null;
const GRID = buildGrid().filter((g) => !subset || subset.includes(g.id));

const keyFor: Record<Provider, string | undefined> = {
  openai: process.env.OPENAI_API_KEY,
  anthropic: process.env.ANTHROPIC_API_KEY,
  google: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
};
const providers = CONFIG.providers.filter((p) => Boolean(keyFor[p]));

interface GridRow {
  itemId: string;
  provider: Provider;
  model?: string;
  rep: number;
  promptVersion: string;
  raw: unknown;
  error?: string;
  usage?: unknown;
}

async function runOne(item: GridItem, provider: Provider): Promise<{ raw: unknown; error?: string; usage?: unknown }> {
  const agent = mastra.getAgentById('translate-iso');
  const rc = new RequestContext();
  rc.set('provider', provider);
  rc.set('tier', CONFIG.tier);
  rc.set('arm', 'iso');
  rc.set('anchor', item.anchor);
  try {
    const res = await agent.generate(item.query, { requestContext: rc });
    const r = res as { object?: unknown; usage?: unknown };
    return { raw: r.object ?? null, usage: r.usage, ...(r.object == null ? { error: 'no structured object' } : {}) };
  } catch (err) {
    return { raw: null, error: String((err as Error).message).slice(0, 200) };
  }
}

async function pool<T>(items: T[], n: number, fn: (t: T) => Promise<void>): Promise<void> {
  const queue = [...items];
  await Promise.all(
    Array.from({ length: Math.min(n, queue.length) }, async () => {
      for (let next = queue.shift(); next !== undefined; next = queue.shift()) await fn(next);
    }),
  );
}

// ── live runs (resumable per provider × rep file) ──
if (!process.env.ANALYZE) {
  mkdirSync(RUN_DIR, { recursive: true });
  for (const provider of providers) {
    for (let rep = 1; rep <= CONFIG.reps; rep++) {
      const file = `${RUN_DIR}/grid-${provider}-${CONFIG.tier}-rep${rep}.jsonl`;
      const done = new Set<string>(
        existsSync(file) ? readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l) as GridRow).filter((r) => r.raw !== null).map((r) => r.itemId) : [],
      );
      const todo = GRID.filter((g) => !done.has(g.id));
      if (todo.length === 0) {
        console.log(`grid ${provider} rep${rep}: complete (${GRID.length} items)`);
        continue;
      }
      let errors = 0;
      await pool(todo, CONFIG.concurrency, async (item) => {
        const out = await runOne(item, provider);
        if (out.raw === null) errors++;
        const row: GridRow = { itemId: item.id, provider, model: modelFor(provider, CONFIG.tier), rep, promptVersion: PROMPT_VERSION, ...out };
        appendFileSync(file, `${JSON.stringify(row)}\n`);
      });
      console.log(`grid ${provider} rep${rep}: ${todo.length} items, ${errors} errors`);
    }
  }
}

// ── aggregation ──
const rows: GridRow[] = existsSync(RUN_DIR)
  ? readdirSync(RUN_DIR)
      .filter((f) => f.endsWith('.jsonl'))
      .flatMap((f) => readFileSync(`${RUN_DIR}/${f}`, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l) as GridRow))
  : [];
console.log(`\naggregating ${rows.length} grid rows`);

const gridById = new Map(GRID.map((g) => [g.id, g]));
type Counts = Record<string, number>;
const tally = new Map<string, Counts>(); // `${itemId}|${model}` → label counts
const otherDetails = new Map<string, Counts>(); // same key → resolved-dates text counts for 'other'
// SHAPE is measured separately from the window: a "beginning of the month" answer can be
// a point (one instant/day) or a span — conflating that with WHICH dates was adding
// noise (a point inside two window-candidates failed unique containment → 'other').
const shapeTally = new Map<string, Counts>(); // same key → point/range/set counts

for (const row of rows) {
  const item = gridById.get(row.itemId);
  if (!item) continue;
  const key = `${row.itemId}|${row.model ?? row.provider}`;
  const counts = tally.get(key) ?? {};
  let label = 'unresolvable';
  if (row.raw !== null) {
    const env = toEnvelope(row.raw);
    if (env.kind === 'none') label = 'none';
    else {
      try {
        const resolved = resolveActual('iso', env.value, {
          anchor: item.anchor,
          conventions: DEFAULT_CONVENTIONS,
          window: CONFIG.window,
        });
        label = classifyAgainst(resolved, item.candidates);
        {
          const st = shapeTally.get(key) ?? {};
          st[resolved.cardinality] = (st[resolved.cardinality] ?? 0) + 1;
          shapeTally.set(key, st);
        }
        if (label === 'other') {
          const d = otherDetails.get(key) ?? {};
          const desc = describeIntervals(resolved.intervals);
          d[desc] = (d[desc] ?? 0) + 1;
          otherDetails.set(key, d);
        }
      } catch {
        label = 'unresolvable';
      }
    }
  }
  counts[label] = (counts[label] ?? 0) + 1;
  tally.set(key, counts);
}

const result = {
  generatedAt: new Date().toISOString(),
  promptVersion: PROMPT_VERSION,
  tier: CONFIG.tier,
  reps: CONFIG.reps,
  positions: POSITIONS,
  cells: Object.fromEntries([...tally.entries()].map(([k, v]) => [k, v])),
  otherDetails: Object.fromEntries([...otherDetails.entries()]),
  shapes: Object.fromEntries([...shapeTally.entries()]),
};
mkdirSync('results', { recursive: true });
writeFileSync('results/preferences.json', JSON.stringify(result, null, 2));

// ── readable digest: one table per phrase — rows = positions, cols = models ──
const provs = [...new Set(rows.map((r) => r.model ?? r.provider))];
const lines: string[] = [
  '# Preference grid — which reading does each model choose?',
  '',
  `ISO arm only · tier ${CONFIG.tier} · ${CONFIG.reps} reps · prompt ${PROMPT_VERSION}`,
  '',
  'Cell format: `dominantReading n/total` (ties / scattered → listed). `other` = a reading outside the candidate set (inspect raw rows).',
  '',
];
const fmtCounts = (c: Counts | undefined): string => {
  if (!c) return '—';
  const total = Object.values(c).reduce((a, b) => a + b, 0);
  const sorted = Object.entries(c).sort((x, y) => y[1] - x[1]);
  return sorted
    .filter(([, n]) => n >= sorted[0][1] * 0.5)
    .map(([l, n]) => `${l} ${n}/${total}`)
    .join(' · ');
};
for (const query of Object.keys(PHRASES)) {
  lines.push(`## "${query}"`, '', `| position | ${provs.join(' | ')} |`, `|---|${provs.map(() => '---').join('|')}|`);
  for (const position of Object.keys(POSITIONS) as PositionId[]) {
    const id = `${query.replace(/\s+/g, '-')}@${position}`;
    lines.push(`| ${position} | ${provs.map((p) => fmtCounts(tally.get(`${id}|${p}`))).join(' | ')} |`);
  }
  lines.push('');
}
writeFileSync('results/preferences-readout.md', lines.join('\n'));
console.log(`wrote results/preferences.json + results/preferences-readout.md (${tally.size} cells)`);
