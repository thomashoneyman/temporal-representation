/**
 * Task-8 routing-discrimination visualization — `pnpm task8:viz` → results/task8-viz.html.
 * Can a free-form agent be PROMPTED to answer easy times in ISO and delegate only the
 * hard ones to the resolver? Shows the policy comparison, the prompt-iteration that got
 * routing working, and the per-item picture (which items actually need the resolver).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { renderPage, type Section } from './lib/viz.js';

interface Cond { id: string; isRoute: boolean; n: number; answerAccuracy: number; resolveRate: number; recallNeedsResolve: number | null; accuracyOnNeedsResolve: number | null; overResolveOnFine: number | null }
interface Item { id: string; query: string; labelHardness: string; isoAcc: number | null; resolveAcc: number | null; needsResolve: boolean; perCond: Record<string, { n: number; correct: number; delegated: number; sample: string }> }
const d = JSON.parse(readFileSync('results/task8.json', 'utf8')) as {
  model: string; reps: number; n: number;
  conditions: Cond[]; bookends: { isoAccuracy: number; resolveAccuracy: number }; needsResolveCount: number; isoFineCount: number; items: Item[];
};
const esc = (x: string) => x.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const pct = (x: number | null) => (x == null ? '—' : `${Math.round(x * 100)}%`);
const sections: Section[] = [];
// optional frontier (opus) comparison run
type Frontier = { model: string; bookends: { isoAccuracy: number; resolveAccuracy: number }; conditions: Cond[] };
let frontier: Frontier | null = null;
try { frontier = JSON.parse(readFileSync('results/task8-frontier.json', 'utf8')) as Frontier; } catch { /* none */ }

const LABEL: Record<string, string> = {
  iso: 'always ISO (model computes every date)',
  resolve: 'always resolve (every date via the IR tool)',
  'route-v1': 'route v1 — "prefer ISO, resolve the hard categories"',
  'route-v2': 'route v2 — explicit MUST-resolve triggers + ISO whitelist',
  'route-v3': 'route v3 — resolve by default, ISO only for explicit dates',
};
const COLOR: Record<string, string> = { iso: '#4e79a7', resolve: '#59a14f', 'route-v1': '#d8b4d8', 'route-v2': '#8e44ad', 'route-v3': '#b07aa1' };
const ORDER = ['iso', 'resolve', 'route-v1', 'route-v2', 'route-v3'];
const conds = ORDER.map((id) => d.conditions.find((c) => c.id === id)).filter(Boolean) as Cond[];
const bestRoute = [...conds.filter((c) => c.isRoute)].sort((a, b) => b.answerAccuracy - a.answerAccuracy)[0];

// §1 policy comparison — answer accuracy
{
  const rows = conds.map((c) => {
    const w = Math.round(c.answerAccuracy * 100);
    const best = bestRoute && c.id === bestRoute.id;
    return `<div class="row"><div class="pos" style="width:330px${best ? ';font-weight:700' : ''}">${esc(LABEL[c.id])}</div>
      <div class="bar" style="background:#f1f3f4"><div class="seg" style="width:${w}%;background:${COLOR[c.id]}"><span>${w}%</span></div></div>
      <div style="width:120px;text-align:right;color:#5f6368;font-size:.78rem">resolves ${Math.round(c.resolveRate * 100)}%</div></div>`;
  }).join('');
  sections.push({
    id: 'policies',
    title: 'A tuned routing prompt is the best policy — not just a latency win',
    subtitle: `Answer accuracy of ${d.model.split('/').pop()} on 30 single-window questions, same items under every policy (K=${d.reps}). The two bookends force one path; the route-* rows are routing PROMPTS we iterated. The original prompt (v1) under-routed; the tuned prompts (v2/v3) not only beat always-ISO but edge out always-resolve — because they keep trivially-explicit dates on ISO (resolving those slightly hurts) and hand the hard ones to the resolver. "resolves X%" is how often that policy called the resolver — the routing prompts reach top accuracy while resolving far less than always-on.`,
    groups: [], legend: [],
    customHtml: rows + `<div class="sub" style="margin-top:.5rem">n=30×${d.reps}; accuracy gaps among the top rows are within confidence intervals, so read this as "a tuned routing prompt matches or beats always-resolve at a lower resolve-rate," not a precise ranking. The point your prompt controls — that routing CAN be made to work — is the categorical result.</div>`,
  });
}

