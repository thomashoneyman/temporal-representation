/**
 * Ground truth for chains: resolver-derived hop keys + labeled wrong-binding
 * distractors. Shared by the Task-7 runner and the visualization so they can never
 * disagree about what each step's correct time range is.
 */
import { anchorIso } from '../00-anchors.js';
import type { ChainItem } from '../09-chains.js';
import { DEFAULT_CONVENTIONS } from '../../../scate-lite/conventions.js';
import type { TimeExpr } from '../../../scate-lite/ir.js';
import type { Interval } from '../../../scate-lite/interval.js';
import { resolveIR } from '../../../scate-lite/resolver.js';

export const chainCtx = (anchor: string, presets: Record<string, TimeExpr>) => ({
  anchor,
  conventions: DEFAULT_CONVENTIONS,
  customPresets: presets,
  window: { backMonths: 12, forwardMonths: 18 },
});

export interface HopKey {
  expected: Interval[];
  /** Defensible alternative readings, resolver-computed. */
  acceptable: Interval[][];
  distractors: Record<string, Interval[]>;
  /** Milestones defined so far (after this hop), as concrete intervals. */
  milestones: Record<string, Interval>;
}

export function chainKeys(chain: ChainItem): HopKey[] {
  const anchor = anchorIso(chain.anchor);
  const presets: Record<string, TimeExpr> = {};
  const milestoneIv: Record<string, Interval> = {};
  return chain.hops.map((hop) => {
    const expected = resolveIR(hop.canonicalIR, chainCtx(anchor, presets)).intervals;
    const acceptable = (hop.acceptable ?? []).map((alt) => resolveIR(alt, chainCtx(anchor, presets)).intervals);
    const distractors: Record<string, Interval[]> = {};
    const referenced = JSON.stringify(hop.canonicalIR).match(/"id":"([a-z_]+)"/g)?.map((m) => m.slice(6, -1)) ?? [];
    for (const wrong of Object.keys(presets)) {
      if (referenced.includes(wrong) || referenced.length === 0) continue;
      const swapped: Record<string, TimeExpr> = { ...presets };
      for (const refName of referenced) swapped[refName] = presets[wrong];
      try {
        const v = resolveIR(hop.canonicalIR, chainCtx(anchor, swapped)).intervals;
        if (JSON.stringify(v) !== JSON.stringify(expected)) distractors[wrong] = v;
      } catch { /* unresolvable under the wrong binding — fine */ }
    }
    if (hop.defines) {
      milestoneIv[hop.defines] = expected[0];
      presets[hop.defines] = { type: 'iso', start: expected[0].start, end: expected[0].end } as TimeExpr;
    }
    return { expected, acceptable, distractors, milestones: { ...milestoneIv } };
  });
}
