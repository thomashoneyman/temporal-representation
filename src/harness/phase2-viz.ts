/**
 * Task-4 graded results — `npm run phase2:viz` → results/phase2-viz.html.
 * One section per question category; one bar per (model × answer format) showing how
 * answers distribute across the error-severity ladder. Self-contained, lay-audience.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { DateTime } from 'luxon';
import { ALL_CASES, anchorIso } from '../datasets/cases/index.js';
import type { CaseItem } from '../datasets/cases/lib/types.js';
import { describeIntervals } from '../scoring/interpretation.js';
import { expectedResolved, wallsToIntervals } from '../scoring/translation.js';
import { renderPage, type Section } from './lib/viz.js';
import { winnerTable } from './lib/winner-table.js';

interface Cell {
  n: number;
  exact: number;
  timeCorrect: number;
  withinAcceptable: number;
  offByOne: number;
  unresolvable: number;
  sevHist: Record<string, number>;
  tags: Record<string, number>;
  determinism?: { itemsWithReps: number; agreeing: number };
  tokens?: { in: number; out: number };
}
const d = JSON.parse(readFileSync('results/phase2.json', 'utf8')) as {
  promptVersion: string;
  reps: number;
  keyVersion: string;
  cells: Record<string, Cell>;
  samples?: Record<string, Array<{ q: string; asked?: string; expected: string; actual: string; tags: string; n: number }>>;
  task6?: Record<string, { clarification: { precision: number; recall: number; f1: number }; noTime: { precision: number; recall: number; f1: number } }>;
  task6Samples?: Record<string, Array<{ q: string; asked: string; expected: string; actual: string; n: number }>>;
};

const MODELS = [
  'anthropic/claude-haiku-4-5',
  'openai/gpt-5.4-mini',
  'anthropic/claude-opus-4-8',
  'openai/gpt-5.5',
  'chrono-node',
];
const MODEL_NAME: Record<string, string> = {
  'anthropic/claude-haiku-4-5': 'claude-haiku-4-5 (small)',
  'openai/gpt-5.4-mini': 'gpt-5.4-mini (small)',
  'anthropic/claude-opus-4-8': 'claude-opus-4-8 (frontier, 1 repeat)',
  'openai/gpt-5.5': 'gpt-5.5 (frontier, 1 repeat)',
  'chrono-node': 'chrono-node (rule-based parser, no AI)',
};
const ARMS: Array<[string, string]> = [
  ['iso', 'concrete dates'],
  ['iso-preset', 'concrete dates + cheat sheet'],
  ['ir', 'formal expression'],
  ['baseline', 'rule-based parser'],
];

/** Severity buckets in DISPLAY order: best → worst outcome for a user. (The internal
 *  severity codes recorded in run rows keep their original numbering; this view orders
 *  by how acceptable the outcome is, which is what a reader needs.) A "reasonable,
 *  different convention" answer ranks immediately after exact: it is correct under a
 *  defensible spec — we just never told the model OUR spec in this unprompted setting.
 *  Every real error ranks below it. */
const SEV: Array<{ sevs: string[]; label: string; color: string; explain: string }> = [
  { sevs: ['0'], label: 'exact', color: '#2e7d32', explain: 'precisely the dates the answer key expects' },
  { sevs: ['4'], label: 'reasonable, different convention', color: '#9ccc65', explain: 'correct under a documented alternative reading (e.g. "a month ago" as exactly 30 days). Not an error — our conventions were deliberately NOT in the prompt; a later run measures how much of this converts to exact when they are.' },
  { sevs: ['3'], label: 'right time, wrong precision or span', color: '#4db6ac', explain: 'identified the right time but answered at the wrong precision (a minute instead of the whole day) or the wrong period shape (a Sunday-start week)' },
  { sevs: ['1'], label: 'off by one', color: '#ffd54f', explain: 'one unit off — the classic fencepost ("through Friday" ending Thursday night)' },
  { sevs: ['2'], label: 'near miss', color: '#ffb74d', explain: 'within a few units of the right answer' },
  { sevs: ['5'], label: 'wrong operation', color: '#ef6c00', explain: 'added instead of subtracted, wrong direction, wrong unit' },
  { sevs: ['6'], label: 'wrong', color: '#c62828', explain: 'an unrelated date, or a time invented for a question that had none' },
];

