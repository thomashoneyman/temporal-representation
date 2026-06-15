/**
 * Preference-grid visualization — `npm run preferences:viz` → results/1-measurement/preferences-viz.html.
 * One section per phrase; per model, a stacked bar per anchor position showing the share
 * of reps that chose each reading. Interactive (Alpine, vendored): hover/click-pin
 * tooltips with the concrete dates, legend highlighting, section filter.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { DateTime } from 'luxon';
import { buildGrid, PHRASES, POSITIONS, type PositionId } from '../../datasets/preference-grid.js';
import { ZONE, type Interval } from '../../scate-lite/interval.js';
import { colorPicker, humanInterval, renderPage, type Section } from '../lib/viz.js';

const data = JSON.parse(readFileSync('results/1-measurement/preferences.json', 'utf8')) as {
  cells: Record<string, Record<string, number>>;
  otherDetails?: Record<string, Record<string, number>>;
  shapes?: Record<string, Record<string, number>>;
  reps: number;
  tier: string;
  promptVersion: string;
};
const grid = new Map(buildGrid().map((g) => [g.id, g]));
const MODEL: Record<string, string> = {
  anthropic: 'claude-haiku-4-5', openai: 'gpt-5.4-mini',
  'anthropic/claude-haiku-4-5': 'claude-haiku-4-5', 'openai/gpt-5.4-mini': 'gpt-5.4-mini',
  'anthropic/claude-opus-4-8': 'claude-opus-4-8 (frontier)', 'openai/gpt-5.5': 'gpt-5.5 (frontier)',
};

/** Row label = the anchor date (documented once in the page intro). */
const POSITION_LABEL: Record<PositionId, string> = {
  weekMonday: 'Monday morning',
  weekWednesday: 'Midweek',
  weekSunday: 'Weekend (Sunday)',
  monthFirst: '1st of a month',
  monthLast: 'Last day of a month',
  quarterEnd: 'Last day of a quarter',
  yearStart: 'Just after New Year',
};

const spanLines = (ivs: Interval[]): string[] => ivs.map((i) => humanInterval(i.start, i.end));

const providers = [...new Set(Object.keys(data.cells).map((k) => k.split('|')[1]))].sort();
const positions = Object.keys(POSITIONS) as PositionId[];

