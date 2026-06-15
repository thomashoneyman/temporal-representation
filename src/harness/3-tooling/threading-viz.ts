/**
 * Task-7 threading visualization — `npm run threading:viz` → results/3-tooling/threading-viz.html.
 * One section per FINDING (not per data dimension), pooled across models where pooling
 * sharpens the story, with click-to-inspect detail tables on every interesting bar.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { CHAINS } from '../../datasets/cases/09-chains.js';
import { chainKeys } from '../../datasets/cases/lib/chain-keys.js';
import { humanInterval, renderPage, type Section } from '../lib/viz.js';
import { winnerTable } from '../lib/winner-table.js';

interface HopRow {
  chainId: string; arm: string; provider: string; model: string; rep: number;
  hop: number; depth: number; bindsTo: string;
  args: { start: string; end: string } | null;
  usedHelper: boolean;
  hybridMode?: 'iso' | 'expr';
  score: { correct: boolean; errorClass?: string; boundTo?: string };
}

// Re-scored rows from threading.json — this page cannot disagree with the numbers.
const rows: HopRow[] = (JSON.parse(readFileSync('results/3-tooling/threading.json', 'utf8')) as { rows: HopRow[] }).rows ?? [];

const HARDENED = new Set(['CH-07', 'CH-08', 'CH-09', 'CH-10']);
const ARM_NAME: Record<string, string> = {
  iso: 'model computes dates itself',
  'iso-tool': 'model has a date-arithmetic tool',
  ir: 'model describes times; code resolves',
  hybrid: 'one tool takes either — model picks per call',
};
const ARM_COLOR: Record<string, string> = { iso: '#4e79a7', 'iso-tool': '#f28e2b', ir: '#59a14f', hybrid: '#b07aa1' };
const MODEL_SHORT: Record<string, string> = {
  'anthropic/claude-haiku-4-5': 'haiku',
  'openai/gpt-5.4-mini': 'gpt-mini',
  'anthropic/claude-opus-4-8': 'opus (frontier)',
  'openai/gpt-5.5': 'gpt-5.5 (frontier)',
};
const arms = ['iso', 'iso-tool', 'ir', 'hybrid'].filter((a) => rows.some((r) => r.arm === a));
const hopInfo = new Map<string, { instruction: string; setup: string; expected: string }>();
const keysByChain = new Map(CHAINS.map((c) => [c.id, chainKeys(c)]));
for (const c of CHAINS) {
  const keys = keysByChain.get(c.id)!;
  for (const [i, h] of c.hops.entries()) {
    hopInfo.set(`${c.id}:${i + 1}`, {
      instruction: h.instruction,
      setup: c.setup,
      expected: keys[i].expected.map((iv) => humanInterval(iv.start, iv.end)).join(', '),
    });
  }
}

const ok = (rs: HopRow[]): number => rs.filter((r) => r.score.correct).length;
const isAccept = (r: HopRow): boolean => !r.score.correct && r.score.errorClass === 'acceptable-alternative';

/** Three-way segments: exact / documented-defensible-reading / genuine miss. The middle
 *  band exists because some "misses" are acceptable alternative readings (e.g. the
 *  Christmas business-day boundary) — counting them as wrong overstates the error. */
function passSegments(rs: HopRow[], okColor: string, wrongColor: string) {
  const accRs = rs.filter(isAccept);
  const wrongRs = rs.filter((r) => !r.score.correct && !isAccept(r));
  return [
    { label: 'exact', n: ok(rs), total: rs.length, color: okColor, detail: [`${ok(rs)}/${rs.length} used the exact expected range`] },
    { label: 'defensible alternative', n: accRs.length, total: rs.length, color: '#9ccc65', detail: ['a documented alternative reading of an underspecified step — within-acceptable, not an error; click for which'], rows: detailRows(accRs) },
    { label: 'wrong', n: wrongRs.length, total: rs.length, color: wrongColor, detail: ['genuine miss — click for the actual answers'], rows: detailRows(wrongRs) },
  ].filter((s) => s.n > 0);
}