const SLICE_TITLE: Record<string, { title: string; explain: string }> = {
  ALL: { title: 'All categories combined', explain: 'Every question in the dataset — including the hard set. (The hard-set view below is an overlapping lens on the same answers, not a separate pool.)' },
  HARD: { title: 'The hard set (a subset of the above)', explain: 'The 23 deliberately difficult questions, shown separately. They also count inside “All categories” and inside their own categories. Added once round 1 showed simple cases were largely solved: large offsets (“in 250 days”), chained operations (“two weeks after the last business day of next month”), ordinal arithmetic (“the 100th day of the year”), midpoints, and multi-constraint compounds.' },
  specific: { title: 'Specific dates', explain: '“March 4”, “Tuesday at 3pm”, “6/15” — naming a date outright.' },
  relative: { title: 'Relative dates (the arithmetic test)', explain: '“three days ago”, “in 3 business days” — the model (or our code) must do calendar math.' },
  named: { title: 'Named periods & holidays', explain: '“last week”, “YTD”, “Thanksgiving” — common business shorthand.' },
  custom: { title: 'Company-specific periods', explain: '“our maintenance window”, “the current sprint” — defined only in the prompt; tests reading an unfamiliar definition.' },
  ranges: { title: 'Ranges & repeating days', explain: '“March 1 through 4”, “since March”, “weekends in March”.' },
  multipart: { title: 'Compound questions', explain: '“past month, Tue–Thu, 8am–12pm” — several constraints at once, answer is a set of windows.' },
  notime: { title: 'No time at all', explain: '“who owns the billing service?” — the right answer is “there is no time here”.' },
  ambiguous: { title: 'Genuinely ambiguous', explain: '“around the holidays”, “soon” — no single safe reading; graded against a set of acceptable answers.' },
};

const ARM_EXPLAIN: Record<string, string> = {
  iso: 'the model does the calendar math itself and answers with timestamps',
  'iso-preset': 'same, but the prompt also lists pre-computed common periods for the asking date',
  ir: 'the model describes the time in a small formal language; deterministic code computes the dates',
  baseline: 'a traditional rule-based date parser (chrono) — no AI at all',
};

const sections: Section[] = [];
for (const slice of ['ALL', 'specific', 'relative', 'named', 'custom', 'ranges', 'multipart', 'notime', 'ambiguous']) {
  const meta = SLICE_TITLE[slice];
  // Grouped by METHOD: the experiment compares ways of answering, so the methods sit
  // side by side and the models repeat inside each group.
  const groups = [];
  for (const [arm, armName] of ARMS) {
    const bars = [];
    for (const model of MODELS) {
      const c = d.cells[`${model}|${arm}|${slice}`];
      if (!c) continue;
      const segments = SEV.map((bucket) => {
        const n = bucket.sevs.reduce((acc, s) => acc + (c.sevHist[s] ?? 0), 0);
        // ALL has no sample key of its own — pool the per-category samples instead, so
        // every clickable bar (Summary tab included) opens its underlying answers.
        const sliceKeys = slice === 'ALL'
          ? ['specific', 'relative', 'named', 'custom', 'ranges', 'multipart', 'notime', 'ambiguous']
          : [slice];
        const rows = bucket.sevs
          .flatMap((sev) => sliceKeys.flatMap((sk) => d.samples?.[`${model}|${arm}|${sk}|${sev}`] ?? []))
          .sort((a, b) => b.n - a.n)
          .slice(0, 25)
          .map((r) => ({ q: r.q, asked: r.asked ?? '', actual: r.actual, expected: r.expected, note: r.tags, n: r.n }));
        return { label: bucket.label, n, total: c.n, color: bucket.color, detail: [bucket.explain, ...(rows?.length ? ['click for the underlying answers'] : [])], rows };
      }).filter((s) => s.n > 0);
      bars.push({ rowLabel: MODEL_NAME[model], segments });
    }
    if (bars.length) groups.push({ name: `${armName} — ${ARM_EXPLAIN[arm]}`, bars });
  }
  sections.push({
    id: `slice-${slice}`,
    title: meta.title,
    subtitle: meta.explain,
    groups,
    legend: SEV.map((b) => ({ label: b.label, color: b.color, detail: [b.explain] })),
  });
}

