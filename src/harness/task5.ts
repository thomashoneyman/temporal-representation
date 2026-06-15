/**
 * Task 5 — steerability: the same items and arms as Task 4, but the prompt now carries
 * the DOCUMENTED CONVENTIONS block (renderConventions — Artifact #3). `npm run task5`
 * Measures, against the free (Task-4) runs: exact lift per arm/slice, conversion of
 * convention-divergence answers (Sev 4 / include-today / wrong-period) to exact, and
 * the determinism change. ANALYZE=1 re-aggregates offline.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { CONFIG, type Provider } from '../../experiment.config.js';
import { ALL_CASES, anchorIso } from '../datasets/cases/index.js';
import type { CaseItem, Slice } from '../datasets/cases/lib/types.js';
import { PROMPT_VERSION, type Arm } from '../datasets/render.js';
import { toEnvelope } from '../representation/translation-schema.js';
import { DEFAULT_CONVENTIONS, renderConventions } from '../scate-lite/conventions.js';
import { scoreTranslation, type TranslationScore } from '../scoring/translation.js';
import { runCell, type RunRow } from './engine.js';

const RUN_DIR = 'results/runs/task5';
const FREE_DIR = 'results/runs/phase2';
const SLICES: Slice[] = ['specific', 'relative', 'named', 'custom', 'ranges', 'multipart', 'notime', 'ambiguous'];
const ARMS: Arm[] = ['iso', 'ir'];
const CONVENTION_TEXT = renderConventions(DEFAULT_CONVENTIONS);

const keyFor: Record<Provider, string | undefined> = {
  openai: process.env.OPENAI_API_KEY,
  anthropic: process.env.ANTHROPIC_API_KEY,
  google: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
};
const providers = CONFIG.providers.filter((p) => Boolean(keyFor[p]));

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
                task: 'task5',
                runDir: RUN_DIR,
                modifiers: { convention: CONVENTION_TEXT },
              });
              console.log(`task5 ${provider}/${CONFIG.tier} ${arm} rep${rep} ${slice}: ${items} items, ${errors} errors${attempt > 1 ? ` (attempt ${attempt})` : ''}`);
              break;
            } catch (err) {
              console.log(`task5 ${provider}/${CONFIG.tier} ${arm} rep${rep} ${slice}: attempt ${attempt} failed: ${(err as Error).message.slice(0, 140)}`);
              if (attempt < 3) await new Promise((r) => setTimeout(r, 5000 * attempt));
            }
          }
        }
      }
    }
  }
}

// ── analysis: steered vs free, from raw rows of both runs ──

const itemById = new Map<string, CaseItem>(ALL_CASES.map((c) => [c.id, c]));
const ctxOf = (item: CaseItem) => ({
  anchor: anchorIso(item.anchor),
  conventions: { ...DEFAULT_CONVENTIONS, ...item.conventionsOverride },
  ...(item.customPresets ? { customPresets: item.customPresets } : {}),
  window: CONFIG.window,
});

function grade(dir: string, task: string): Map<string, { exact: number; sev4: number; conv: number; n: number; bySlice: Record<string, { exact: number; n: number }> }> {
  const out = new Map();
  if (!existsSync(dir)) return out;
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.jsonl')) continue;
    for (const l of readFileSync(`${dir}/${f}`, 'utf8').trim().split('\n').filter(Boolean)) {
      const r = JSON.parse(l) as RunRow;
      if (r.task !== task || r.tier !== 'mini' || !['iso', 'ir'].includes(r.arm)) continue;
      const item = itemById.get(r.itemId);
      if (!item || r.raw === null) continue;
      const score: TranslationScore = scoreTranslation(toEnvelope(r.raw), item, ctxOf(item), r.arm === 'ir' ? 'ir' : 'iso');
      const key = `${r.model}|${r.arm}`;
      const c = out.get(key) ?? { exact: 0, sev4: 0, conv: 0, n: 0, bySlice: {} };
      c.n++;
      if (score.exact) c.exact++;
      if (score.severity === 4) c.sev4++;
      if (score.tags.some((t) => ['include-today-reading', 'wrong-period'].includes(t))) c.conv++;
      const bs = (c.bySlice[r.slice] ??= { exact: 0, n: 0 });
      bs.n++;
      if (score.exact) bs.exact++;
      out.set(key, c);
    }
  }
  return out;
}

const free = grade(FREE_DIR, 'task4');
const steered = grade(RUN_DIR, 'task5');

const summary: Record<string, unknown> = {};
console.log(`\n${'cell'.padEnd(36)}${'free'.padStart(6)}${'steered'.padStart(9)}${'lift'.padStart(7)}   sev4 free→steered`);
for (const [key, st] of steered) {
  const fr = free.get(key);
  if (!fr) continue;
  const fe = fr.exact / fr.n;
  const se = st.exact / st.n;
  console.log(`${key.padEnd(36)}${(fe * 100).toFixed(0).padStart(5)}%${(se * 100).toFixed(0).padStart(8)}%${(((se - fe)) * 100).toFixed(0).padStart(6)}pt   ${fr.sev4}→${st.sev4}`);
  summary[key] = {
    free: { exact: fe, sev4: fr.sev4, convTags: fr.conv, n: fr.n, bySlice: fr.bySlice },
    steered: { exact: se, sev4: st.sev4, convTags: st.conv, n: st.n, bySlice: st.bySlice },
  };
}

mkdirSync('results', { recursive: true });
writeFileSync('results/task5.json', JSON.stringify({ generatedAt: new Date().toISOString(), promptVersion: PROMPT_VERSION, conventionText: CONVENTION_TEXT, cells: summary }, null, 2));
console.log('\nwrote results/task5.json');