const sections: Section[] = Object.keys(PHRASES).map((phrase) => {
  const idBase = phrase.replace(/\s+/g, '-');
  const color = colorPicker();
  const ref = grid.get(`${idBase}@weekWednesday`)!;

  const groups = providers.map((provider) => ({
    name: MODEL[provider] ?? provider,
    bars: positions.map((pos) => {
      const id = `${idBase}@${pos}`;
      const item = grid.get(id)!;
      const counts = data.cells[`${id}|${provider}`] ?? {};
      const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1;
      const anchorDt = DateTime.fromISO(item.anchor, { zone: ZONE });
      return {
        rowLabel: `${POSITION_LABEL[pos]} — ${anchorDt.toFormat('ccc, MMM d yyyy')}`,
        segments: Object.entries(counts)
          .sort((a, b) => b[1] - a[1])
          .map(([label, n]) => {
            const others = data.otherDetails?.[`${id}|${provider}`];
            const detail = item.candidates[label]
              ? spanLines(item.candidates[label])
              : label === 'other' && others
                ? Object.entries(others).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([d, c]) => `model chose: ${d} (×${c})`)
                : ['(no value produced)'];
            return { label, n, total, color: color(label), detail };
          }),
      };
    }),
  }));

  // One aggregate shape verdict per phrase: unanimous shapes get a sentence; splits
  // get the per-model breakdown — point-vs-range is a separate preference from which dates.
  const shapeSummary = (() => {
    const perModel: Record<string, Record<string, number>> = {};
    for (const provider of providers) {
      const agg: Record<string, number> = {};
      for (const pos of positions) {
        const st = data.shapes?.[`${idBase}@${pos}|${provider}`] ?? {};
        for (const [k, v] of Object.entries(st)) agg[k] = (agg[k] ?? 0) + v;
      }
      if (Object.keys(agg).length) perModel[MODEL[provider] ?? provider] = agg;
    }
    if (!Object.keys(perModel).length) return '';
    const dominant = (agg: Record<string, number>): [string, number] => {
      const total = Object.values(agg).reduce((a, b) => a + b, 0);
      const [top, n] = Object.entries(agg).sort((a, b) => b[1] - a[1])[0];
      return [top, Math.round((n / total) * 100)];
    };
    const verdicts = Object.entries(perModel).map(([m, agg]) => ({ m, d: dominant(agg) }));
    const SHAPE_WORD: Record<string, string> = { point: 'a single moment/day', range: 'a span', set: 'several spans' };
    if (verdicts.every((v) => v.d[1] >= 90) && new Set(verdicts.map((v) => v.d[0])).size === 1) {
      return `<b>Shape:</b> every model answers with ${SHAPE_WORD[verdicts[0].d[0]] ?? verdicts[0].d[0]}.`;
    }
    return `<b>Shape (split):</b> ${verdicts.map((v) => `${v.m} → ${SHAPE_WORD[v.d[0]] ?? v.d[0]} ${v.d[1]}%`).join(' · ')}.`;
  })();

  void shapeSummary;
  // ONE pooled shape bar per phrase: every answer from every model, in one strip.
  // Solid = all models agree on the shape; split = the disagreement, sized by share.
  const SHAPE_META: Record<string, { color: string; label: string; explain: string }> = {
    point: { color: '#8c6bb1', label: 'a single moment/day', explain: 'deadline-style: one instant or one day' },
    range: { color: '#41ab5d', label: 'a span (start → end)', explain: 'a stretch of time with a start and an end' },
    set: { color: '#fe9929', label: 'several spans', explain: 'multiple separate stretches' },
  };
  const pooled: Record<string, { n: number; byModel: Record<string, number> }> = {};
  let pooledTotal = 0;
  for (const provider of providers) {
    for (const pos of positions) {
      const st = data.shapes?.[`${idBase}@${pos}|${provider}`] ?? {};
      for (const [shape, v] of Object.entries(st)) {
        const e = (pooled[shape] ??= { n: 0, byModel: {} });
        e.n += v;
        e.byModel[MODEL[provider] ?? provider] = (e.byModel[MODEL[provider] ?? provider] ?? 0) + v;
        pooledTotal += v;
      }
    }
  }
  const shapeGroup =
    pooledTotal === 0
      ? []
      : [{
          bars: [{
            rowLabel: 'shape of the answer — all models pooled',
            segments: Object.entries(pooled)
              .sort((a, b) => b[1].n - a[1].n)
              .map(([shape, e]) => ({
                label: SHAPE_META[shape]?.label ?? shape,
                n: e.n,
                total: pooledTotal,
                color: SHAPE_META[shape]?.color ?? '#9aa0a6',
                detail: [
                  SHAPE_META[shape]?.explain ?? shape,
                  ...Object.entries(e.byModel).map(([m, v]) => `${m}: ${v} answers`),
                ],
              })),
          }],
        }];
  return {
    id: idBase,
    title: `“${phrase}”`,
    groups: [...shapeGroup, ...groups],
    legend: Object.keys(ref.candidates).map((l) => ({
      label: l,
      color: color(l),
      detail: [`at the midweek anchor (${DateTime.fromISO(ref.anchor, { zone: ZONE }).toFormat('MMM d yyyy')}), this reading means:`, ...spanLines(ref.candidates[l])],
    })),
  };
});

writeFileSync(
  'results/1-measurement/preferences-viz.html',
  renderPage({
    title: 'Which reading does each model choose?',
    metaHtml: `This page is part of an experiment measuring how AI models turn everyday time
phrases into concrete dates. We asked two small AI models (claude-haiku-4-5 and gpt-5.4-mini)
about ~29 common business time windows (“the past month”, “year to date”, “early next week”),
each phrase asked at 7 different calendar positions (a Monday morning, a Sunday, the last day
of a month, a quarter end…) and repeated ${data.reps} times, with the model answering in concrete
dates. Each row is the SAME question asked on a different <b>anchor date</b> — the date the model is told “now” is — so you can see whether the meaning shifts with the calendar. Segments show what share of the repeats chose each reading.
Labels joined with “=” mean two readings happen to give identical dates at that asking-date.
<b>Note on the frontier rows:</b> the two larger models (claude-opus-4-8 and gpt-5.5) were run
only on the questions where the two small models showed any disagreement — between repeats,
between each other, or between answer formats — so frontier bars appear on a subset, with fewer
repeats (3 vs 5). Where a frontier bar is missing, the small models already agreed unanimously.
This file is self-contained — share it freely. <span style="color:#9aa0a6">(Generated from run
${data.promptVersion}; a companion page, consistency-viz.html, covers ambiguity probes.)</span>`,
    hintHtml: `<b>How to read it:</b> a single solid bar = the model always means the same dates. A split bar = the model flips between readings on identical input. Colors changing from row to row = the phrase means different things depending on the day it's said.`,
    sections,
  }),
);
console.log('wrote results/1-measurement/preferences-viz.html');