// ── leaderboards (Summary tab): sorted single-metric views ──
const METHOD_COLOR: Record<string, string> = { iso: '#4e79a7', 'iso-preset': '#f28e2b', ir: '#59a14f', baseline: '#9aa0a6' };
const METHOD_LABEL: Record<string, string> = {
  iso: 'concrete dates',
  'iso-preset': 'concrete dates + cheat sheet',
  ir: 'formal expression',
  baseline: 'rule-based parser',
};

// A: overall leaderboard — every (model × method), live-sortable by three metrics.
// Severity weights for the compound "quality" metric: each answer scores by how usable
// its outcome is downstream (exact=1 … wrong=0); a cell's quality = weighted mean.
const SEV_WEIGHT: Record<string, number> = { '0': 1, '4': 0.85, '3': 0.6, '1': 0.45, '2': 0.3, '5': 0.1, '6': 0 };
{
  const rows: Array<{ label: string; color: string; exact: number; within: number; quality: number; n: number }> = [];
  for (const model of MODELS) {
    for (const [arm] of ARMS) {
      const c = d.cells[`${model}|${arm}|ALL`];
      if (!c) continue;
      const quality = Object.entries(c.sevHist).reduce((acc, [sev, count]) => acc + (SEV_WEIGHT[sev] ?? 0) * count, 0) / c.n;
      rows.push({
        label: `${MODEL_NAME[model]} — ${METHOD_LABEL[arm]}`,
        color: METHOD_COLOR[arm],
        exact: Math.round((c.exact / c.n) * 100),
        within: Math.round((c.withinAcceptable / c.n) * 100),
        quality: Math.round(quality * 100),
        n: c.n,
      });
    }
  }
  const lbData = JSON.stringify({ rows }).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  sections.unshift({
    id: 'leaderboard-overall',
    title: 'Leaderboard — every model × method, sorted',
    subtitle: 'Colors = method, so vertical color clustering means the METHOD (not the model) is what separates the top from the bottom. Switch the metric to re-score and re-sort.',
    groups: [], legend: [],
    customHtml: `
<div x-data="${lbData}">
  <div class="sub" style="margin-bottom:.5rem">Scored under the metric selected at the top of the page.</div>
  <template x-for="r in [...rows].sort((a, b) => b[$store.tip.metric] - a[$store.tip.metric])" :key="r.label">
    <div class="row">
      <div class="pos" :title="r.label" x-text="r.label"></div>
      <div class="bar" style="background:#f1f3f4">
        <div class="seg" :style="'width:' + r[$store.tip.metric] + '%;background:' + r.color"><span x-text="r[$store.tip.metric] + '%'"></span></div>
      </div>
    </div>
  </template>
  <div class="legend">${Object.entries(METHOD_LABEL).map(([arm, label]) => `<span class="lg"><span class="sw" style="background:${METHOD_COLOR[arm]}"></span>${label}</span>`).join('')}</div>
</div>`,
  });
}

