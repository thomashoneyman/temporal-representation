/**
 * Dataset seeding — `npm run seed`.
 *
 * Builds 9 Mastra Datasets (the 8 slices + `decompositions`, which reuses the slice-6
 * multipart items: their answer-key sets ARE the expected query_range calls). For each:
 * idempotent create-or-get by name; items added only when the dataset is empty or its
 * content hash changed (then it is rebuilt). Records versions to
 * artifacts/dataset-versions.json and exports portable JSON to artifacts/datasets/
 * (Artifact #1 — usable without Mastra or this repo).
 *
 */
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { mastra } from '../mastra/index.js';
import { ALL_CASES, SLICES } from './cases/index.js';
import type { CaseItem, Slice } from './cases/lib/types.js';
import { groundTruthSchema, inputSchema, toGroundTruth } from './schema.js';

const DATASET_VERSION_TAG = 'v0.4'; // consensus audit: C4-12 re-keyed (this/last-year conflation), M6-11 acceptable variant

interface SeedSpec {
  name: string;
  description: string;
  items: CaseItem[];
}

const SLICE_DESCRIPTIONS: Record<Slice, string> = {
  specific: 'Specific dates: bare-date occurrence, same-day weekday+time, invalid-date edges, hour points.',
  relative: 'Relative dates: the ISO-arm arithmetic slice (H1) — boundary crossings, business days, the pinning pair.',
  named: 'Named presets & holidays: week start/membership, to-date inclusivity, holiday rules + rolling.',
  custom: 'Org presets defined only in the prompt: fiscal override, sprints, billing cycles (H2 generalization).',
  ranges: 'Ranges & sets: inclusivity fenceposts, open ranges, first-week fork, rolling windows, date-sets.',
  multipart: 'Compound queries (AND/OR/NOT/COMPARE/mixed): expand to range sets; source of Task 7b.',
  notime: 'No-time queries: must abstain, not invent a time. Near-misses: latest/open/times/current.',
  ambiguous: 'No safe single default: acceptable sets + should-clarify labels + over-clarification controls.',
};

const specs: SeedSpec[] = [
  ...(Object.entries(SLICES) as Array<[Slice, CaseItem[]]>).map(([slice, items]) => ({
    name: `temporal-${slice}`,
    description: `${SLICE_DESCRIPTIONS[slice]} (${items.length} items, key ${DATASET_VERSION_TAG})`,
    items,
  })),
  {
    name: 'temporal-decompositions',
    description: `Task 7b: compound queries whose key sets are the expected per-range query calls (${SLICES.multipart.length} items, key ${DATASET_VERSION_TAG})`,
    items: SLICES.multipart,
  },
];

const contentHash = (items: CaseItem[]): string =>
  createHash('sha256').update(JSON.stringify(items.map(toGroundTruth))).digest('hex').slice(0, 12);

async function seedOne(spec: SeedSpec): Promise<{ name: string; id: string; version: number; items: number; hash: string }> {
  const hash = contentHash(spec.items);
  const existing = await mastra.datasets.list({ perPage: 100 });
  const found = existing.datasets?.find((d: { name: string }) => d.name === spec.name);

  let dataset;
  if (found && (found.metadata as { contentHash?: string } | undefined)?.contentHash === hash) {
    dataset = await mastra.datasets.get({ id: found.id });
    const versions = await dataset.listVersions();
    const latest = versions.versions[0]?.version ?? 0;
    console.log(`= ${spec.name}: unchanged (hash ${hash}), version ${latest}`);
    return { name: spec.name, id: found.id, version: latest, items: spec.items.length, hash };
  }

  if (found) {
    await mastra.datasets.delete({ id: found.id });
    console.log(`~ ${spec.name}: content changed — rebuilding`);
  }
  dataset = await mastra.datasets.create({
    name: spec.name,
    description: spec.description,
    inputSchema,
    groundTruthSchema,
    metadata: { contentHash: hash, keyVersion: DATASET_VERSION_TAG },
  });
  await dataset.addItems({
    items: spec.items.map((item) => ({
      input: item.query,
      groundTruth: toGroundTruth(item),
      metadata: { itemId: item.id, anchor: item.anchor, slice: item.slice },
    })),
  });
  const versions = await dataset.listVersions();
  const latest = versions.versions[0]?.version ?? 1;
  console.log(`+ ${spec.name}: created with ${spec.items.length} items (hash ${hash}), version ${latest}`);
  return { name: spec.name, id: dataset.id, version: latest, items: spec.items.length, hash };
}

mkdirSync('artifacts/datasets', { recursive: true });

const manifest: Array<Awaited<ReturnType<typeof seedOne>>> = [];
for (const spec of specs) {
  manifest.push(await seedOne(spec));
  // Portable export (Artifact #1): self-contained, no Mastra required to consume.
  writeFileSync(
    `artifacts/datasets/${spec.name}.json`,
    JSON.stringify(
      {
        name: spec.name,
        description: spec.description,
        keyVersion: DATASET_VERSION_TAG,
        items: spec.items.map((item) => ({ input: item.query, groundTruth: toGroundTruth(item) })),
      },
      null,
      2,
    ),
  );
}

writeFileSync('artifacts/dataset-versions.json', JSON.stringify({ seededAt: new Date().toISOString(), datasets: manifest }, null, 2));
console.log(`\nseeded ${manifest.length} datasets; exports in artifacts/datasets/, versions in artifacts/dataset-versions.json`);
console.log(`total items: ${ALL_CASES.length} (+ ${SLICES.multipart.length} reused for decompositions)`);