const ERR_LABEL: Record<string, string> = {
  arithmetic: 'right reference, wrong math',
  'zone-offset': 'right day, wrong UTC offset (DST mistake)',
  'anchor-binding': 'bound the wrong earlier date',
  cascade: 'correct math from its OWN earlier divergence (locally right, globally off)',
  fencepost: 'one boundary off by one day (inclusive/exclusive miss)',
  'acceptable-alternative': 'a documented defensible reading (not an error)',
  'wrong-operation': 'wrong window / no call / misread',
};

/** Detail rows for a set of attempts: the step asked, what was answered, error kind. */
function detailRows(rs: HopRow[]): Array<{ q: string; actual: string; expected: string; note?: string; n?: number }> {
  const grouped = new Map<string, { q: string; actual: string; expected: string; note: string; n: number }>();
  for (const r of rs) {
    if (r.score.correct) continue;
    const info = hopInfo.get(`${r.chainId}:${r.hop}`)!;
    const actual = r.args ? humanInterval(r.args.start, r.args.end) : '(no query made)';
    const k = `${r.chainId}:${r.hop}:${r.model}:${actual}`;
    const e = grouped.get(k);
    if (e) e.n++;
    else grouped.set(k, {
      q: `${r.chainId} step ${r.hop}: ${info.instruction}`,
      actual: `${MODEL_SHORT[r.model] ?? r.model} answered ${actual}`,
      expected: info.expected,
      note: ERR_LABEL[r.score.errorClass ?? ''] ?? r.score.errorClass ?? '',
      n: 1,
    });
  }
  return [...grouped.values()].sort((a, b) => b.n - a.n).slice(0, 20)
    .map((e) => ({ q: e.q, actual: e.actual, expected: e.expected, note: e.note, n: e.n }));
}

const sections: Section[] = [];

// §0 the short answer: model × method, best cell highlighted, metric toggleable.
{
  const MODEL_ORDER = [
    'anthropic/claude-haiku-4-5',
    'openai/gpt-5.4-mini',
    'anthropic/claude-opus-4-8',
    'openai/gpt-5.5',
  ].filter((m) => rows.some((r) => r.model === m));
  const wt = winnerTable({
    columns: arms.map((arm) => ({ key: arm, label: ARM_NAME[arm], color: ARM_COLOR[arm] })),
    rows: MODEL_ORDER.map((model) => ({
      label: MODEL_SHORT[model] ?? model,
      cells: Object.fromEntries(
        arms.map((arm) => {
          const sub = rows.filter((r) => r.model === model && r.arm === arm);
          if (!sub.length) return [arm, undefined];
          const within = sub.filter((r) => r.score.correct || r.score.errorClass === 'acceptable-alternative').length;
          return [arm, { exact: (ok(sub) / sub.length) * 100, within: (within / sub.length) * 100 }];
        }),
      ),
    })),
    metrics: [
      { key: 'exact', label: '<b>strict</b> — queried exactly the right time range' },
      { key: 'within', label: '<b>strict + reasonable</b> — also counts documented defensible readings' },
    ],
    caption: `Green cell = that model's best method under the selected metric. Small models ran 3 repeats
(138 steps per cell), frontier models 1 (46 steps, so one step ≈ 2 points).`,
  });
  sections.push({
    id: 'winner',
    title: 'The short answer: describing times for code to resolve wins in all four models',
    subtitle: 'Across every multi-step investigation, easy and hardened.',
    groups: [], legend: [],
    customHtml: wt,
  });
}