// §2 the iteration: how the prompt changed routing
{
  const head = `<tr><th style="text-align:left">routing prompt</th><th>accuracy</th><th>resolve-rate</th><th>recall on<br>needs-resolve</th><th>over-resolve<br>on ISO-fine</th></tr>`;
  const body = conds.filter((c) => c.isRoute).map((c) => {
    const best = c.id === bestRoute.id;
    return `<tr${best ? ' style="background:#f3e9f7;font-weight:600"' : ''}><td style="text-align:left">${esc(LABEL[c.id])}</td>
      <td>${pct(c.answerAccuracy)}</td><td>${pct(c.resolveRate)}</td><td>${pct(c.recallNeedsResolve)}</td><td>${pct(c.overResolveOnFine)}</td></tr>`;
  }).join('');
  sections.push({
    id: 'iteration',
    title: 'Iterating the prompt fixed the routing',
    subtitle: `The deliverable is a routing prompt, not a verdict that the model can't route. v1's "prefer ISO, only resolve hard cases" framing left the model over-confident — it delegated under half the cases that needed it (recall ${pct(conds.find((c) => c.id === 'route-v1')?.recallNeedsResolve ?? null)}). Making the resolve triggers explicit (v2) or flipping the default to resolve-unless-trivially-explicit (v3) lifted recall on the cases that actually need the resolver to ${pct(bestRoute.recallNeedsResolve)} and accuracy to ${pct(bestRoute.answerAccuracy)}. "Needs-resolve" here is empirical: the ${d.needsResolveCount} items where always-ISO failed AND always-resolve fixed it (not the original labels — many label-"hard" items the agent computes fine by hand, e.g. "Christmas").`,
    groups: [], legend: [],
    customHtml: `<table class="winner-table" style="font-size:.85rem"><thead>${head}</thead><tbody>${body}</tbody></table>
<div class="sub" style="margin-top:.4rem">recall = of the items that genuinely need the resolver, how many the prompt routed there; over-resolve = of the items ISO handles fine, how many it resolved anyway (a latency cost, not an error). v2 maximizes accuracy but resolves aggressively; v3 is the efficiency-balanced choice. The full prompt text is in <code>results/task8-readout.md</code>. <b>No cheating:</b> the prompts name hard <i>categories</i> (the research finding) but never an eval item — every example is held out from the test set, enforced by a contamination guard that throws if any eval query appears in a routing prompt. An earlier version that listed real test items verbatim inflated v1/v3 by 3–6 points; these are the cleaned numbers.</div>`,
  });
}

// §2b frontier comparison (opus), if present
if (frontier) {
  const fc = (id: string) => frontier!.conditions.find((c) => c.id === id);
  const ROWS = ['iso', 'resolve', 'route-v1', 'route-v2', 'route-v3'];
  const head = `<tr><th style="text-align:left">policy</th><th>${esc(d.model.split('/').pop()!)} (small, ×${d.reps})</th><th>${esc(frontier.model.split('/').pop()!)} (frontier, ×1)</th></tr>`;
  const body = ROWS.map((id) => {
    const a = conds.find((c) => c.id === id), b = fc(id);
    return `<tr><td style="text-align:left">${esc(LABEL[id])}</td><td style="text-align:center">${pct(a?.answerAccuracy ?? null)}</td><td style="text-align:center">${pct(b?.answerAccuracy ?? null)}</td></tr>`;
  }).join('');
  sections.push({
    id: 'frontier',
    title: 'Frontier comparison (Opus 4.8, single-repeat scale check)',
    subtitle: 'Answer accuracy by policy, small vs frontier. Two things hold at frontier: the base task is much easier (always-ISO 63%→77%) and the resolver still clearly earns its place (always-resolve beats always-ISO 93% vs 77%, +16pts). Do NOT read a per-tier prompt preference into the route rows ("v1 for frontier, v2 for small") — at one repeat over 30 items the variant intervals overlap (opus v1 29/30 = 97% [83–99] vs v2 24/30 = 80% [63–91]) and there is no mechanism for a more-explicit prompt to hurt a stronger model. Read this as "routing prompts all land high at frontier and the resolver still helps," not a re-ranking.',
    groups: [], legend: [],
    customHtml: `<table class="winner-table" style="font-size:.88rem"><thead>${head}</thead><tbody>${body}</tbody></table>
<div class="sub" style="margin-top:.4rem">Frontier ran K=1 as a scale check (the per-variant differences are within confidence intervals); the small-model numbers (K=3) carry the prompt-iteration conclusion.</div>`,
  });
}

