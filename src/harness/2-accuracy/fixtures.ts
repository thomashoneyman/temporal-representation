/**
 * Record/replay fixtures — reproducibility without API keys.
 *
 *   npm run fixtures:record   select a smoke subset of the committed raw runs and write
 *                          it to fixtures/accuracy-smoke.jsonl (the model RESPONSES)
 *   npm run accuracy:replay     re-grade those fixtures offline with the CURRENT scorer and
 *                          compare against results/2-accuracy/smoke/accuracy-smoke.json; exits 1 on
 *                          any difference (no network, no keys)
 *
 * What this guards: anyone can clone the repo and verify that our published numbers
 * follow from the published model responses — and any scoring/key change shows up as a
 * replay diff (intentional changes are re-recorded, so the diff lives in git history).
 * The smoke subset is the first TWO items of each category × both small models × all
 * three answer formats × rep 1 — broad enough to exercise every scoring path, small
 * enough to commit.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { CONFIG } from '../../../experiment.config.js';
import { ALL_CASES, anchorIso } from '../../datasets/cases/index.js';
import type { CaseItem, Slice } from '../../datasets/cases/lib/types.js';
import { toEnvelope } from '../../representation/translation-schema.js';
import { DEFAULT_CONVENTIONS } from '../../scate-lite/conventions.js';
import { scoreTranslation, type TranslationScore } from '../../scoring/translation.js';
import type { RunRow } from '../engine.js';

const FIXTURE_FILE = 'fixtures/accuracy-smoke.jsonl';
const SNAPSHOT_FILE = 'results/2-accuracy/smoke/accuracy-smoke.json';
const RUN_DIR = 'results/runs/2-accuracy/accuracy';

const itemById = new Map<string, CaseItem>(ALL_CASES.map((c) => [c.id, c]));
const ctxOf = (item: CaseItem) => ({
  anchor: anchorIso(item.anchor),
  conventions: { ...DEFAULT_CONVENTIONS, ...item.conventionsOverride },
  ...(item.customPresets ? { customPresets: item.customPresets } : {}),
  window: CONFIG.window,
});

/** Grade one fixture row with the pure scoring path (same as accuracy's ANALYZE). */
function grade(row: RunRow): TranslationScore {
  const item = itemById.get(row.itemId)!;
  const envelope = row.raw === null ? null : toEnvelope(row.raw);
  return envelope === null
    ? { exact: false, withinAcceptable: false, severity: 6, tags: ['no-output'], clarifySignal: false, noTimeAnswer: false, unresolvable: true }
    : scoreTranslation(envelope, item, ctxOf(item), row.arm === 'ir' ? 'ir' : 'iso');
}

const mode = process.argv[2];

if (mode === 'record') {
  const SLICES: Slice[] = ['specific', 'relative', 'named', 'custom', 'ranges', 'multipart', 'notime', 'ambiguous'];
  const smokeIds = new Set(SLICES.flatMap((s) => ALL_CASES.filter((c) => c.slice === s).slice(0, 2).map((c) => c.id)));
  const rows = readdirSync(RUN_DIR)
    .filter((f) => f.endsWith('.jsonl'))
    .flatMap((f) => readFileSync(`${RUN_DIR}/${f}`, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l) as RunRow))
    .filter((r) => smokeIds.has(r.itemId) && r.rep === 1 && r.tier === 'mini')
    .sort((a, b) => `${a.model}|${a.arm}|${a.itemId}`.localeCompare(`${b.model}|${b.arm}|${b.itemId}`));
  mkdirSync('fixtures', { recursive: true });
  writeFileSync(FIXTURE_FILE, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
  console.log(`recorded ${rows.length} fixture rows (${smokeIds.size} items × models × arms) → ${FIXTURE_FILE}`);

  // grade and snapshot in the same step, so record always leaves the pair consistent
  const scores = Object.fromEntries(rows.map((r) => [`${r.model}|${r.arm}|${r.itemId}`, grade(r)]));
  mkdirSync('results/smoke', { recursive: true });
  writeFileSync(SNAPSHOT_FILE, JSON.stringify({ promptVersion: rows[0]?.promptVersion, n: rows.length, scores }, null, 1));
  console.log(`snapshotted grades → ${SNAPSHOT_FILE}`);
} else {
  // replay (default): offline re-grade + assert
  if (!existsSync(FIXTURE_FILE)) {
    console.error(`no fixtures at ${FIXTURE_FILE} — run \`npm run fixtures:record\` first`);
    process.exit(1);
  }
  const rows = readFileSync(FIXTURE_FILE, 'utf8').trim().split('\n').map((l) => JSON.parse(l) as RunRow);
  const replayed = Object.fromEntries(rows.map((r) => [`${r.model}|${r.arm}|${r.itemId}`, grade(r)]));
  const snapshot = JSON.parse(readFileSync(SNAPSHOT_FILE, 'utf8')) as { n: number; scores: Record<string, TranslationScore> };
  let diffs = 0;
  for (const [key, want] of Object.entries(snapshot.scores)) {
    const got = replayed[key];
    if (JSON.stringify(got) !== JSON.stringify(want)) {
      diffs++;
      if (diffs <= 5) console.log(`DIFF ${key}\n  snapshot: ${JSON.stringify(want)}\n  replayed: ${JSON.stringify(got)}`);
    }
  }
  if (Object.keys(replayed).length !== snapshot.n) {
    console.log(`row-count mismatch: fixtures ${Object.keys(replayed).length} vs snapshot ${snapshot.n}`);
    diffs++;
  }
  if (diffs) {
    console.error(`replay FAILED: ${diffs} difference(s). If a scoring/key change was intentional, re-run \`npm run fixtures:record\` and commit the diff.`);
    process.exit(1);
  }
  console.log(`replay OK: ${snapshot.n} fixture rows re-graded offline, all scores match the committed snapshot.`);
}
