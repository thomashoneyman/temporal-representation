/**
 * Key-completeness audit — `pnpm audit:consensus`. Run before any report.
 *
 * Detector: for every graded item, find specific non-accepted answers that MULTIPLE
 * models converge on (≥2 models, ≥30% of all answers). Such consensus-against-the-key
 * is the signature of either an authoring error (the key is wrong) or a coverage gap
 * (a defensible reading missing from the acceptable set) — the two key-defect classes
 * that internal-consistency tests (resolver ↔ fixtures) cannot catch.
 *
 * IMPORTANT: this DETECTS candidates; it does not adjudicate. Consensus can also mark
 * a shared misread (e.g. "since March" read forward). A human judges each flag against
 * the language; the resolution is a re-key, a new acceptable variant, or a confirmed
 * error — all applied by offline re-score, never by re-buying runs.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { ALL_CASES, anchorIso } from '../datasets/cases/index.js';
import { toEnvelope } from '../representation/translation-schema.js';
import { scoreTranslation } from '../scoring/translation.js';
import { DEFAULT_CONVENTIONS } from '../scate-lite/conventions.js';

const RUN_DIR = process.env.RUN_DIR ?? 'results/runs/phase2';

/** Clusters already adjudicated by the staff engineer — suppressed from the gate.
 *  Each entry records the VERDICT so the history is auditable. */
const ADJUDICATED = new Map<string, string>([
  ['G5-02|2026-03-01T00:00→2027-03-12T00:00', 'rejected 2026-06-12: forward reading of "since" is a misread, not a defensible alternative'],
  // C4-12 + M6-11 clusters were UPHELD and fixed in key v0.4 (re-key / new variant).
]);
const items = new Map(ALL_CASES.map((c) => [c.id, c]));
const wrong = new Map<string, Map<string, { n: number; models: Set<string>; arms: Set<string> }>>();
const totals = new Map<string, number>();

for (const f of existsSync(RUN_DIR) ? readdirSync(RUN_DIR) : []) {
  if (!f.endsWith('.jsonl')) continue;
  for (const l of readFileSync(`${RUN_DIR}/${f}`, 'utf8').trim().split('\n').filter(Boolean)) {
    const r = JSON.parse(l);
    const item = items.get(r.itemId);
    if (!item || r.raw === null || item.slice === 'notime' || item.slice === 'ambiguous') continue;
    const env = toEnvelope(r.raw);
    if (env.kind === 'none') continue;
    const s = scoreTranslation(env, item, {
      anchor: anchorIso(item.anchor),
      conventions: { ...DEFAULT_CONVENTIONS, ...item.conventionsOverride },
      ...(item.customPresets ? { customPresets: item.customPresets } : {}),
      window: { backMonths: 12, forwardMonths: 12 },
    }, r.arm === 'ir' ? 'ir' : 'iso');
    totals.set(r.itemId, (totals.get(r.itemId) ?? 0) + 1);
    if (!s.exact && !s.withinAcceptable && s.resolved) {
      const key = s.resolved.intervals.map((i) => `${i.start.slice(0, 16)}→${i.end.slice(0, 16)}`).join(';');
      const m = wrong.get(r.itemId) ?? new Map();
      const e = m.get(key) ?? { n: 0, models: new Set<string>(), arms: new Set<string>() };
      e.n++; e.models.add(String(r.model).split('/')[1] ?? r.model); e.arms.add(r.arm);
      m.set(key, e);
      wrong.set(r.itemId, m);
    }
  }
}

let found = 0;
console.log(`consensus-against-key candidates in ${RUN_DIR} (≥30% share, ≥2 models):`);
for (const [itemId, m] of wrong) {
  const total = totals.get(itemId) ?? 1;
  for (const [ans, e] of m) {
    if (e.n / total >= 0.3 && e.models.size >= 2) {
      const verdict = ADJUDICATED.get(`${itemId}|${ans}`);
      if (verdict) { console.log(`  (adjudicated) ${itemId}: ${verdict}`); continue; }
      found++;
      console.log(`  ${itemId} "${items.get(itemId)!.query}" — ${e.n}/${total} = ${ans} (${[...e.models].join(',')} | ${[...e.arms].join(',')})`);
    }
  }
}
if (!found) console.log('  none — no consensus clusters against the current key.');
process.exit(found ? 1 : 0);