// §3 per-item: which items actually need the resolver, and did the best prompt route them?
{
  const rid = bestRoute.id;
  const cell = (v: number | null, good: boolean | null) => `<td style="text-align:center;${good == null ? '' : good ? 'background:#e8f5e9' : 'background:#fdecea'}">${pct(v)}</td>`;
  const body = [...d.items].sort((a, b) => Number(b.needsResolve) - Number(a.needsResolve) || a.id.localeCompare(b.id)).map((it) => {
    const pc = it.perCond[rid];
    const routed = pc ? pc.delegated / pc.n : 0;
    const correct = pc ? pc.correct / pc.n : 0;
    // good routing: needs-resolve→routed; ISO-fine→not routed (but routing it is only a cost, so mark neutral-ish)
    const routeGood = it.needsResolve ? routed >= 0.5 : true;
    return `<tr>
      <td style="text-align:left">${esc(it.query)}</td>
      <td style="text-align:center">${it.needsResolve ? '⚠️ needs resolve' : it.isoAcc != null && it.isoAcc >= 0.5 ? 'ISO-fine' : 'hard for both'}</td>
      ${cell(it.isoAcc, null)}${cell(it.resolveAcc, null)}
      <td style="text-align:center;${routeGood ? '' : 'background:#fdecea'}">${Math.round(routed * 100)}% resolved</td>
      ${cell(correct, correct >= 0.99 ? true : correct <= 0.01 ? false : null)}</tr>`;
  }).join('');
  sections.push({
    id: 'items',
    title: `Per item: which actually need the resolver, and did the tuned prompt (${rid}) route them?`,
    subtitle: 'Hardness here is empirical from this run: "needs resolve" = always-ISO failed and always-resolve fixed it. Note the columns reconcile the earlier confusion — items like "Christmas" show high ISO accuracy (the model nails them by hand), so they are ISO-fine and self-computing them is correct, not a routing failure. The only items that truly need the resolver are the handful where ISO genuinely fails.',
    groups: [], legend: [],
    customHtml: `<table class="winner-table" style="font-size:.8rem"><thead><tr><th style="text-align:left">question</th><th>class</th><th>ISO acc</th><th>resolve acc</th><th>${esc(rid)} routed</th><th>${esc(rid)} correct</th></tr></thead><tbody>${body}</tbody></table>
<div class="sub" style="margin-top:.4rem">Drop-in eval: <code>artifacts/routing-eval.json</code> (cases, anchors, expected windows). Re-derive a model's own needs-resolve set by running the iso/resolve bookends — see <code>results/task8-readout.md</code>.</div>`,
  });
}

writeFileSync(
  'results/task8-viz.html',
  renderPage({
    title: 'Can the agent be prompted to route its own time questions? (yes)',
    metaHtml: `A free-form agent should answer easy times directly in ISO (fast, cheap) and reach for the
resolve(IR) tool only on the hard cases. That requires a routing prompt the model actually follows. We
gave ${d.model.split('/').pop()} 30 single-window questions with both a query tool and a resolve tool, and
iterated the routing instruction against two bookends (force-ISO, force-resolve). ${d.reps} repeats each.
This file is self-contained — share it freely.`,
    hintHtml: 'The deliverable is the tuned routing prompt (reproduced in the readout); the bookends bound what routing could achieve.',
    sections,
  }),
);
console.log('wrote results/task8-viz.html');
