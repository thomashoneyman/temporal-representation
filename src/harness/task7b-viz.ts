/**
 * Task-7b decomposition visualization — `npm run task7b:viz` → results/task7b-viz.html.
 * The story: a compound request meets a tool that takes one contiguous range per call —
 * who should enumerate the windows, the model or code? Finding-oriented sections with
 * click-to-inspect tables showing the actual calls each model made.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { ALL_CASES, anchorIso } from '../datasets/cases/index.js';
import { mergeAdjacent } from '../scoring/decomposition.js';
import { expectedResolved } from '../scoring/translation.js';
import { humanInterval, renderPage, type Section } from './lib/viz.js';
import { winnerTable } from './lib/winner-table.js';
import { DateTime } from 'luxon';

interface DecompRow {
  itemId: string; slice: string; query: string; arm: string; provider: string; model: string; rep: number;
  calls: Array<{ start: string; end: string }>;
  usedHelper: boolean;
  score: { exact: boolean; f1: number; precision: number; recall: number; callCount: number; expectedCount: number; failures: string[] };
}

const d = JSON.parse(readFileSync('results/task7b.json', 'utf8')) as { reps: number; rows: DecompRow[] };
const rows = d.rows;

const ARM_NAME: Record<string, string> = {
  iso: 'model computes & enumerates itself',
  'iso-tool': 'model has a date-arithmetic tool',
  ir: 'model describes the request; code enumerates',
};
const ARM_COLOR: Record<string, string> = { iso: '#4e79a7', 'iso-tool': '#f28e2b', ir: '#59a14f' };
const MODEL_SHORT: Record<string, string> = {
  'anthropic/claude-haiku-4-5': 'haiku',
  'openai/gpt-5.4-mini': 'gpt-mini',
  'anthropic/claude-opus-4-8': 'opus (frontier)',
  'openai/gpt-5.5': 'gpt-5.5 (frontier)',
};
const arms = ['iso', 'iso-tool', 'ir'];
const MODEL_ORDER = ['anthropic/claude-haiku-4-5', 'openai/gpt-5.4-mini', 'anthropic/claude-opus-4-8', 'openai/gpt-5.5']
  .filter((m) => rows.some((r) => r.model === m));

const itemInfo = new Map(
  ALL_CASES.filter((c) => rows.some((r) => r.itemId === c.id)).map((c) => {
    const expected = mergeAdjacent(expectedResolved(c)!.intervals);
    return [c.id, {
      query: c.query,
      asked: DateTime.fromISO(anchorIso(c.anchor), { zone: 'America/New_York' }).toFormat('ccc, MMM d yyyy HH:mm'),
      expected,
      expectedText: expected.map((iv) => humanInterval(iv.start, iv.end)).join('  ·  '),
    }];
  }),
);

const FAIL_LABEL: Record<string, string> = {
  'collapsed-to-bounding-range': 'one call spanning everything (extra time swept in)',
  'missing-windows': 'fewer calls than windows (some windows skipped)',
  'extra-windows': 'more calls than windows',
  'wrong-day-or-time-window': 'right number of calls, wrong windows',
  'wrong-count': 'wrong number of calls',
};

function detailRows(rs: DecompRow[]): Array<{ q: string; asked: string; actual: string; expected: string; note?: string; n?: number }> {
  const grouped = new Map<string, { q: string; asked: string; actual: string; expected: string; note: string; n: number }>();
  for (const r of rs) {
    if (r.score.exact) continue;
    const info = itemInfo.get(r.itemId)!;
    const actual = r.calls.length
      ? mergeAdjacent(r.calls).map((iv) => humanInterval(iv.start, iv.end)).join('  ·  ')
      : '(no queries made)';
    const k = `${r.itemId}:${r.model}:${actual}`;
    const e = grouped.get(k);
    if (e) e.n++;
    else grouped.set(k, {
      q: info.query,
      asked: info.asked,
      actual: `${MODEL_SHORT[r.model] ?? r.model} called: ${actual}`,
      expected: info.expectedText,
      note: r.score.failures.map((f) => FAIL_LABEL[f] ?? f).join('; '),
      n: 1,
    });
  }
  return [...grouped.values()].sort((a, b) => b.n - a.n).slice(0, 20);
}

const exactRate = (rs: DecompRow[]) => rs.filter((r) => r.score.exact).length / Math.max(rs.length, 1);
const meanF1 = (rs: DecompRow[]) => rs.reduce((acc, r) => acc + r.score.f1, 0) / Math.max(rs.length, 1);

const sections: Section[] = [];

// §0 winner table
{
  const wt = winnerTable({
    columns: arms.map((arm) => ({ key: arm, label: ARM_NAME[arm], color: ARM_COLOR[arm] })),
    rows: MODEL_ORDER.map((model) => ({
      label: MODEL_SHORT[model] ?? model,
      cells: Object.fromEntries(
        arms.map((arm) => {
          const sub = rows.filter((r) => r.model === model && r.arm === arm);
          if (!sub.length) return [arm, undefined];
          return [arm, { exact: exactRate(sub) * 100, within: meanF1(sub) * 100 }];
        }),
      ),
    })),
    metrics: [
      { key: 'exact', label: '<b>strict</b> — the set of calls matched the expected windows exactly' },
      { key: 'within', label: '<b>partial credit</b> — mean overlap between calls made and windows expected (F1)' },
    ],
    caption: `Green cell = that model's best method under the selected metric. Small-model cells are
51 attempts (17 compound questions × 3 repeats); frontier cells are 17 (1 repeat — one question ≈ 6
points). Adjacent windows count as one: covering “weekdays” with one Mon→Sat call is correct, not a
shortcut.`,
  });
  sections.push({
    id: 'winner',
    title: 'The short answer: offloading enumeration to code helps — most for the weaker model',
    subtitle: 'A compound request (“Tue–Thu 8am–12pm over the past month”) must become one query call per separate window. Who enumerates the windows?',
    groups: [], legend: [],
    customHtml: wt,
  });
}

// §1 headline bars with click-through
{
  const bars = [];
  for (const arm of arms) {
    for (const model of MODEL_ORDER) {
      const sub = rows.filter((r) => r.model === model && r.arm === arm);
      if (!sub.length) continue;
      const good = sub.filter((r) => r.score.exact).length;
      bars.push({
        rowLabel: `${ARM_NAME[arm]} — ${MODEL_SHORT[model] ?? model}`,
        segments: [
          { label: 'exact set of calls', n: good, total: sub.length, color: ARM_COLOR[arm], detail: [`${good}/${sub.length} attempts produced exactly the right windows`] },
          { label: 'wrong set', n: sub.length - good, total: sub.length, color: '#e8eaed', detail: ['click for the actual calls made vs the windows expected'], rows: detailRows(sub) },
        ].filter((s) => s.n > 0),
      });
    }
  }
  sections.push({
    id: 'headline',
    title: 'Exactly the right calls, by model and method',
    subtitle: 'Click any gray segment to see what the model actually called versus the windows the question needed — judge the misses yourself.',
    groups: [{ bars }],
    legend: arms.map((a) => ({ label: ARM_NAME[a], color: ARM_COLOR[a], detail: [ARM_NAME[a]] })),
  });
}

// §2 failure taxonomy
{
  const FAILS = Object.keys(FAIL_LABEL);
  const COLORS: Record<string, string> = {
    'collapsed-to-bounding-range': '#c62828',
    'missing-windows': '#ef6c00',
    'extra-windows': '#ffd54f',
    'wrong-day-or-time-window': '#8c6bb1',
    'wrong-count': '#9aa0a6',
  };
  const bars = [];
  for (const arm of arms) {
    const errs = rows.filter((r) => r.arm === arm && !r.score.exact);
    bars.push({
      rowLabel: `${ARM_NAME[arm]} — ${errs.length} misses total`,
      segments: FAILS.map((f) => {
        const sub = errs.filter((r) => r.score.failures.includes(f));
        return { label: FAIL_LABEL[f], n: sub.length, total: Math.max(errs.length, 1), color: COLORS[f], detail: [FAIL_LABEL[f], 'click for examples'], rows: detailRows(sub) };
      }).filter((s) => s.n > 0),
    });
  }
  sections.push({
    id: 'failures',
    title: 'When the calls were wrong, HOW were they wrong?',
    subtitle: 'Misses only, all models pooled; a miss can carry more than one tag, so shares can sum past 100%. The feared failure — collapsing many windows into one big range that sweeps in time nobody asked for — is what the range-only tool contract is designed to catch.',
    groups: [{ bars }],
    legend: FAILS.map((f) => ({ label: FAIL_LABEL[f], color: COLORS[f], detail: [f] })),
  });
}

// §3 hardest items
{
  const byItem = new Map<string, DecompRow[]>();
  for (const r of rows) byItem.set(r.itemId, [...(byItem.get(r.itemId) ?? []), r]);
  const worst = [...byItem.entries()]
    .map(([id, rs]) => ({ id, rs, acc: exactRate(rs) }))
    .sort((a, b) => a.acc - b.acc)
    .slice(0, 8);
  sections.push({
    id: 'worst',
    title: 'The hardest compound questions',
    subtitle: 'All attempts pooled (all models × all methods). Click red for the actual call sets.',
    groups: [{
      bars: worst.map(({ id, rs }) => {
        const info = itemInfo.get(id)!;
        const good = rs.filter((r) => r.score.exact).length;
        return {
          rowLabel: `“${info.query}” (${info.expected.length} windows)`,
          segments: [
            { label: 'exact set of calls', n: good, total: rs.length, color: '#59a14f', detail: [`needs: ${info.expectedText}`] },
            { label: 'wrong set', n: rs.length - good, total: rs.length, color: '#c62828', detail: [`needs: ${info.expectedText}`, 'click for the wrong call sets'], rows: detailRows(rs) },
          ].filter((s) => s.n > 0),
        };
      }),
    }],
    legend: [
      { label: 'exact set of calls', color: '#59a14f', detail: ['covered precisely the asked windows'] },
      { label: 'wrong set', color: '#c62828', detail: ['missed, extra, or misplaced windows'] },
    ],
  });
}

// §4 reference: every question and its expected windows
{
  const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const blocks = [...itemInfo.entries()].map(([id, info]) =>
    `<tr><td>${esc(info.query)}</td><td style="white-space:nowrap">${info.asked}</td><td>${info.expectedText}</td></tr>`).join('\n');
  sections.push({
    id: 'reference',
    title: 'Appendix: every compound question and its expected windows',
    subtitle: 'The windows are the deterministic resolver\'s expansion of each request (adjacent windows merged — one contiguous range is one window). This is the answer key the calls above are scored against.',
    groups: [], legend: [],
    customHtml: `<div class="detail-table" style="margin-left:0"><table>
<thead><tr><th>question</th><th>asked on</th><th>expected query windows</th></tr></thead><tbody>${blocks}</tbody></table></div>`,
  });
}

writeFileSync(
  'results/task7b-viz.html',
  renderPage({
    title: 'Compound requests vs a one-range-at-a-time tool: who should enumerate?',
    metaHtml: `A real query tool often accepts ONE contiguous time range per call. A request like
“utilization over the past month, Tue–Thu, 8am–12pm” therefore needs one call per matching window.
We gave ${itemInfo.size} such compound questions to each model three ways: it <b>computes and enumerates
every window itself</b>, it has a <b>deterministic date-arithmetic tool</b> to lean on, or it <b>describes
the request in a formal language</b> and a resolver returns the concrete window list for it to query.
${rows.length} graded attempts. This file is self-contained — share it freely.`,
    hintHtml: `Gray and red segments are clickable — they open the actual calls the model made next to the windows the question needed.`,
    sections,
  }),
);
console.log('wrote results/task7b-viz.html');
