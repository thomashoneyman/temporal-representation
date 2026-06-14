/**
 * Phase-1 visualization — `pnpm phase1:viz` → results/phase1-viz.html.
 * Interactive (shared lib/viz.ts toolkit): hover/click-pin tooltips, legend
 * highlighting, section filter.
 *
 * WRITTEN FOR A LAY AUDIENCE: no internal item IDs, no jargon without an inline
 * explanation. Readers see the question asked, the date it was asked on, and which
 * concrete dates the model answered — never our internal labels alone.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { DateTime } from 'luxon';
import { ALL_CASES, anchorIso } from '../datasets/cases/index.js';
import { ZONE } from '../scate-lite/interval.js';
import { wallsToIntervals } from '../scoring/translation.js';
import { colorPicker, humanInterval, renderPage, type Section } from './lib/viz.js';

interface Phase1 {
  promptVersion: string;
  tier: string;
  reps: number;
  cells: Record<string, {
    rows: number;
    unresolvableRate: number;
    noTime?: { recall: number; overAbstain: Array<{ itemId: string; query: string; n: number }> };
    rejections?: Array<{ why: string; example: string; n: number }>;
    probeTallies: Record<string, { axis: string; query: string; counts: Record<string, number>; otherDetails?: Record<string, number> }>;
    determinism: { agreementRate: number; agreeingItems: number; itemsWithReps: number };
  }>;
}
const d = JSON.parse(readFileSync('results/phase1.json', 'utf8')) as Phase1;

const MODEL: Record<string, string> = {
  anthropic: 'claude-haiku-4-5', openai: 'gpt-5.4-mini',
  'anthropic/claude-haiku-4-5': 'claude-haiku-4-5', 'openai/gpt-5.4-mini': 'gpt-5.4-mini',
  'anthropic/claude-opus-4-8': 'claude-opus-4-8 (frontier)', 'openai/gpt-5.5': 'gpt-5.5 (frontier)',
};
const ARM: Record<string, string> = {
  iso: 'answering with concrete dates',
  ir: 'answering with a formal expression',
};
const cellName = (key: string): string => {
  const [prov, arm] = key.split('/');
  return `${MODEL[prov] ?? prov}, ${ARM[arm]}`;
};


const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

const cellOrder = Object.keys(d.cells).sort();
const itemById = new Map(ALL_CASES.map((c) => [c.id, c]));

/** Plain-language names for the readings our probes label internally. */
const READING_NAME: Record<string, string> = {
  pinned: 'same day-of-month, previous month',
  calendar30: 'exactly 30 days earlier',
  monStart: 'a Monday-to-Sunday week',
  sunStart: 'a Sunday-to-Saturday week',
  rolling7: 'the trailing 7 days',
  next: 'the next occurrence (rolls forward)',
  mostRecent: 'the most recent occurrence (looks back)',
  currentYear: "this calendar year's date",
  today: 'today itself',
  nextYear: "next year's date",
  sameDay: 'later today',
  nextWeek: 'the same day next week',
  comingFriday: 'the nearest upcoming Friday',
  nextWeekFriday: "NEXT week's Friday",
  inclusive: 'includes the end day',
  exclusive: 'excludes the end day',
  days1to7: 'days 1–7 of the month',
  firstFullWeek: 'the first full Monday-start week',
  other: 'something else (hover to see what)',
};
const readingName = (label: string): string =>
  label.split('=').map((l) => READING_NAME[l] ?? l).join(' = ');

const sections: Section[] = [];