// §1 HEADLINE: per arm, easy vs hardened (pooled over models)
{
  const bars = [];
  for (const arm of arms) {
    for (const [setName, isHard] of [['easy chains', false], ['hardened chains', true]] as const) {
      const sub = rows.filter((r) => r.arm === arm && HARDENED.has(r.chainId) === isHard);
      if (!sub.length) continue;
      bars.push({
        rowLabel: `${ARM_NAME[arm]} — ${setName}`,
        segments: passSegments(sub, isHard ? ARM_COLOR[arm] : ARM_COLOR[arm] + '88', '#e8eaed'),
      });
    }
  }
  sections.push({
    id: 'headline',
    title: 'Conversational difficulty — not chain length — is what hurts',
    subtitle: 'All models pooled (two small at 3 repeats, two frontier at 1). Faded bars = the original cooperative chains, where every reference names its milestone (“…before the review”). Solid bars = hardened chains that talk like real people: implicit references (“when the trouble started”), a meeting RESCHEDULED mid-conversation, irrelevant distractor dates, and references reaching 8 steps back. Every method loses 13–26 points on the hardened set; the formal-expression method loses least. Click any gray segment for the actual wrong answers behind it.',
    groups: [{ bars }],
    legend: arms.map((a) => ({ label: ARM_NAME[a], color: ARM_COLOR[a], detail: [ARM_NAME[a]] })),
  });
}

// §1b the same headline, split by model — small and frontier tiers side by side.
{
  const MODEL_ORDER = [
    'anthropic/claude-haiku-4-5',
    'openai/gpt-5.4-mini',
    'anthropic/claude-opus-4-8',
    'openai/gpt-5.5',
  ].filter((m) => rows.some((r) => r.model === m));
  const groups = [];
  for (const model of MODEL_ORDER) {
    const bars = [];
    for (const arm of arms) {
      for (const [setName, isHard] of [['easy chains', false], ['hardened chains', true]] as const) {
        const sub = rows.filter((r) => r.model === model && r.arm === arm && HARDENED.has(r.chainId) === isHard);
        if (!sub.length) continue;
        bars.push({
          rowLabel: `${ARM_NAME[arm]} — ${setName}`,
          segments: passSegments(sub, isHard ? ARM_COLOR[arm] : ARM_COLOR[arm] + '88', '#e8eaed'),
        });
      }
    }
    if (bars.length) groups.push({ name: MODEL_SHORT[model] ?? model, bars });
  }
  sections.push({
    id: 'headline-by-model',
    title: 'The same picture, one model at a time',
    subtitle: 'Small models (3 repeats each) on top, frontier models (1 repeat each, so coarser) below. The ordering holds at both tiers — hardened chains cost every method, and the formal-expression method stays ahead — but the frontier models start higher and lose less. Frontier bars rest on 46 steps each, so one step ≈ 2 points.',
    groups,
    legend: arms.map((a) => ({ label: ARM_NAME[a], color: ARM_COLOR[a], detail: [ARM_NAME[a]] })),
  });
}

