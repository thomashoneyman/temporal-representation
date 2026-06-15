/**
 * `npm run analyze` (third step) — results/summary-viz.html: the experiment's leaderboard,
 * rendered from results/summary.json only (the same interchange any other explorer would
 * read). Self-contained and shareable, like every other results page in this repo.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { renderPage, type Section } from '../harness/lib/viz.js';
import { winnerTable } from '../harness/lib/winner-table.js';

interface Cell { task: string; model: string; arm: string; slice: string; metric: string; value: number; n: number; ci?: { lo: number; hi: number } }
const task8 = existsSync('results/task8.json')
  ? (JSON.parse(readFileSync('results/task8.json', 'utf8')) as {
      model: string;
      bookends: { isoAccuracy: number; resolveAccuracy: number };
      conditions: Array<{ id: string; isRoute: boolean; answerAccuracy: number; resolveRate: number; recallNeedsResolve: number | null }>;
    })
  : null;
const s = JSON.parse(readFileSync('results/summary.json', 'utf8')) as {
  keyVersion: string;
  cells: Cell[];
  determinism: Record<string, { unprompted?: number; prompted?: number }>;
  cost: Record<string, { per100Questions: number }>;
  decisionTable: Array<{ technique: string; adoptWhen: string; verdict: string; evidence: string }>;
  toolContract: Array<{ contract: string; shape: string; role: string; perModel: Record<string, number | null>; verdict: string }>;
};

const MODEL_NAME: Record<string, string> = {
  'anthropic/claude-haiku-4-5': 'claude-haiku-4-5 (small)',
  'openai/gpt-5.4-mini': 'gpt-5.4-mini (small)',
  'anthropic/claude-opus-4-8': 'claude-opus-4-8 (frontier)',
  'openai/gpt-5.5': 'gpt-5.5 (frontier)',
};
const MODELS = Object.keys(MODEL_NAME);
const ARM_LABEL: Record<string, string> = { iso: 'concrete dates', 'iso-preset': 'dates + cheat sheet', ir: 'formal expression' };
const ARM_COLOR: Record<string, string> = { iso: '#4e79a7', 'iso-preset': '#f28e2b', ir: '#59a14f' };
const get = (task: string, model: string, arm: string, slice: string, metric: string): Cell | undefined =>
  s.cells.find((c) => c.task === task && c.model === model && c.arm === arm && c.slice === slice && c.metric === metric);

const sections: Section[] = [];
const escA = (x: string): string => x.replace(/&/g, '&amp;').replace(/</g, '&lt;');

// ── the short answer: the cross-task verdict + the one-line winner per task ──
{
  const winnerRow = (task: string, slice: string, metric: string, arms: string[], labels: Record<string, string>): string => {
    const per = MODELS.map((m) => {
      const cands = arms.map((a) => ({ a, c: get(task, m, a, slice, metric) })).filter((x) => x.c);
      const best = cands.sort((x, y) => y.c!.value - x.c!.value)[0];
      return best ? `${MODEL_NAME[m].split(' ')[0]}: <b>${labels[best.a]}</b> ${Math.round(best.c!.value * 100)}%` : '';
    }).filter(Boolean);
    return per.join(' · ');
  };
  const t4 = winnerRow('task4', 'ALL', 'exact', ['iso', 'iso-preset', 'ir'], { iso: 'ISO', 'iso-preset': 'crib', ir: 'IR' });
  sections.push({
    id: 'answer',
    title: 'The short answer: classify the time, let code resolve it',
    subtitle: 'Across every task family — translating one expression, threading a multi-step conversation, decomposing a compound query — the highest-accuracy method for all four models is to have the model emit a small formal expression and let deterministic code compute the dates, never to have the model compute the dates itself. The win is largest on the hard categories (named periods, company-specific periods, ranges/sets, business-day math) and for the weaker models; on easy traffic (specific dates, plain day arithmetic at frontier) direct ISO ties it.',
    groups: [], legend: [],
    customHtml: `<div class="answer-box" style="border-left:4px solid #59a14f;padding:.6rem 1rem;background:#f6faf6;border-radius:6px">
<div style="font-size:1.05rem;font-weight:600;margin-bottom:.3rem">Best method per model — translation (139 questions):</div>
<div style="color:#3c4043">${t4}</div>
<div style="margin-top:.6rem;color:#5f6368;font-size:.85rem">“IR” = the model describes the time in the ScateLite expression language; code resolves it. It wins or ties for every model and never loses overall. The same ordering holds in the multi-step and compound-query tables below.</div>
</div>`,
  });
}

// ── the proposed architecture ──
{
  const pipeline = `USER QUESTION + anchor ("now")
   │
   ▼  one LLM call, structured output
[1] CLASSIFY → { kind: time|none, expr: <ScateLite>, ambiguity 1–5 }
   │              (no dates computed by the model)
   ├─ none ───────────► run with no time filter
   ├─ ambiguity ≥ 4 ──► ask the user (offer the default reading)
   ▼  deterministic code, no LLM
[2] RESOLVE  expr + conventions + org periods → concrete ISO interval(s)
   ▼
[3] VALIDATE model-free guardrail (end<start, zero-length, DST offset, window)
   ▼
[4] EXECUTE  tools receive plain ISO — downstream never sees the IR`;
  const agent = `MAIN AGENT  (system prompt: anchor + grain rule + conventions + hard-case list)
   │
   ├─ easy/known dates ──► domain tools take plain ISO {start,end}
   │                       (validated at the boundary by the guardrail)
   │
   └─ hard case ─────────► resolve_range(expr) → ISO ──► domain tool(ISO)
        hard = business-day/holiday math · org periods · ranges/sets ·
               anything anchored to an earlier milestone · DST crossings
   contract rule: the expression argument is REQUIRED, on its own tool —
   never an optional ISO-or-IR field (GPT-family models break on that).`;
  sections.push({
    id: 'architecture',
    title: 'The proposed architecture',
    subtitle: 'Two shapes, one principle: the model classifies, code computes, and ISO is the wire format between steps. Use the pipeline when time resolution can be an explicit step; use the agent shape when time is woven through free-form turns.',
    groups: [], legend: [],
    customHtml: `<div style="display:flex;gap:1.5rem;flex-wrap:wrap">
<div style="flex:1;min-width:340px"><div class="model">A · Pipeline (data workflow): always resolve</div>
<pre style="background:#f8f9fa;border-radius:8px;padding:.8rem;font-size:.74rem;overflow-x:auto;line-height:1.35">${escA(pipeline)}</pre></div>
<div style="flex:1;min-width:340px"><div class="model">B · Free-form agent: ISO by default, resolve the hard cases</div>
<pre style="background:#f8f9fa;border-radius:8px;padding:.8rem;font-size:.74rem;overflow-x:auto;line-height:1.35">${escA(agent)}</pre></div>
</div>
<div class="sub" style="margin-top:.5rem">In the pipeline you take the choice away and resolve every time — that reaches the accuracy ceiling. In the agent, letting the model emit ISO for easy steps is fine and saves a tool round trip (correct ISO is never penalized); just keep any expression channel a required, separate tool. Skip a standalone arithmetic tool — models barely use it and it never helped. The model-free guardrail runs on every tool call for the failures code can catch without knowing intent; it cannot catch a wrong-but-plausible window, which is exactly why the resolver — not after-the-fact checking — is the real fix.</div>`,
  });
}

// ── what should a tool accept for time? the contract verdict ──
{
  const ROLE = { floor: { bg: '', tag: 'baseline', col: '#5f6368' }, avoid: { bg: '#fdecea', tag: 'AVOID', col: '#c62828' }, ok: { bg: '#fff8e1', tag: 'ok', col: '#a07a00' }, ceiling: { bg: '#e8f5e9', tag: 'RECOMMENDED', col: '#1b5e20' } } as Record<string, { bg: string; tag: string; col: string }>;
  const cols = ['anthropic/claude-haiku-4-5', 'openai/gpt-5.4-mini', 'anthropic/claude-opus-4-8', 'openai/gpt-5.5'];
  const head = cols.map((m) => `<th>${MODEL_NAME[m].split(' ')[0]}</th>`).join('');
  const body = s.toolContract.map((r) => {
    const role = ROLE[r.role] ?? ROLE.floor;
    const cells = cols.map((m) => {
      const v = r.perModel[m];
      return `<td>${v == null ? '—' : Math.round(v * 100) + '%'}</td>`;
    }).join('');
    return `<tr style="background:${role.bg}">
      <td style="text-align:left"><span style="color:${role.col};font-weight:700;font-size:.7rem">${role.tag}</span><br><b>${escA(r.contract)}</b><br><span style="color:#9aa0a6;font-weight:400;font-size:.75rem">${escA(r.shape)}</span></td>
      ${cells}
      <td style="text-align:left;font-size:.78rem;color:#3c4043;max-width:340px">${escA(r.verdict)}</td></tr>`;
  }).join('\n');
  sections.push({
    id: 'tool-contract',
    title: 'What should a tool accept for time?',
    subtitle: 'Three realistic ways a tool can take a time argument, with multi-step threading accuracy per model (exact-correct hops). The query argument is ISO in every design — the question is only how the IR enters and whether the model uses it. Verdict: IR enters at a dedicated resolve boundary that emits ISO (the recommendation); a single polymorphic ISO-or-IR field is the one design to avoid.',
    groups: [], legend: [],
    customHtml: `<table class="winner-table" style="font-size:.85rem"><thead><tr><th style="min-width:230px">contract</th>${head}<th style="text-align:left">verdict</th></tr></thead><tbody>${body}</tbody></table>
<div class="sub" style="margin-top:.4rem"><b>What actually separates these is routing rate, not topology.</b> Every design leaves the model free to write ISO directly — even the dedicated resolve tool, whose query argument is ISO. What differs is the default instruction: "resolve by default" drives 93–100% routing (and that is what reaches 90–100% accuracy, because self-computed hops are the misses), while "use the expression for hard cases" leaves models under-routing (gpt-mini as low as 1%), collapsing to plain-ISO accuracy. Accuracy gaps among the rows sit within their confidence intervals; the load-bearing fact is the routing rate the instruction produces. A fourth, non-production variant — “twin tools” (an ISO query tool beside an IR query tool) — was run only to isolate the required-vs-optional-argument effect; you would not ship doubled tools per operation, so it lives in the deep-dive (<code>task7-viz.html</code>), along with the full nine-variant “well-formed vs degenerate expression” law.</div>`,
  });
}


// ── Phase 1 (ungraded): what models prefer, before any answer key ──
{
  sections.push({
    id: 'preferences',
    title: 'Before grading: what models actually prefer (the conventions come from here)',
    subtitle: 'Phase 1 measured what each model reaches for, ungraded — 29 everyday phrases resolved against 7 different anchor dates — so our answer key would encode the models\' own dominant readings rather than a house style. This is why "exact" in every table below is a fair bar.',
    groups: [], legend: [],
    customHtml: `<div style="display:flex;gap:1.5rem;flex-wrap:wrap;font-size:.9rem">
<div style="flex:1;min-width:280px">
<div class="model">Strong consensus (became our locked conventions)</div>
<ul style="margin:.3rem 0;padding-left:1.1rem;color:#3c4043">
<li>“last week” = the previous <b>Monday–Sunday</b> calendar week (not Sun-start, not last 7 days)</li>
<li>“a month ago” = the <b>same day-of-month</b> last month (day-pinning), not exactly 30 days</li>
<li>periods are <b>calendar-aligned</b> (calendar months/quarters), not rolling N-day windows</li>
<li>bare “March 4” = its <b>nearest</b> occurrence relative to now</li>
</ul></div>
<div style="flex:1;min-width:280px">
<div class="model">Genuine divergence (→ steering targets &amp; the ambiguous slice)</div>
<ul style="margin:.3rem 0;padding-left:1.1rem;color:#3c4043">
<li>“the last few months”, “recently”, “mid-March” — no shared reading across models or anchors</li>
<li>these drove Task 5 (can a prompt pin them?) and Task 6 (does the model ask?)</li>
</ul></div></div>
<div class="sub" style="margin-top:.4rem">Full per-phrase distributions across all 7 anchors are in <code>preferences-viz.html</code>. Takeaway for the architecture: the conventions a resolver should encode are not arbitrary — they are the readings the models themselves converge on, so encoding them in code (where they can be pinned) loses nothing the model wanted.</div>`,
  });
}

// per-task evidence: the IR-vs-ISO comparison behind the verdict above
const TASKS: Array<{ id: string; title: string; sub: string; slice: string; metrics: Array<{ key: string; label: string }>; arms: string[] }> = [
  {
    id: 'task4', title: 'Translation: turn a phrase into concrete dates', slice: 'ALL',
    sub: '139 questions across 8 categories. Strict = matched the answer key exactly; the second metric also counts documented reasonable readings.',
    metrics: [{ key: 'exact', label: '<b>strict</b>' }, { key: 'withinAcceptable', label: '<b>strict + reasonable</b>' }],
    arms: ['iso', 'iso-preset', 'ir'],
  },
  {
    id: 'task7', title: 'Multi-step conversations: keep time references straight', slice: 'chains',
    sub: '10 scripted investigations, 46 steps; each step must query the right time range.',
    metrics: [{ key: 'hop-exact', label: '<b>strict</b>' }, { key: 'hop-withinAcceptable', label: '<b>strict + reasonable</b>' }],
    arms: ['iso', 'iso-tool', 'ir', 'hybrid'],
  },
  {
    id: 'task7b', title: 'Compound queries: one call per window', slice: 'compound',
    sub: '17 compound questions against a one-range-per-call tool; exact set of calls.',
    metrics: [{ key: 'exact-set', label: '<b>strict</b>' }, { key: 'mean-f1', label: '<b>partial credit (F1)</b>' }],
    arms: ['iso', 'iso-tool', 'ir'],
  },
];
const ARM_LABEL_T7: Record<string, string> = { iso: 'computes itself', 'iso-tool': '+ arithmetic tool', ir: 'formal expression', hybrid: 'either, per call' };
for (const t of TASKS) {
  const labels = t.id === 'task4' ? ARM_LABEL : ARM_LABEL_T7;
  const wt = winnerTable({
    columns: t.arms.map((arm) => ({ key: arm, label: labels[arm], color: ARM_COLOR[arm] ?? '#b07aa1' })),
    rows: MODELS.map((model) => ({
      label: MODEL_NAME[model],
      cells: Object.fromEntries(
        t.arms.map((arm) => {
          const entries = t.metrics.map((m) => [m.key, (get(t.id, model, arm, t.slice, m.key)?.value ?? NaN) * 100] as const);
          return entries.some(([, x]) => Number.isNaN(x)) ? [arm, undefined] : [arm, Object.fromEntries(entries)];
        }),
      ),
    })),
    metrics: t.metrics.map((m) => ({ key: m.key, label: m.label })),
    caption: '',
  });
  sections.push({ id: t.id, title: t.title, subtitle: t.sub, groups: [], legend: [], customHtml: wt });
}

// ── can the agent route its own time questions? (Task 8) ──
if (task8) {
  const cond = (id: string) => task8.conditions.find((c) => c.id === id);
  const iso = cond('iso'), resolve = cond('resolve'), v1 = cond('route-v1');
  const bestRoute = task8.conditions.filter((c) => c.isRoute).sort((a, b) => b.answerAccuracy - a.answerAccuracy)[0];
  const bar = (label: string, v: number, color: string, note = '') =>
    `<div class="row"><div class="pos" style="width:320px">${label}</div><div class="bar" style="background:#f1f3f4"><div class="seg" style="width:${Math.round(v * 100)}%;background:${color}"><span>${Math.round(v * 100)}%</span></div></div><div style="width:120px;text-align:right;color:#5f6368;font-size:.78rem">${note}</div></div>`;
  sections.push({
    id: 'routing-eval',
    title: 'Can the agent be prompted to route its own time questions? (yes, with the right prompt)',
    subtitle: `For a free-form agent you want it to answer easy times in ISO and delegate only the hard ones. Tested on ${task8.model.split('/').pop()} over 30 items under three policies plus iterated routing prompts. The original light prompt under-routed (route-v1, ${Math.round((v1?.recallNeedsResolve ?? 0) * 100)}% recall on items that need the resolver); a tuned, category-based prompt (no test items named — held-out examples, contamination-guarded) lifts recall to ${Math.round((bestRoute.recallNeedsResolve ?? 0) * 100)}% and answer accuracy to ${Math.round(bestRoute.answerAccuracy * 100)}%, matching or edging always-resolve while resolving fewer cases.`,
    groups: [], legend: [],
    customHtml: `${iso ? bar('always ISO (compute every date)', iso.answerAccuracy, '#4e79a7', `resolves 0%`) : ''}
${v1 ? bar('routing prompt v1 (light "prefer ISO")', v1.answerAccuracy, '#d8b4d8', `resolves ${Math.round(v1.resolveRate * 100)}%`) : ''}
${bar('routing prompt — tuned (' + bestRoute.id + ')', bestRoute.answerAccuracy, '#8e44ad', `resolves ${Math.round(bestRoute.resolveRate * 100)}%`)}
${resolve ? bar('always resolve (every date via IR)', resolve.answerAccuracy, '#59a14f', `resolves 99%`) : ''}
<div class="sub" style="margin-top:.4rem">Answer accuracy, same 30 items (n=30×3; gaps among the top rows are within confidence intervals). Takeaway for the architecture: the model CAN be prompted to delegate the hard categories — but the tuned prompt reaches top accuracy by resolving aggressively, so truly light-touch "ISO-mostly" routing still leaves accuracy on the table. Full prompt text and per-item detail in <code>task8-viz.html</code>.</div>`,
  });
}

// determinism + cost reference tables
{
  const esc = (x: string) => x.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const detRows = Object.entries(s.determinism)
    .map(([k, v]) => {
      const [model, arm] = k.split('|');
      return `<tr><td style="text-align:left">${esc(MODEL_NAME[model] ?? model)} — ${esc(ARM_LABEL[arm] ?? arm)}</td>
        <td>${v.unprompted !== undefined ? Math.round(v.unprompted * 100) + '%' : '—'}</td>
        <td>${v.prompted !== undefined ? Math.round(v.prompted * 100) + '%' : '—'}</td></tr>`;
    })
    .join('');
  const costRows = Object.entries(s.cost)
    .map(([k, v]) => {
      const [model, arm] = k.split('|');
      return `<tr><td style="text-align:left">${esc(MODEL_NAME[model] ?? model)} — ${esc(ARM_LABEL[arm] ?? arm)}</td><td>$${v.per100Questions.toFixed(2)}</td></tr>`;
    })
    .join('');
  sections.push({
    id: 'det-cost',
    title: 'Determinism and cost',
    subtitle: 'Determinism: same question, same prompt, 3 repeats — how often were all three answers identical? (Small models only; frontier ran once.) “Prompted” adds our written conventions to the prompt. Cost: recorded token usage × list pricing, per 100 questions answered.',
    groups: [], legend: [],
    customHtml: `<div style="display:flex;gap:3rem;flex-wrap:wrap">
<table class="winner-table"><thead><tr><th></th><th>unprompted</th><th>with conventions</th></tr></thead><tbody>${detRows}</tbody></table>
<table class="winner-table"><thead><tr><th></th><th>$ / 100 questions</th></tr></thead><tbody>${costRows}</tbody></table></div>
<div class="sub" style="margin-top:.5rem"><b>Latency</b> was a stated dependent variable but is <b>not separately measured</b> here (the harness recorded only cell-elapsed time, not clean per-output latency). The shape of the cost trade is structural and known regardless: the pipeline adds nothing to the model's turn count (one structured-output call either way), while in the agent shape resolving a hard case adds one tool round trip — the latency you spend to remove the hard-category errors. IR adds ~1.2k input tokens (the grammar) per call, the ~1.4–1.8× cost multiple above; at these absolute prices the accuracy gain dominates for small models, while the preset crib is the cheap middle when IR's frontier margin is small.</div>`,
  });
}

// the decision table
{
  const esc = (x: string) => x.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const rows = s.decisionTable
    .map((r) => `<tr><td style="text-align:left;font-weight:600;min-width:130px">${esc(r.technique)}</td>
      <td style="text-align:left;color:#5f6368">${esc(r.adoptWhen)}</td>
      <td style="text-align:left;font-weight:700;min-width:140px">${esc(r.verdict)}</td>
      <td style="text-align:left">${esc(r.evidence)}</td></tr>`)
    .join('');
  sections.push({
    id: 'decision',
    title: 'The production decision table',
    subtitle: 'The experiment exists to fill this in: for each candidate technique, should an agent system adopt it, and what evidence decided it?',
    groups: [], legend: [],
    customHtml: `<table class="winner-table" style="font-size:.85rem"><thead><tr><th>technique</th><th>adopt when…</th><th>verdict</th><th>evidence</th></tr></thead><tbody>${rows}</tbody></table>`,
  });
}

writeFileSync(
  'results/summary-viz.html',
  renderPage({
    title: 'Leaderboard: how should agents handle time?',
    metaHtml: `The whole experiment on one page, rendered from <code>results/summary.json</code> (answer key ${s.keyVersion}).
Three ways for a model to handle a user's time expression — compute concrete dates itself, the same plus a
cheat sheet of precomputed periods, or describe the time in a small formal language that deterministic code
resolves — measured across translation, multi-step conversations, and compound queries, on two small and two
frontier models. Deep-dives with click-to-inspect answers: <code>phase2-viz.html</code>, <code>task7-viz.html</code>,
<code>task7b-viz.html</code>, <code>task8-viz.html</code>, <code>preferences-viz.html</code>. This file is self-contained — share it freely.
<br><span style="color:#9aa0a6;font-size:.85rem">Scope: the design named one frontier model per provider (incl. Gemini-3.5-flash); Google was skipped (no API key), and we instead ran a two-tier read on Anthropic + OpenAI (a small and a frontier model each) — four models rather than three, minus Google. Frontier models ran 1 repeat (a scale check); small models ran 3.</span>`,
    hintHtml: `Green cell = that model's best method. Toggles re-score the table they belong to.`,
    sections,
  }),
);
console.log('wrote results/summary-viz.html');
