import { describe, expect, it } from 'vitest';
import { DEFAULT_CONVENTIONS, renderConventions } from '../src/scate-lite/conventions.js';
import { TimeExprSchema, TimeExprThreadingSchema, type TimeExpr } from '../src/scate-lite/ir.js';
import { IsoValueSchema } from '../src/scate-lite/iso.js';

describe('TimeExpr core profile — the H1/H2 fairness boundary (no iso leaf)', () => {
  const isoLeaf: TimeExpr = { type: 'iso', start: '2026-06-14T00:00:00-04:00' };

  it('accepts each model-facing node', () => {
    const samples: TimeExpr[] = [
      { type: 'now' },
      { type: 'date', month: 3, day: 4 },
      { type: 'preset', name: 'last_week' },
      { type: 'ref', id: 'maintenance_window' },
      { type: 'shift', base: { type: 'preset', name: 'today' }, by: 'P3D', direction: 'before' },
      { type: 'weekday', day: 'tue', which: 'next', hour: 15 },
      { type: 'nth', n: 4, unit: 'thu', of: { type: 'date', month: 11 } },
      { type: 'range', from: { type: 'date', month: 3 }, to: null },
      { type: 'filter', within: { type: 'date', month: 3 }, weekdays: ['sat', 'sun'] },
      { type: 'union', of: [{ type: 'preset', name: 'this_quarter' }] },
    ];
    for (const s of samples) expect(TimeExprSchema.safeParse(s).success).toBe(true);
  });

  it('rejects a top-level iso leaf', () => {
    expect(TimeExprSchema.safeParse(isoLeaf).success).toBe(false);
  });

  it('rejects iso NESTED inside an operator (the contamination route)', () => {
    const nested: TimeExpr = { type: 'shift', base: isoLeaf, by: 'P3D', direction: 'after' };
    expect(TimeExprSchema.safeParse(nested).success).toBe(false);
    expect(TimeExprThreadingSchema.safeParse(nested).success).toBe(true);
  });

  it('rejects out-of-grammar nodes and bad fields', () => {
    expect(TimeExprSchema.safeParse({ type: 'holiday', name: 'thanksgiving' }).success).toBe(false);
    expect(TimeExprSchema.safeParse({ type: 'date', month: 13 }).success).toBe(false);
  });
});

describe('IsoValue', () => {
  it('accepts point / range / set; defaults bounds to half-open', () => {
    expect(IsoValueSchema.safeParse({ cardinality: 'point', at: '2026-06-09' }).success).toBe(true);
    const r = IsoValueSchema.parse({ cardinality: 'range', start: '2026-03-01', end: null });
    expect(r.cardinality === 'range' && r.bounds).toBe('[)');
    expect(
      IsoValueSchema.safeParse({
        cardinality: 'set',
        members: [{ start: '2026-06-08T00:00:00-04:00', end: '2026-06-09T00:00:00-04:00' }],
      }).success,
    ).toBe(true);
  });
});

describe('conventions', () => {
  it('renders every locked default into the promptable block', () => {
    const text = renderConventions(DEFAULT_CONVENTIONS);
    expect(text).toContain('Weeks start on Monday');
    expect(text).toContain('NEAREST occurrence');
    expect(text).toContain('INCLUDE the end day');
    expect(text).toContain('same day-of-month');
    expect(text).toContain('calendar quarters');
  });
  it('steering flips the rendered text (Task 5 mechanism)', () => {
    const steered = renderConventions({ ...DEFAULT_CONVENTIONS, weekStart: 'sun', monthAgo: 'calendar-30' });
    expect(steered).toContain('Weeks start on Sunday');
    expect(steered).toContain('exactly 30 days ago');
  });
});