// §2 depth, with composition held constant: fixed cohort of the five 5-step chains
// for steps 1–5; the depth-6..8 tail (a single chain) shown separately and labeled.
{
  const COHORT = new Set(CHAINS.filter((c) => c.hops.length >= 5).map((c) => c.id));
  const groups = [];
  for (const arm of arms) {
    const bars = [];
    for (let d = 1; d <= 5; d++) {
      const at = rows.filter((r) => r.arm === arm && r.depth === d && COHORT.has(r.chainId));
      bars.push({
        rowLabel: `step ${d} (same five investigations)`,
        segments: [
          { label: 'correct', n: ok(at), total: at.length, color: ARM_COLOR[arm], detail: [`${ok(at)}/${at.length} correct at step ${d} — fixed set of chains, so composition can't masquerade as depth`] },
          { label: 'wrong', n: at.length - ok(at), total: at.length, color: '#e8eaed', detail: ['wrong time range — click for examples'], rows: detailRows(at) },
        ].filter((s2) => s2.n > 0),
      });
    }
    for (let d = 6; d <= 8; d++) {
      const at = rows.filter((r) => r.arm === arm && r.depth === d);
      if (!at.length) continue;
      bars.push({
        rowLabel: `step ${d} (one chain only — the hardest)`,
        segments: [
          { label: 'correct', n: ok(at), total: at.length, color: ARM_COLOR[arm] + '88', detail: [`${ok(at)}/${at.length} — steps 6–8 exist only in CH-10, the hardest investigation; dips here reflect ITS hard steps, not depth`] },
          { label: 'wrong', n: at.length - ok(at), total: at.length, color: '#e8eaed', detail: ['wrong time range — click for examples'], rows: detailRows(at) },
        ].filter((s2) => s2.n > 0),
      });
    }
    groups.push({ name: ARM_NAME[arm], bars });
  }
  sections.push({
    id: 'depth',
    title: 'Depth vs difficulty: holding the chain mix constant',
    subtitle: 'A naive accuracy-by-step chart decays — but later steps only exist in longer (and here, harder) investigations, so composition masquerades as depth. Steps 1–5 below use the SAME five investigations throughout; the faded 6–8 rows come from the single 8-step chain. With composition fixed: the dips sit on specific hard steps (the reschedule at 3–4, business-day-from-a-window-edge), and the deepest step of all — re-querying a date from step 1 at step 8 — is nearly perfect (17/18). Difficulty, not depth.',
    groups,
    legend: arms.map((a) => ({ label: ARM_NAME[a], color: ARM_COLOR[a], detail: [ARM_NAME[a]] })),
  });
}

// §3 the worst individual steps
{
  const byHop = new Map<string, HopRow[]>();
  for (const r of rows) byHop.set(`${r.chainId}:${r.hop}`, [...(byHop.get(`${r.chainId}:${r.hop}`) ?? []), r]);
  const worst = [...byHop.entries()]
    .map(([k, rs]) => ({ k, rs, acc: ok(rs) / rs.length }))
    .sort((a, b) => a.acc - b.acc)
    .slice(0, 10);
  sections.push({
    id: 'worst',
    title: 'The 10 hardest steps — what actually breaks',
    subtitle: 'All attempts pooled (all four models × four methods). Three bands: exact, a documented defensible reading (light green — e.g. the freeze-end step lands on Dec 26 under the exclusive-boundary reading vs Dec 24 under the last-covered-day key; both holiday-aware, both defensible), and a genuine miss (red). Several of these "hardest" steps are hard precisely because they are underspecified, so much of the apparent failure is defensible divergence, not error. The genuine misses cluster on business-day counting from a window\'s edge, implicit references, and the rescheduled meeting — not “step 7 of a long chain”.',
    groups: [{
      bars: worst.map(({ k, rs }) => {
        const info = hopInfo.get(k)!;
        return {
          rowLabel: `“${info.instruction.slice(0, 64)}${info.instruction.length > 64 ? '…' : ''}”`,
          segments: passSegments(rs, '#59a14f', '#c62828'),
        };
      }),
    }],
    legend: [
      { label: 'exact', color: '#59a14f', detail: ['exactly the expected range'] },
      { label: 'defensible alternative', color: '#9ccc65', detail: ['a documented alternative reading of an underspecified step — not an error'] },
      { label: 'wrong', color: '#c62828', detail: ['genuine miss — click for examples'] },
    ],
  });
}