// B: per-category method comparison — pooled across models, live-sorted by the shared metric.
{
  const cats = [];
  for (const slice of ['specific', 'relative', 'named', 'custom', 'ranges', 'multipart', 'notime', 'ambiguous']) {
    const methods = [];
    for (const [arm] of ARMS) {
      if (arm === 'baseline') continue;
      let exact = 0, within = 0, qualitySum = 0, n = 0;
      for (const model of MODELS) {
        const c = d.cells[`${model}|${arm}|${slice}`];
        if (!c) continue;
        exact += c.exact; within += c.withinAcceptable; n += c.n;
        qualitySum += Object.entries(c.sevHist).reduce((acc, [sev, count]) => acc + (SEV_WEIGHT[sev] ?? 0) * count, 0);
      }
      if (n) methods.push({
        label: METHOD_LABEL[arm],
        color: METHOD_COLOR[arm],
        exact: Math.round((exact / n) * 100),
        within: Math.round((within / n) * 100),
        quality: Math.round((qualitySum / n) * 100),
      });
    }
    cats.push({ name: SLICE_TITLE[slice].title, methods });
  }
  const catData = JSON.stringify({ cats }).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  sections.splice(1, 0, {
    id: 'leaderboard-category',
    title: 'Which method wins where?',
    subtitle: 'Per question category: the three methods sorted best-first under the metric selected above, pooled across all four models. A green top row = the formal expression wins that category; blue = the models’ own concrete dates are already best.',
    groups: [], legend: [],
    customHtml: `
<div x-data="${catData}">
  <template x-for="cat in cats" :key="cat.name">
    <div>
      <div class="model" x-text="cat.name"></div>
      <template x-for="m in [...cat.methods].sort((a, b) => b[$store.tip.metric] - a[$store.tip.metric])" :key="m.label">
        <div class="row">
          <div class="pos" x-text="m.label"></div>
          <div class="bar" style="background:#f1f3f4">
            <div class="seg" :style="'width:' + m[$store.tip.metric] + '%;background:' + m.color"><span x-text="m[$store.tip.metric] + '%'"></span></div>
          </div>
        </div>
      </template>
    </div>
  </template>
  <div class="legend">${Object.entries(METHOD_LABEL).filter(([a]) => a !== 'baseline').map(([arm, label]) => `<span class="lg"><span class="sw" style="background:${METHOD_COLOR[arm]}"></span>${label}</span>`).join('')}</div>
</div>`,
  });
}

// 0: the short answer — one row per model, best method highlighted; the metric toggle
// is shared with the leaderboards below ($store.tip.metric).
{
  const wt = winnerTable({
    columns: ARMS.filter(([a]) => a !== 'baseline').map(([arm]) => ({ key: arm, label: METHOD_LABEL[arm], color: METHOD_COLOR[arm] })),
    rows: MODELS.filter((m) => m !== 'chrono-node').map((model) => ({
      label: MODEL_NAME[model],
      cells: Object.fromEntries(
        ARMS.map(([arm]) => {
          const c = d.cells[`${model}|${arm}|ALL`];
          if (!c) return [arm, undefined];
          const quality = Object.entries(c.sevHist).reduce((acc, [sev, count]) => acc + (SEV_WEIGHT[sev] ?? 0) * count, 0) / c.n;
          return [arm, { exact: (c.exact / c.n) * 100, within: (c.withinAcceptable / c.n) * 100, quality: quality * 100 }];
        }),
      ),
    })),
    metrics: [
      { key: 'exact', label: '<b>strict</b> — matched the answer key exactly' },
      { key: 'within', label: '<b>strict + reasonable</b> — also counts documented alternative readings' },
      { key: 'quality', label: '<b>severity-weighted</b> — every answer scores by how usable it is' },
    ],
    caption: `Green cell = that model's best method under the selected metric — the toggle re-scores every chart in this tab. For comparison, the no-AI
rule-based parser scores ${Math.round(((d.cells['chrono-node|baseline|ALL']?.exact ?? 0) / (d.cells['chrono-node|baseline|ALL']?.n ?? 1)) * 100)}% strict.`,
  });
  sections.unshift({
    id: 'winner',
    title: 'The short answer: the formal expression wins for every model',
    subtitle: 'Percent of all questions answered with the right dates, by model × method.',
    groups: [], legend: [],
    customHtml: wt,
  });
}

