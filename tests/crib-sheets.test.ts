/**
 * The ISO-PRESET crib sheets: per-anchor pre-resolved common periods
 * the ISO-PRESET arm receives in its prompt. They are part of the answer key — the
 * resolver must reproduce every line of the §7 table exactly. (A7 has no preset items
 * in v0.1 and no published crib sheet.)
 */
import { DateTime } from 'luxon';
import { describe, expect, it } from 'vitest';
import { anchorIso } from '../src/datasets/cases/index.js';
import type { AnchorId } from '../src/datasets/cases/lib/types.js';
import { DEFAULT_CONVENTIONS } from '../src/scate-lite/conventions.js';
import type { PresetName } from '../src/scate-lite/ir.js';
import { ZONE, ms } from '../src/scate-lite/interval.js';
import { resolveIR } from '../src/scate-lite/resolver.js';

const CRIB_PRESETS: PresetName[] = [
  'today', 'yesterday', 'this_week', 'last_week', 'this_month', 'last_month',
  'this_quarter', 'last_quarter', 'ytd',
];

/** §7 table, verbatim: [start, end) per preset, NY wall-clock dates. */
const SHEETS: Record<Exclude<AnchorId, 'A7'>, Record<string, [string, string]>> = {
  A1: {
    today: ['2026-03-12', '2026-03-13'], yesterday: ['2026-03-11', '2026-03-12'],
    this_week: ['2026-03-09', '2026-03-16'], last_week: ['2026-03-02', '2026-03-09'],
    this_month: ['2026-03-01', '2026-04-01'], last_month: ['2026-02-01', '2026-03-01'],
    this_quarter: ['2026-01-01', '2026-04-01'], last_quarter: ['2025-10-01', '2026-01-01'],
    ytd: ['2026-01-01', '2026-03-13'],
  },
  A2: {
    today: ['2025-09-15', '2025-09-16'], yesterday: ['2025-09-14', '2025-09-15'],
    this_week: ['2025-09-15', '2025-09-22'], last_week: ['2025-09-08', '2025-09-15'],
    this_month: ['2025-09-01', '2025-10-01'], last_month: ['2025-08-01', '2025-09-01'],
    this_quarter: ['2025-07-01', '2025-10-01'], last_quarter: ['2025-04-01', '2025-07-01'],
    ytd: ['2025-01-01', '2025-09-16'],
  },
  A3: {
    today: ['2026-01-15', '2026-01-16'], yesterday: ['2026-01-14', '2026-01-15'],
    this_week: ['2026-01-12', '2026-01-19'], last_week: ['2026-01-05', '2026-01-12'],
    this_month: ['2026-01-01', '2026-02-01'], last_month: ['2025-12-01', '2026-01-01'],
    this_quarter: ['2026-01-01', '2026-04-01'], last_quarter: ['2025-10-01', '2026-01-01'],
    ytd: ['2026-01-01', '2026-01-16'],
  },
  A4: {
    today: ['2025-11-26', '2025-11-27'], yesterday: ['2025-11-25', '2025-11-26'],
    this_week: ['2025-11-24', '2025-12-01'], last_week: ['2025-11-17', '2025-11-24'],
    this_month: ['2025-11-01', '2025-12-01'], last_month: ['2025-10-01', '2025-11-01'],
    this_quarter: ['2025-10-01', '2026-01-01'], last_quarter: ['2025-07-01', '2025-10-01'],
    ytd: ['2025-01-01', '2025-11-27'],
  },
  A5: {
    today: ['2026-06-09', '2026-06-10'], yesterday: ['2026-06-08', '2026-06-09'],
    this_week: ['2026-06-08', '2026-06-15'], last_week: ['2026-06-01', '2026-06-08'],
    this_month: ['2026-06-01', '2026-07-01'], last_month: ['2026-05-01', '2026-06-01'],
    this_quarter: ['2026-04-01', '2026-07-01'], last_quarter: ['2026-01-01', '2026-04-01'],
    ytd: ['2026-01-01', '2026-06-10'],
  },
  A6: {
    today: ['2025-12-30', '2025-12-31'], yesterday: ['2025-12-29', '2025-12-30'],
    this_week: ['2025-12-29', '2026-01-05'], last_week: ['2025-12-22', '2025-12-29'],
    this_month: ['2025-12-01', '2026-01-01'], last_month: ['2025-11-01', '2025-12-01'],
    this_quarter: ['2025-10-01', '2026-01-01'], last_quarter: ['2025-07-01', '2025-10-01'],
    ytd: ['2025-01-01', '2025-12-31'],
  },
  A8: {
    today: ['2026-04-19', '2026-04-20'], yesterday: ['2026-04-18', '2026-04-19'],
    this_week: ['2026-04-13', '2026-04-20'], last_week: ['2026-04-06', '2026-04-13'],
    this_month: ['2026-04-01', '2026-05-01'], last_month: ['2026-03-01', '2026-04-01'],
    this_quarter: ['2026-04-01', '2026-07-01'], last_quarter: ['2026-01-01', '2026-04-01'],
    ytd: ['2026-01-01', '2026-04-20'],
  },
  A9: {
    today: ['2025-10-31', '2025-11-01'], yesterday: ['2025-10-30', '2025-10-31'],
    this_week: ['2025-10-27', '2025-11-03'], last_week: ['2025-10-20', '2025-10-27'],
    this_month: ['2025-10-01', '2025-11-01'], last_month: ['2025-09-01', '2025-10-01'],
    this_quarter: ['2025-10-01', '2026-01-01'], last_quarter: ['2025-07-01', '2025-10-01'],
    ytd: ['2025-01-01', '2025-11-01'],
  },
};

const wall = (s: string): number => DateTime.fromISO(s, { zone: ZONE }).toMillis();

describe('ISO-PRESET crib sheets reproduce the hand-derived fixtures exactly', () => {
  const cases = Object.entries(SHEETS).flatMap(([anchor, sheet]) =>
    CRIB_PRESETS.map((p) => [`${anchor} ${p}`, anchor as AnchorId, p] as const),
  );
  it.each(cases)('%s', (_label, anchor, presetName) => {
    const sheet = SHEETS[anchor as Exclude<AnchorId, 'A7'>];
    const r = resolveIR({ type: 'preset', name: presetName }, {
      anchor: anchorIso(anchor),
      conventions: DEFAULT_CONVENTIONS,
      window: { backMonths: 12, forwardMonths: 12 },
    });
    const [s, e] = sheet[presetName];
    expect([ms(r.intervals[0].start), ms(r.intervals[0].end)]).toEqual([wall(s), wall(e)]);
  });
});