// §4 the rescheduled-meeting trap, per model × method
{
  const bars = [];
  for (const model of [...new Set(rows.map((r) => r.model))].sort()) {
    for (const arm of arms) {
      const sub = rows.filter((r) => r.model === model && r.arm === arm && r.chainId === 'CH-08' && r.hop >= 4);
      if (!sub.length) continue;
      bars.push({
        rowLabel: `${MODEL_SHORT[model] ?? model} — ${ARM_NAME[arm]}`,
        segments: [
          { label: 'used the NEW date', n: ok(sub), total: sub.length, color: ARM_COLOR[arm], detail: [`${ok(sub)}/${sub.length} follow-ups used the rescheduled date`] },
          { label: 'reused the OLD date', n: sub.length - ok(sub), total: sub.length, color: '#c62828', detail: ['kept computing from the original meeting date after being told it moved'], rows: detailRows(sub) },
        ].filter((s) => s.n > 0),
      });
    }
  }
  sections.push({
    id: 'stale',
    title: 'The rescheduled-meeting trap — now almost always passed',
    subtitle: 'Mid-conversation: “the meeting has been MOVED one week later.” The next two steps depend on the meeting date. Red = the model kept using the stale date. In an earlier wave (vaguer step wording) small models reused the stale date in half their follow-ups; with the final instructions, 46 of 48 follow-ups track the update. The trap is real but it is sensitive to how the update is phrased — not an inherent inability.',
    groups: [{ bars }],
    legend: [
      { label: 'used the NEW date', color: '#59a14f', detail: ['correctly tracked the update'] },
      { label: 'reused the OLD date', color: '#c62828', detail: ['the stale-value failure'] },
    ],
  });
}


// §4b the hybrid arm's ROUTING: given both representations and the hard-case list,
// which did the model pick per hop — and was the pick right?
{
  const hyb = rows.filter((r) => r.arm === 'hybrid');
  if (hyb.length) {
    const keysByChainLocal = keysByChain;
    const bdChains = new Map(CHAINS.map((c) => [c.id, c.hops.map((h) => JSON.stringify(h.canonicalIR).includes('"businessDays":true'))]));
    const bucketOf = (r: HopRow): string => {
      if (bdChains.get(r.chainId)?.[r.hop - 1]) return 'business-day / holiday math (taught: use the expression)';
      if (r.bindsTo !== 'anchor') return 'anchored to an earlier milestone (taught: use the expression)';
      return 'simple step (concrete ISO is fine)';
    };
    const BUCKETS = [
      'business-day / holiday math (taught: use the expression)',
      'anchored to an earlier milestone (taught: use the expression)',
      'simple step (concrete ISO is fine)',
    ];
    const groups = [];
    for (const model of [...new Set(hyb.map((r) => r.model))].sort()) {
      const bars = [];
      for (const bucket of BUCKETS) {
        const sub = hyb.filter((r) => r.model === model && bucketOf(r) === bucket);
        if (!sub.length) continue;
        const seg = (mode: 'expr' | 'iso', okWanted: boolean) => sub.filter((r) => (r.hybridMode ?? 'iso') === mode && r.score.correct === okWanted);
        bars.push({
          rowLabel: `${bucket}`,
          segments: [
            { label: 'sent an expression — correct', n: seg('expr', true).length, total: sub.length, color: '#59a14f', detail: ['chose the formal expression and got the right window'] },
            { label: 'sent an expression — wrong', n: seg('expr', false).length, total: sub.length, color: '#9ccc65', detail: ['chose the expression but built it wrong — click for the cases'], rows: detailRows(seg('expr', false)) },
            { label: 'sent concrete ISO — correct', n: seg('iso', true).length, total: sub.length, color: '#4e79a7', detail: ['computed the dates itself and got them right'] },
            { label: 'sent concrete ISO — wrong', n: seg('iso', false).length, total: sub.length, color: '#c62828', detail: ['computed the dates itself and missed — the routing failure when this row is a taught hard case. Click for the cases.'], rows: detailRows(seg('iso', false)) },
          ].filter((s) => s.n > 0),
        });
      }
      if (bars.length) groups.push({ name: MODEL_SHORT[model] ?? model, bars });
    }
    void keysByChainLocal;
    sections.push({
      id: 'routing',
      title: 'The hybrid contract: do models route the hard cases to the expression?',
      subtitle: 'In the fourth arm, query_range accepts either concrete ISO or an unresolved expression it resolves internally, and the instructions teach when to use which (the production hard-case list from the architecture doc). Rows group the steps by what the teaching says they are. Green family = sent an expression; blue/red = sent concrete ISO. Red on a taught-hard row is the routing failure mode: the model trusted its own arithmetic where it was told not to.',
      groups,
      legend: [
        { label: 'sent an expression — correct', color: '#59a14f', detail: ['routed to code, right answer'] },
        { label: 'sent an expression — wrong', color: '#9ccc65', detail: ['routed to code, built the expression wrong'] },
        { label: 'sent concrete ISO — correct', color: '#4e79a7', detail: ['self-computed, right'] },
        { label: 'sent concrete ISO — wrong', color: '#c62828', detail: ['self-computed, wrong — on taught-hard rows this is the routing failure'] },
      ],
    });
  }
}