// ── Answer key tab: the full question → key table, so any number in the charts can be
// checked against what we actually graded toward. Generated from the dataset itself
// (the same source the scorer uses), never re-typed by hand.
{
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const keyText = (item: CaseItem): string =>
    item.expected
      ? describeIntervals(expectedResolved(item)!.intervals)
      : item.isNoTime
        ? '“no time here” — answering with any window is wrong'
        : item.acceptable?.length
          ? `any of: ${item.acceptable.map((w) => describeIntervals(wallsToIntervals(w))).join('  ·or·  ')}`
          : item.region
            ? `any window inside ${describeIntervals(wallsToIntervals([item.region]))}`
            : '(graded by rubric)';
  const blocks = Object.entries(SLICE_TITLE)
    .filter(([slice]) => !['ALL', 'HARD'].includes(slice))
    .map(([slice, meta]) => {
      const items = ALL_CASES.filter((c) => c.slice === slice);
      const rows = items
        .map((item) => {
          const asked = DateTime.fromISO(anchorIso(item.anchor), { zone: 'America/New_York' }).toFormat('ccc, MMM d yyyy HH:mm');
          const extras = [
            item.acceptable?.length && item.expected ? `also accepted: ${item.acceptable.map((w) => describeIntervals(wallsToIntervals(w))).join('  ·or·  ')}` : '',
            item.shouldClarify ? 'asking to clarify counts as correct' : item.clarifyOptional ? 'asking to clarify is allowed' : '',
          ].filter(Boolean).join(' · ');
          return `<tr><td>${esc(item.query)}</td><td style="white-space:nowrap">${asked}</td><td>${esc(keyText(item))}${extras ? `<br><span style="color:#5f6368">${esc(extras)}</span>` : ''}</td></tr>`;
        })
        .join('\n');
      return `<details><summary><b>${meta.title}</b> — ${items.length} questions · ${esc(meta.explain)}</summary>
<table><thead><tr><th>question</th><th>asked on</th><th>the key (what counts as right)</th></tr></thead><tbody>${rows}</tbody></table></details>`;
    })
    .join('\n');
  sections.push({
    id: 'answer-key',
    title: 'The full answer key',
    subtitle: `Every question in the dataset and exactly what the grader accepts (key ${d.keyVersion}). “Also accepted” readings score as “reasonable, different convention”, one step below exact. Click a category to expand it.`,
    groups: [], legend: [],
    customHtml: `<div class="answer-key">${blocks}</div>
<style>.answer-key details{margin:.5rem 0;background:#f8f9fa;border-radius:8px;padding:.5rem .8rem}
.answer-key summary{cursor:pointer;font-size:.85rem}
.answer-key table{border-collapse:collapse;width:100%;font-size:.8rem;margin-top:.5rem}
.answer-key th{text-align:left;color:#5f6368;font-weight:600;padding:.15rem .5rem .15rem 0}
.answer-key td{padding:.15rem .75rem .15rem 0;border-top:1px solid #e8eaed;vertical-align:top}</style>`,
  });
}


