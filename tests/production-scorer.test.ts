import { describe, expect, it } from 'vitest';
import { checkTimeArgs } from '../src/scorers/production.js';

const ANCHOR = '2026-06-09T11:00:00-04:00';

describe('checkTimeArgs (production guardrail)', () => {
  it('passes a sane half-open day range', () => {
    expect(checkTimeArgs([{ start: '2026-06-08T00:00:00-04:00', end: '2026-06-09T00:00:00-04:00' }], { anchor: ANCHOR })).toEqual([]);
  });

  it('blocks end-before-start and zero-length', () => {
    const back = checkTimeArgs([{ start: '2026-06-09T00:00:00-04:00', end: '2026-06-08T00:00:00-04:00' }]);
    expect(back[0]).toMatchObject({ code: 'end-before-start', severity: 'block' });
    const zero = checkTimeArgs([{ start: '2026-06-09T00:00:00-04:00', end: '2026-06-09T00:00:00-04:00' }]);
    expect(zero[0]).toMatchObject({ code: 'zero-length', severity: 'block' });
  });

  it('blocks an empty set', () => {
    expect(checkTimeArgs([])[0]).toMatchObject({ code: 'empty-set', severity: 'block' });
  });

  it('flags the DST copy-paste (summer offset on a winter date)', () => {
    // January in New York is -05:00; -04:00 is the anchor's summer offset copied over.
    const flags = checkTimeArgs([{ start: '2026-01-12T00:00:00-04:00', end: '2026-01-13T00:00:00-04:00' }], { anchor: ANCHOR });
    expect(flags.some((f) => f.code === 'offset-mismatch')).toBe(true);
  });

  it('flags windows implausibly far from the anchor', () => {
    const flags = checkTimeArgs([{ start: '2031-06-08T00:00:00-04:00', end: '2031-06-09T00:00:00-04:00' }], { anchor: ANCHOR });
    expect(flags.some((f) => f.code === 'outside-window')).toBe(true);
  });

  it('flags the exactly-30-days "a month ago" signature only when it diverges from the calendar month', () => {
    // 2026-06-09 minus 30 days = 2026-05-10; minus 1 month = 2026-05-09 → divergent, flag.
    const flagged = checkTimeArgs([{ start: '2026-05-10T00:00:00-04:00', end: '2026-06-09T00:00:00-04:00' }], { anchor: ANCHOR });
    expect(flagged.some((f) => f.code === 'p30d-month-suspect')).toBe(true);
    // From an anchor where both coincide there is nothing to flag.
    const apr30 = '2026-07-01T09:00:00-04:00'; // -30d = 2026-06-01; -1mo = 2026-06-01 → same
    const clean = checkTimeArgs([{ start: '2026-06-01T00:00:00-04:00', end: '2026-07-01T00:00:00-04:00' }], { anchor: apr30 });
    expect(clean.some((f) => f.code === 'p30d-month-suspect')).toBe(false);
  });
});