// §4c the hybrid-contract iteration program: seven variants, computed live from the
// archived runs so this table can never drift from the data.
{
  const { existsSync, readdirSync } = await import('node:fs');
  const read = (dir: string): HopRow[] =>
    existsSync(dir)
      ? readdirSync(dir).filter((f) => f.endsWith('.jsonl')).flatMap((f) =>
          readFileSync(`${dir}/${f}`, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l) as HopRow))
      : [];
  // Grouped by the law: each design either gives the expression channel a USABLE shape
  // (non-optional) AND a VISIBLE grammar (in-band), or it doesn't. The cell shows, for
  // each model, how many expression attempts were COMPLETE (well-formed enough to
  // resolve) vs degenerate {} — that is the law's evidence, not the accuracy %.
  const VARIANTS: Array<{ name: string; rows: HopRow[]; note: string; works: boolean; ref?: 'floor' | 'ceiling' }> = [
    { name: 'plain ISO — no expression option (floor)', rows: rows.filter((r) => r.arm === 'iso'), note: 'model computes every date itself', works: false, ref: 'floor' },
    { name: 'dedicated resolve tool — ALWAYS resolves (ceiling)', rows: rows.filter((r) => r.arm === 'ir'), note: 'no choice: every hop through code', works: true, ref: 'ceiling' },
    { name: 'optional object field (canonical)', rows: rows.filter((r) => r.arm === 'hybrid'), note: 'shape ✗ — all 4 models, ×3', works: false },
    { name: 'optional object, nullable wrapper', rows: read('results/runs/3-tooling/threading-hybrid-v4-nullable'), note: 'shape ✗ — all 4 models', works: false },
    { name: 'optional object + worked example', rows: read('results/runs/3-tooling/threading-hybrid-iter/guided'), note: 'shape ✗ — minis ×1', works: false },
    { name: 'required mode discriminator', rows: read('results/runs/3-tooling/threading-hybrid-iter/mode'), note: 'shape ✗ (field still optional) — minis ×1', works: false },
    { name: 'string field, grammar HIDDEN', rows: read('results/runs/3-tooling/threading-hybrid-iter/string'), note: 'grammar ✗ — minis ×1', works: false },
    { name: 'string field + guidance, grammar HIDDEN', rows: read('results/runs/3-tooling/threading-hybrid-iter/string-guided'), note: 'grammar ✗ — all 4 models', works: false },
    { name: 'union: object OR string', rows: read('results/runs/3-tooling/threading-hybrid-iter/union'), note: 'partial — minis ×1', works: false },
    { name: 'TWIN TOOLS: required object, own tool', rows: read('results/runs/3-tooling/threading-hybrid-iter/twin'), note: 'shape ✓ + grammar ✓ (advertised schema) — all 4, ×3', works: true },
    { name: 'string field + grammar INLINED', rows: read('results/runs/3-tooling/threading-hybrid-iter/string-grammar'), note: 'shape ✓ + grammar ✓ (in-band) — minis ×1', works: true },
  ];
  const MODELS4 = ['anthropic/claude-haiku-4-5', 'openai/gpt-5.4-mini', 'anthropic/claude-opus-4-8', 'openai/gpt-5.5'];
  const cell = (rs: HopRow[], ref?: 'floor' | 'ceiling'): string => {
    if (!rs.length) return '<td style="color:#9aa0a6">—</td>';
    const ok = rs.filter((r) => r.score.correct).length;
    const acc = Math.round((ok / rs.length) * 100);
    if (ref === 'floor') return `<td>${acc}% <span style="color:#5f6368;font-size:.75rem">(ISO only)</span></td>`;
    if (ref === 'ceiling') return `<td style="background:#d7ecd9">${acc}% <span style="color:#5f6368;font-size:.75rem">(all via resolve)</span></td>`;
    const ex = rs.filter((r) => r.hybridMode === 'expr');
    const complete = ex.filter((r) => r.args).length;
    // red tint when the model TRIED the expression path but mostly produced degenerate/
    // unresolvable expressions — the channel-failure signature
    const broken = ex.length > 0 && complete / ex.length < 0.5;
    const exprNote = ex.length ? `${complete}/${ex.length} expr ok` : 'no expr';
    return `<td style="${broken ? 'background:#fdecea' : complete > 0 ? 'background:#e8f5e9' : ''}">${acc}% <span style="color:#5f6368;font-size:.75rem">(${exprNote})</span></td>`;
  };
  const body = VARIANTS.map((v) => `<tr${v.ref ? ' style="font-weight:600;border-top:2px solid #bbb"' : ''}>
    <td style="text-align:left">${v.name}<br><span style="color:#9aa0a6;font-weight:400;font-size:.75rem">${v.note}</span></td>
    ${MODELS4.map((m) => cell(v.rows.filter((r) => r.model === m), v.ref)).join('')}</tr>`).join('\n');
  sections.push({
    id: 'iteration',
    title: 'Letting the agent choose: the law, bracketed by the two non-choice contracts',
    subtitle: 'The top two rows are the bookends — plain ISO (the model computes every date, no expression option) and the dedicated resolve tool (every hop goes through code, the model has no choice). Everything between is a HYBRID that lets the model decide per call. Two readings. First, the law: a per-call expression channel works iff (a) its shape is NON-OPTIONAL and (b) the grammar is VISIBLE in-band — read the parentheses (well-formed expressions vs degenerate {}); optional object fields make GPT emit empty {}, a hidden-grammar string yields wrong-convention fenceposts, and the two designs giving BOTH (twin tools; string-with-grammar) compose correctly for every vendor. Second, and more important for picking an architecture: even the working hybrids only match plain ISO — they never reach the dedicated tool\'s ceiling, because when the model is free to choose it UNDER-routes (28–70% of hops), computing the rest itself, including hops code would have gotten right. Accuracy differences among the hybrids are within their confidence intervals; the floor-to-ceiling gap is the real signal. Takeaway: in a PIPELINE, always resolve (take the choice away — that is the ceiling). In a free-form AGENT where time is interleaved, letting the model emit ISO for easy steps is fine and saves a tool round trip — just give any expression channel a required shape and the grammar in-band, and be aware GPT-family models will under-route and need the channel built exactly right.',
    groups: [], legend: [],
    customHtml: `<table class="winner-table" style="font-size:.85rem"><thead><tr><th style="min-width:240px"></th><th>haiku</th><th>gpt-mini</th><th>opus</th><th>gpt-5.5</th></tr></thead><tbody>${body}</tbody></table>
<div class="sub" style="margin-top:.4rem">Green cell = the model produced well-formed expressions; red = it tried the expression path but mostly produced degenerate {}. Several rows are single repeats (46 steps); read the categorical signal (well-formed vs degenerate), not single-point accuracy differences.</div>`,
  });
}

