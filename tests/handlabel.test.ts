/**
 * Hand-label validation (Task 3): the resolver must agree with the human-derived
 * sample in handlabeled.ts EXACTLY — string-identical ISO values including offsets.
 * 0 disagreements is a step-2 gate requirement.
 */
import { describe, expect, it } from 'vitest';
import { HAND_LABELED } from '../src/datasets/cases/handlabeled.js';
import { ALL_CASES, anchorIso } from '../src/datasets/cases/index.js';
import { DEFAULT_CONVENTIONS } from '../src/scate-lite/conventions.js';
import { resolveIR } from '../src/scate-lite/resolver.js';

describe('hand-labeled sample: resolver agrees with human-derived ISO (0 disagreements)', () => {
  it.each(HAND_LABELED.map((h) => [h.itemId, h] as const))('%s', (_id, label) => {
    const item = ALL_CASES.find((c) => c.id === label.itemId);
    expect(item, `${label.itemId} must exist in the dataset`).toBeDefined();
    // The hand-label file must restate the item faithfully (it is self-contained):
    expect(label.query).toBe(item!.query);
    expect(label.anchor.id).toBe(item!.anchor);
    expect(label.anchor.iso).toBe(anchorIso(item!.anchor));
    const resolved = resolveIR(item!.canonicalIR!, {
      anchor: anchorIso(item!.anchor),
      conventions: { ...DEFAULT_CONVENTIONS, ...item!.conventionsOverride },
      ...(item!.customPresets ? { customPresets: item!.customPresets } : {}),
      window: { backMonths: 12, forwardMonths: 12 },
    });
    expect(resolved.intervals).toEqual(label.expected);
  });

  it('covers at least one item from every gradeable slice', () => {
    const slices = new Set(
      HAND_LABELED.map((h) => ALL_CASES.find((c) => c.id === h.itemId)!.slice),
    );
    for (const s of ['specific', 'relative', 'named', 'custom', 'ranges', 'multipart']) {
      expect(slices, `slice ${s}`).toContain(s);
    }
  });
});
