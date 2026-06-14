/**
 * The full seeded dataset: 116 items across the 8 slices. Every gradeable item's
 * answer key derives from its canonical IR via the resolver — enforced by
 * tests/answer-key.test.ts, which makes this directory the trustworthy Artifact #1.
 */
import { AMBIGUOUS } from './08-ambiguous.js';
import { CUSTOM } from './04-custom.js';
import { MULTIPART } from './06-multipart.js';
import { NAMED } from './03-named.js';
import { NOTIME } from './07-notime.js';
import { RANGES } from './05-ranges.js';
import { RELATIVE } from './02-relative.js';
import { SPECIFIC } from './01-specific.js';
import type { CaseItem, Slice } from './lib/types.js';

export const SLICES: Record<Slice, CaseItem[]> = {
  specific: SPECIFIC,
  relative: RELATIVE,
  named: NAMED,
  custom: CUSTOM,
  ranges: RANGES,
  multipart: MULTIPART,
  notime: NOTIME,
  ambiguous: AMBIGUOUS,
};

export const ALL_CASES: CaseItem[] = Object.values(SLICES).flat();

export { ANCHORS, anchorIso } from './00-anchors.js';
export { PROMPT_DEFINITIONS } from './04-custom.js';
export type { AnchorId, CaseItem, ProbeAxis, Slice, Wall } from './lib/types.js';