// §5 error taxonomy, pooled per arm
{
  const ERR: Array<[string, string]> = [
    ['acceptable-alternative', '#9ccc65'],
    ['arithmetic', '#ef6c00'],
    ['fencepost', '#ffd54f'],
    ['cascade', '#4db6ac'],
    ['zone-offset', '#8c6bb1'],
    ['anchor-binding', '#c62828'],
    ['wrong-operation', '#9aa0a6'],
  ];
  const bars = [];
  for (const arm of arms) {
    const errs = rows.filter((r) => r.arm === arm && !r.score.correct);
    bars.push({
      rowLabel: `${ARM_NAME[arm]} — ${errs.length} misses total`,
      segments: ERR.map(([cls, color]) => {
        const sub = errs.filter((r) => r.score.errorClass === cls);
        return { label: ERR_LABEL[cls], n: sub.length, total: Math.max(errs.length, 1), color, detail: [ERR_LABEL[cls], 'click for examples'], rows: detailRows(sub) };
      }).filter((s) => s.n > 0),
    });
  }
  sections.push({
    id: 'errors',
    title: 'When a step went wrong, what KIND of mistake was it?',
    subtitle: 'Misses only, all models pooled — shares of each method\'s own misses. The split is the experiment\'s thesis in miniature: when the model computes, it fails at COMPUTING (math errors, DST-offset mistakes — purple is impossible when code resolves); when it describes times for code, it fails at DESCRIBING (building the expression). And “bound the wrong earlier date” — the failure long chains are feared for — never happened.',
    groups: [{ bars }],
    legend: ERR.map(([cls, color]) => ({ label: ERR_LABEL[cls], color, detail: [cls] })),
  });
}