// ── §1 channel health, in plain language ──
sections.push({
  id: 'consistency',
  title: 'Consistency: same question, same answer?',
  subtitle: `Each question was asked ${d.reps} times. This shows the share of questions where the model gave the IDENTICAL answer all ${d.reps} times.`,
  groups: [{
    bars: cellOrder.map((key) => {
      const c = d.cells[key];
      const v = c.determinism.agreementRate;
      return {
        rowLabel: cellName(key),
        segments: [
          { label: 'consistent', n: c.determinism.agreeingItems, total: c.determinism.itemsWithReps, color: key.endsWith('/ir') ? '#59a14f' : '#4e79a7', detail: [`${c.determinism.agreeingItems} of ${c.determinism.itemsWithReps} questions answered identically in all ${d.reps} repeats`] },
          { label: 'varied', n: c.determinism.itemsWithReps - c.determinism.agreeingItems, total: c.determinism.itemsWithReps, color: '#e8eaed', detail: ['questions where at least one repeat differed'] },
        ],
      };
    }),
  }],
  legend: [
    { label: 'consistent', color: '#59a14f', detail: ['identical answer in every repeat'] },
    { label: 'varied', color: '#e8eaed', detail: ['answers changed between repeats of the same question'] },
  ],
});

sections.push({
  id: 'notime',
  title: 'Saying “there is no time here” — only when it’s true',
  subtitle: `8 of the questions have no time aspect at all (e.g. “who owns the billing service?”). The right answer there is to say so. Green = correctly said “no time” on those. Listed beneath: real time questions the model wrongly answered “no time” to.`,
  groups: [{
    bars: cellOrder.map((key) => {
      const c = d.cells[key];
      const recall = c.noTime?.recall ?? 0;
      const over = c.noTime?.overAbstain ?? [];
      const overLines = over.length
        ? over.map((o) => `wrongly said “no time” to: “${o.query}” (${o.n} of ${d.reps} repeats)`)
        : ['never wrongly said “no time” to a real time question'];
      return {
        rowLabel: cellName(key),
        segments: [
          { label: 'correctly said no-time', n: Math.round(recall * 40), total: 40, color: '#59a14f', detail: [`on the no-time questions, answered “no time here” ${Math.round(recall * 100)}% of the time`, ...overLines] },
          { label: 'missed', n: 40 - Math.round(recall * 40), total: 40, color: '#e8eaed', detail: ['invented a time for a question that had none'] },
        ],
      };
    }),
  }],
  legend: [
    { label: 'correctly said no-time', color: '#59a14f', detail: ['the desired behavior on questions with no time aspect'] },
    { label: 'missed', color: '#e8eaed', detail: ['made up a time despite the question having none'] },
  ],
});

// ── §2 probes, grouped by what they test ──
const AXIS_TITLE: Record<string, { title: string; explain: string }> = {
  'rolling-vs-calendar': {
    title: '“A month ago” — calendar month or 30 days?',
    explain: 'Saying “a month ago” on March 12 could mean Feb 12 (same day, previous month) or Feb 10 (exactly 30 days). Which does the model pick?',
  },
  'week-start': {
    title: 'When does a week start?',
    explain: '“Last week” could be Monday–Sunday or Sunday–Saturday — different concrete dates.',
  },
  occurrence: {
    title: 'A date with no year — which one is meant?',
    explain: 'If someone says “March 4” on March 12, do they mean the March 4 that just passed, or next year’s? Same question for holidays: “Labor Day” said after Labor Day.',
  },
  bounds: {
    title: 'Where do ranges begin and end?',
    explain: 'Does “March 1 through 4” include the 4th? Is “the first week of March” days 1–7, or the first full calendar week?',
  },
};

const axes = new Map<string, Array<{ itemId: string; query: string }>>();
for (const c of Object.values(d.cells)) {
  for (const [itemId, t] of Object.entries(c.probeTallies)) {
    const list = axes.get(t.axis) ?? [];
    if (!list.some((x) => x.itemId === itemId)) list.push({ itemId, query: t.query });
    axes.set(t.axis, list);
  }
}

