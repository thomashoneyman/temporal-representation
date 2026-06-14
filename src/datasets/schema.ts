/**
 * Mastra dataset schemas + the groundTruth payload builder.
 *
 * `input` is the bare user utterance; EVERYTHING else (anchor, key, labels, probes)
 * lives in `groundTruth`, and the harness lifts what it needs into requestContext at
 * run time — that's what keeps the datasets arm-agnostic.
 *
 * The stored key is the RESOLVED form (computed here from the canonical IR), so a
 * consumer of the exported JSON never needs the resolver to grade against it.
 */
import { z } from 'zod';
import { ConventionsSchema, DEFAULT_CONVENTIONS, type Conventions } from '../scate-lite/conventions.js';
import { TimeExprSchema } from '../scate-lite/ir.js';
import type { Interval, Resolved } from '../scate-lite/interval.js';
import { resolveIR, type ResolveCtx } from '../scate-lite/resolver.js';
import { expectedResolved, wallsToIntervals } from '../scoring/translation.js';
import { anchorIso } from './cases/index.js';
import type { CaseItem } from './cases/lib/types.js';

export const inputSchema = z.string().describe('the user utterance, verbatim');

const IntervalSchema = z.object({ start: z.string(), end: z.string() });
const ResolvedSchema = z.object({
  cardinality: z.enum(['point', 'range', 'set', 'none']),
  intervals: z.array(IntervalSchema),
  open: z.boolean().optional(),
});

export const groundTruthSchema = z.object({
  itemId: z.string(),
  anchor: z.string().describe('the seeded "now", ISO 8601 with offset'),
  slice: z.enum(['specific', 'relative', 'named', 'custom', 'ranges', 'multipart', 'notime', 'ambiguous']),
  conventions: ConventionsSchema.describe('snapshot used to build the key (reproducibility)'),
  // optional-not-nullable: Mastra's stored-schema validation rejects explicit nulls
  canonicalIR: TimeExprSchema.optional(),
  resolved: ResolvedSchema.optional().describe('the answer key (resolver output); absent for notime/ambiguous'),
  acceptableResolved: z.array(ResolvedSchema).optional().describe('Sev-4 interpretation divergences'),
  region: IntervalSchema.optional().describe('plausible region for non-enumerable ambiguous items'),
  expectClarify: z.boolean(),
  clarifyOptional: z.boolean().optional(),
  isNoTime: z.boolean().optional(),
  cardinality: z.enum(['point', 'range', 'set', 'none']),
  granularity: z.enum(['minute', 'hour', 'day', 'week', 'month', 'quarter', 'year']).optional(),
  expectedAmbiguity: z.number().int().min(1).max(5),
  customPresets: z.record(z.string(), TimeExprSchema).optional(),
  probe: z
    .object({
      axis: z.enum(['granularity', 'day-pinning', 'week-start', 'rolling-vs-calendar', 'bounds', 'occurrence']),
      candidates: z.record(z.string(), z.array(IntervalSchema)),
    })
    .optional(),
  notes: z.string().optional(),
});
export type GroundTruth = z.infer<typeof groundTruthSchema>;

export function ctxFor(item: CaseItem): ResolveCtx {
  return {
    anchor: anchorIso(item.anchor),
    conventions: { ...DEFAULT_CONVENTIONS, ...item.conventionsOverride } as Conventions,
    ...(item.customPresets ? { customPresets: item.customPresets } : {}),
    window: { backMonths: 12, forwardMonths: 12 },
  };
}

/** Build the stored groundTruth for one case item (re-resolving as a self-check). */
export function toGroundTruth(item: CaseItem): GroundTruth {
  let resolved: Resolved | null = null;
  if (item.canonicalIR && item.expected) {
    resolved = resolveIR(item.canonicalIR, ctxFor(item));
    // Self-check against the fixture (the test suite enforces this too — belt+braces
    // so a stale seed can never publish a key that disagrees with the fixtures).
    const fixture = expectedResolved(item)!;
    const same =
      resolved.intervals.length === fixture.intervals.length &&
      resolved.intervals.every((iv, i) => iv.start === fixture.intervals[i].start && iv.end === fixture.intervals[i].end);
    if (!same) throw new Error(`seed self-check failed for ${item.id}: resolver disagrees with fixture`);
  }
  const probeCandidates = item.probe
    ? Object.fromEntries(Object.entries(item.probe.candidates).map(([k, walls]) => [k, wallsToIntervals(walls)]))
    : undefined;
  return {
    itemId: item.id,
    anchor: anchorIso(item.anchor),
    slice: item.slice,
    conventions: { ...DEFAULT_CONVENTIONS, ...item.conventionsOverride },
    ...(item.canonicalIR ? { canonicalIR: item.canonicalIR } : {}),
    ...(resolved ? { resolved } : {}),
    ...(item.acceptable
      ? {
          acceptableResolved: item.acceptable.map((walls): Resolved => {
            const intervals: Interval[] = wallsToIntervals(walls);
            return { cardinality: intervals.length >= 2 ? 'set' : 'range', intervals };
          }),
        }
      : {}),
    ...(item.region ? { region: wallsToIntervals([item.region])[0] } : {}),
    expectClarify: item.shouldClarify,
    ...(item.clarifyOptional ? { clarifyOptional: true } : {}),
    ...(item.isNoTime ? { isNoTime: true } : {}),
    cardinality: item.cardinality,
    ...(item.granularity ? { granularity: item.granularity } : {}),
    expectedAmbiguity: item.expectedAmbiguity,
    ...(item.customPresets ? { customPresets: item.customPresets } : {}),
    ...(item.probe ? { probe: { axis: item.probe.axis, candidates: probeCandidates! } } : {}),
    ...(item.notes ? { notes: item.notes } : {}),
  };
}