// §6 reference: the investigations themselves — setup, steps, correct timeline
{
  const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const blocks = CHAINS.map((c) => {
    const keys = keysByChain.get(c.id)!;
    const milestones = keys[keys.length - 1].milestones;
    const steps = c.hops.map((h, i) =>
      `<tr><td>${i + 1}</td><td>${esc(h.instruction)}</td><td>${keys[i].expected.map((iv) => humanInterval(iv.start, iv.end)).join(', ')}</td></tr>`).join('');
    const ms = Object.entries(milestones).map(([name, iv]) => `<b>${name}</b> = ${humanInterval(iv.start, iv.end)}`).join(' · ');
    return `<div style="margin:1rem 0">
      <div class="model">${c.id}${HARDENED.has(c.id) ? ' (hardened)' : ''} — ${esc(c.setup)}</div>
      <div class="sub" style="margin:.2rem 0 .3rem">${ms}</div>
      <div class="detail-table" style="margin-left:0"><table>
        <thead><tr><th>step</th><th>instruction</th><th>correct time range</th></tr></thead>
        <tbody>${steps}</tbody></table></div>
    </div>`;
  }).join('');
  sections.push({
    id: 'chains-reference',
    title: 'Appendix: the investigations themselves',
    subtitle: 'Every chain: its setup, each step\'s instruction, and the correct time range (computed by the deterministic resolver). Detail tables above cite “CH-xx step N” — look the step up here for full context. Milestone names in bold are the dates later steps refer back to.',
    groups: [], legend: [],
    customHtml: blocks,
  });
}

writeFileSync(
  'results/3-tooling/threading-viz.html',
  renderPage({
    title: 'Multi-step conversations: when do time references break down?',
    metaHtml: `An agent rarely answers one question — it runs investigations where step 7 depends on a date established at step 1 (“materials are due 5 business days before the review…”). We drove ${CHAINS.length} scripted multi-step investigations, each step requiring one time-ranged query, three ways: the model <b>computes dates itself</b>, the model has a <b>deterministic date-arithmetic tool</b>, or the model <b>describes times in a formal language</b> that code resolves. Two small models (3 repeats) and two frontier models (1 repeat), ${rows.length} graded steps. This file is self-contained — share it freely.`,
    hintHtml: `Each section below is ONE finding, with the chart that supports it. Gray and red segments are clickable — they open the actual wrong answers behind that bar.`,
    sections,
  }),
);
console.log('wrote results/3-tooling/threading-viz.html');