for (const [axis, items] of [...axes.entries()].sort()) {
  const meta = AXIS_TITLE[axis] ?? { title: axis, explain: '' };
  for (const { itemId, query } of items) {
    const item = itemById.get(itemId)!;
    const anchorTxt = DateTime.fromISO(anchorIso(item.anchor), { zone: ZONE }).toFormat('cccc MMM d yyyy, HH:mm');
    const color = colorPicker();
    const candLines = (label: string): string[] => {
      const walls = item.probe?.candidates[label];
      if (!walls) return [];
      return wallsToIntervals(walls).map((i) => humanInterval(i.start, i.end));
    };
    sections.push({
      id: `${axis}-${itemId}`,
      title: `${meta.title} — “${query}”`,
      subtitle: `${meta.explain}<br>Asked on <b>${esc(anchorTxt)}</b>, ${d.reps} times per row.${item.notes ? ` ${esc(item.notes)}` : ''}`,
      groups: [{
        bars: cellOrder
          .filter((key) => d.cells[key].probeTallies[itemId])
          // The formal-expression rows appear ONLY where the model genuinely chooses in
          // the expression itself (e.g. P1M vs P30D, an explicit "which" field). On
          // preset-shaped questions ("last week" → the last_week preset) the dates come
          // from OUR resolver's convention, not the model — showing that bar would
          // misrepresent our config as a model preference.
          .filter((key) => !key.endsWith('/ir') || item.probe?.irMeasures)
          .map((key) => {
            const t = d.cells[key].probeTallies[itemId];
            const total = Object.values(t.counts).reduce((a, b) => a + b, 0) || 1;
            return {
              rowLabel: cellName(key),
              segments: Object.entries(t.counts)
                .sort((a, b) => b[1] - a[1])
                .map(([label, n]) => ({
                  label: readingName(label),
                  n,
                  total,
                  color: color(label),
                  detail:
                    label === 'other' && t.otherDetails && Object.keys(t.otherDetails).length
                      ? Object.entries(t.otherDetails).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([x, c2]) => `model answered: ${x} (×${c2})`)
                      : candLines(label).length
                        ? ['this reading means:', ...candLines(label)]
                        : ['an answer outside the readings we anticipated'],
                })),
            };
          }),
      }],
      legend: Object.keys(item.probe?.candidates ?? {}).map((l) => ({
        label: readingName(l),
        color: color(l),
        detail: ['this reading means:', ...candLines(l)],
      })),
    });
  }
}

writeFileSync(
  'results/phase1-viz.html',
  renderPage({
    title: 'When you say “last week”, what does an AI model think you mean?',
    metaHtml: `This page is part of an experiment measuring how AI models turn everyday time
phrases into concrete dates — the step every software assistant must get right before it can
query anything. This is the <b>measurement</b> phase: nothing is graded; we are observing which
reading each model reaches for, before locking in an answer key. We asked two small AI models
(claude-haiku-4-5 and gpt-5.4-mini) 116 time questions, each ${d.reps} times, in two answer
formats: <b>concrete dates</b> (the model computes the dates itself) and <b>a formal
expression</b> (the model describes the time, e.g. “the week before the current one”, and our
deterministic code computes the dates). Two larger “frontier” models (claude-opus-4-8 and
gpt-5.5) also appear in some charts — they were asked ONLY the questions where the two small
models disagreed (concrete-dates format, 3 repeats instead of 5), so their consistency and
abstention numbers cover that harder subset and are not directly comparable to the small
models' full-set numbers. This file is self-contained — share it freely.
<span style="color:#9aa0a6">(A companion page, preferences-viz.html, covers common business
time-window phrases; if you only received this file, that link won't resolve.)</span>`,
    hintHtml: `Each bar shows how the model's answers to ONE question were distributed across repeats. A solid bar means the model always gave the same reading; a split bar means it flip-flopped. Some questions show only the concrete-dates rows: in the formal-expression format the model just names a period (“last week”) and OUR code picks the dates — that row would measure our configuration, not the model.`,
    sections,
  }),
);
console.log('wrote results/phase1-viz.html');