// ── Task 6 tab: clarification & no-time behavior — standard clickable bars; every
// segment opens the actual questions so the reader can judge key vs model themselves. ──
{
  const t6s = (key: string) =>
    (d.task6Samples?.[key] ?? []).map((r) => ({ q: r.q, asked: r.asked, actual: r.actual, expected: r.expected, n: r.n }));
  const comboBars = (kind: 'notime' | 'clar') => {
    const bars = [];
    for (const model of MODELS.filter((m) => m !== 'chrono-node')) {
      for (const [arm] of ARMS.filter(([a]) => a !== 'baseline')) {
        const base = `${model}|${arm}`;
        if (!d.task6?.[base]) continue;
        const hit = t6s(`${base}|${kind}-hit`);
        const miss = t6s(`${base}|${kind}-miss`);
        const extraKey = kind === 'notime' ? 'notime-falseflag' : 'clar-unneeded';
        const extra = t6s(`${base}|${extraKey}`);
        const count = (rows: typeof hit) => rows.reduce((acc, r) => acc + r.n, 0);
        const total = count(hit) + count(miss);
        const segs = [
          { label: kind === 'notime' ? 'correctly said “no time”' : 'asked, as it should', n: count(hit), total, color: '#2e7d32', detail: ['click for the questions'], rows: hit },
          { label: kind === 'notime' ? 'invented a time period' : 'answered with a guess instead', n: count(miss), total, color: '#c62828', detail: ['click for the questions — judge the key yourself'], rows: miss },
          { label: kind === 'notime' ? 'cried “no time” on a real time' : 'asked when a safe default existed', n: count(extra), total: total + count(extra), color: '#ffd54f', detail: ['counted against precision — click for the questions', 'judge for yourself whether asking here would have annoyed you'], rows: extra },
        ].filter((s) => s.n > 0);
        if (segs.length) bars.push({ rowLabel: `${MODEL_NAME[model]} — ${METHOD_LABEL[arm]}`, segments: segs });
      }
    }
    return bars;
  };
  sections.push({
    id: 'task6-notime',
    title: 'Spotting questions with no time in them at all',
    subtitle: '“Who owns the billing service?” — the right move is to say there is no time period, not to invent one. Green/red bars cover the hand-labeled no-time questions; the yellow tail counts times the model said “no time” to a question that DID have one. Essentially solved. Click any segment for the actual questions.',
    groups: [{ bars: comboBars('notime') }],
    legend: [
      { label: 'correctly said “no time”', color: '#2e7d32', detail: ['flagged a no-time question'] },
      { label: 'invented a time period', color: '#c62828', detail: ['made up dates for a question that had none'] },
      { label: 'cried “no time” on a real time', color: '#ffd54f', detail: ['said no-time to a question that had a time period'] },
    ],
  });
  sections.push({
    id: 'task6-clar',
    title: 'Asking for clarification on the genuinely ambiguous',
    subtitle: '“Before the long weekend”, “soon” — a careful assistant asks which dates you mean. Green/red bars cover the hand-labeled genuinely-ambiguous questions (3 of them, × repeats); the yellow tail counts asks on questions our label says had a safe default — each yellow row shows WHAT that default was, so judge for yourself. The pattern: models UNDER-ask — they answer with a guess far more often than they ask — but when they do ask, it is usually warranted. No method changes this much; choosing when to ask is a judgment behavior the answer format does not reach.',
    groups: [{ bars: comboBars('clar') }],
    legend: [
      { label: 'asked, as it should', color: '#2e7d32', detail: ['flagged a genuinely ambiguous question'] },
      { label: 'answered with a guess instead', color: '#c62828', detail: ['picked a reading without asking'] },
      { label: 'asked when a safe default existed', color: '#ffd54f', detail: ['over-asking — counted against precision'] },
    ],
  });
}

writeFileSync(
  'results/phase2-viz.html',
  renderPage({
    tabs: [
      { id: 'summary', label: 'Summary', sectionIds: ['winner', 'leaderboard-overall', 'leaderboard-category', 'slice-ALL'] },
      { id: 'categories', label: 'Per category (click bars to inspect answers)', sectionIds: sections.map((x) => x.id).filter((id) => !['slice-ALL', 'leaderboard-overall', 'leaderboard-category', 'answer-key', 'winner', 'task6-notime', 'task6-clar'].includes(id)) },
      { id: 'key', label: 'Answer key', sectionIds: ['answer-key'] },
      { id: 'task6', label: 'Knowing when not to answer', sectionIds: ['task6-notime', 'task6-clar'] },
    ],
    title: 'Graded: how accurately do models translate time expressions?',
    metaHtml: `Phase 2 of the experiment: every answer is now GRADED against a hand-verified answer key
(key ${d.keyVersion}, ${d.reps} repeats per question, two small AI models). Three ways of answering are
compared: <b>concrete dates</b> (the model does the calendar math itself), <b>concrete dates + cheat
sheet</b> (the prompt also lists pre-computed common periods like “last week”), and <b>a formal
expression</b> (the model describes the time; deterministic code computes the dates). A traditional
<b>rule-based parser</b> (chrono, no AI) runs as the baseline. Two small models carry the main
comparison (3 repeats each); two frontier-tier models run the identical questions once each as a
scale check — their single-repeat numbers are noisier. This file is self-contained — share it freely.`,
    hintHtml: `Each bar is one model answering one way; segments run best → worst, left to right. Three
readings of a bar: <b>dark green</b> alone = matched our spec exactly, unprompted. Dark green + <b>light
green</b> = correct under SOME defensible spec (light-green answers used a different convention we never
communicated — a deployment gap, not a model error). Adding <b>teal</b> = also identified the right time but
at the wrong precision, which boundary code can normalize away. Everything from yellow rightward is a real
miss.`,
    sections,
  }),
);
console.log('wrote results/phase2-viz.html');
