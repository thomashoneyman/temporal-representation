/**
 * Slide deck generator — `npm run talk` → talk/index.html.
 * Self-contained, keyboard-navigable HTML deck (no CDN, no build). Narrative arc:
 * measurements → the existing ISO research → the ScateLite hypothesis → results →
 * proposed architectures, with concrete real Q&A pairs embedded along the way. Headline
 * numbers are pulled from results/summary.json + results/task8.json so they can't drift;
 * the embedded Q&A examples are real cases lifted from the runs (cited in talk.md).
 * Speaker notes ride on each slide (toggle with N).
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';

interface Cell { task: string; model: string; arm: string; slice: string; metric: string; value: number }
const s = JSON.parse(readFileSync('results/summary.json', 'utf8')) as { cells: Cell[] };
const t8 = JSON.parse(readFileSync('results/task8.json', 'utf8')) as {
  bookends: { isoAccuracy: number; resolveAccuracy: number };
  conditions: Array<{ id: string; isRoute: boolean; answerAccuracy: number; resolveRate: number; recallNeedsResolve: number | null }>;
};
const t7 = JSON.parse(readFileSync('results/task7.json', 'utf8')) as { cells: Record<string, { accuracy: number }> };
const MODELS = ['anthropic/claude-haiku-4-5', 'openai/gpt-5.4-mini', 'anthropic/claude-opus-4-8', 'openai/gpt-5.5'];
const irAcc = MODELS.map((m) => t7.cells[`${m}|ir`]?.accuracy).filter((x): x is number => x != null).map((x) => Math.round(x * 100));
const irLo = Math.min(...irAcc), irHi = Math.max(...irAcc);
const SHORT: Record<string, string> = { 'anthropic/claude-haiku-4-5': 'haiku', 'openai/gpt-5.4-mini': 'gpt-mini', 'anthropic/claude-opus-4-8': 'opus', 'openai/gpt-5.5': 'gpt-5.5' };
const pc = (model: string, arm: string) => {
  const c = s.cells.find((x) => x.task === 'task4' && x.model === model && x.arm === arm && x.slice === 'ALL' && x.metric === 'exact');
  return c ? Math.round(c.value * 100) : NaN;
};
const r = (x: number) => Math.round(x * 100);
const bestRoute = t8.conditions.filter((c) => c.isRoute).sort((a, b) => b.answerAccuracy - a.answerAccuracy)[0];

// a real question / model-answer / key triple
const qa = (q: string, model: string, key: string, tag = '') =>
  `<div class="qa"><div class="q">“${q}”${tag ? ` <span class="qtag">${tag}</span>` : ''}</div><div class="m">model&nbsp;→ ${model}</div><div class="k">key&nbsp;&nbsp;&nbsp;→ ${key}</div></div>`;

const headlineTable = `<table>
<thead><tr><th></th>${MODELS.map((m) => `<th>${SHORT[m]}</th>`).join('')}</tr></thead>
<tbody>
<tr><td class="lbl">model computes (ISO)</td>${MODELS.map((m) => `<td>${pc(m, 'iso')}%</td>`).join('')}</tr>
<tr class="win"><td class="lbl">code resolves (IR)</td>${MODELS.map((m) => `<td>${pc(m, 'ir')}%</td>`).join('')}</tr>
</tbody></table>`;

interface Slide { kicker?: string; title: string; body?: string; notes: string; section?: boolean }
const slides: Slide[] = [
  {
    title: 'Giving data-analysis agents a reliable sense of time',
    notes: 'The arc: first what models actually do, then what prior research said, then our hypothesis, then what we found, then what to build.',
  },
  {
    kicker: 'the problem',
    title: 'People talk in dates; databases talk in timestamps',
    body: `<p class="big">“utilization last quarter, weekdays only”</p><p class="arrow">↓</p>
<p class="code">ts &gt;= '2026-01-01' AND ts &lt; '2026-04-01' AND dow IN (1..5)</p>
<p class="sub">Every agent has to translate one into the other. Should the <b>model</b> produce those dates, or should <b>code</b>?</p>`,
    notes: 'The core task is translation: human time language in, machine timestamps out. The whole question is who does the translating — the model, or deterministic code.',
  },

  // ── PART 1: MEASUREMENTS ──
  { section: true, kicker: 'part 1', title: 'Measurements', notes: 'Before grading anything, measure what the models actually do — their default readings — so our answer key encodes their own conventions, not a house style.' },
  {
    kicker: 'measurements · phase 1',
    title: 'Models silently disagree on what words mean',
    body: `<div class="splitex"><b>“this week”</b> <span class="ax">asked on a Sunday · week start</span>
<div class="rd">Apr 19 → Apr 26 &nbsp;<span class="vs">vs</span>&nbsp; Apr 13 → Apr 20</div></div>
<div class="splitex"><b>“March 4”</b> <span class="ax">asked in June · which occurrence</span>
<div class="rd">Mar 4 <b>2027</b> &nbsp;<span class="vs">vs</span>&nbsp; Mar 4 <b>2026</b></div></div>
<div class="splitex"><b>“a month ago”</b> <span class="ax">from Thu Mar 12 · pin the day, or count 30</span>
<div class="rd">Feb 12 (same day) &nbsp;<span class="vs">vs</span>&nbsp; Feb 10 (−30 days)</div></div>
<p class="sub">Same phrase, different calendar model. No single right answer until <i>you</i> pick conventions.</p>`,
    notes: 'Ungraded Phase 1 — 29 phrases × 7 anchor dates. Three distinct axes of disagreement: week start, which occurrence of a bare date, and pin-day vs N-day counting. The point is that the words are genuinely ambiguous until conventions are chosen; the next slide shows most splits still have a dominant side.',
  },
  {
    kicker: 'measurements · phase 1',
    title: 'But each split usually has a majority',
    body: `<p>Across the anchors, most disagreements lean one way: weeks read <b>Monday–Sunday</b>, bare dates as their <b>nearest</b> occurrence, "a month ago" as the <b>same day last month</b>, periods as <b>calendar-aligned</b> rather than rolling windows.</p>
<p class="punch">A few phrases have no majority at all — "the last few months", "recently", "mid-March" — genuinely ambiguous, and the cases worth stressing later.</p>`,
    notes: 'Describing what the models do, not prescribing. The splits have a dominant side, so there is a defensible default to adopt downstream; the truly fuzzy phrases are where no default is safe — they feed the steering and clarification tests.',
  },

  // ── PART 2: EXISTING ISO RESEARCH ──
  { section: true, kicker: 'part 2', title: 'The existing research', notes: 'What the literature said about resolving directly to ISO timestamps — and why it was a mixed message.' },
  {
    kicker: 'prior work',
    title: "The literature isn't clear",
    body: `<ul>
<li><b>Test of Time (2025):</b> looks <span class="bad">bad</span> — ~90% extracting times, but <b>40–50%</b> adding/subtracting dates, <b>~15%</b> on durations.</li>
<li><b>PRIMETIME (2026):</b> looks <span class="good">good</span> — frontier models <b>90–98%</b> translation, 85–100% on "+250 days".</li>
</ul>
<p class="punch">No research I could find on <b>business-calendar</b> questions, or on the <b>small/cheap</b> models a default agent actually runs — so we tested it ourselves.</p>`,
    notes: 'The two papers point opposite directions; neither targets business-calendar phrasing, and both focus on frontier models. The cheap default-tier model is what most production agents run, and nobody had mapped it — that gap is why we ran this.',
  },
  {
    kicker: 'prior work · what held up',
    title: 'Which prior findings held? Mixed.',
    body: `<ul class="score">
<li><span class="good">held</span> &nbsp;explicit-date translation — near-ceiling (gpt-5.5 100%, haiku 89%), matches PRIMETIME</li>
<li><span class="warn">partly</span> &nbsp;date arithmetic — <i>not</i> a blanket 40–50%: simple day-offsets hold up; holiday &amp; business-day math doesn't</li>
<li><span class="bad">worse</span> &nbsp;big offsets ("+250 days") — flakier at the cheap tier than PRIMETIME's 85–100%</li>
<li><span class="muted2">n/a</span> &nbsp;durations (Test of Time's weakest, ~15%) — we didn't isolate them</li>
</ul>
${qa('400 days from now', 'Oct 10 · Oct 21 · Sep 20 (across repeats)', 'Oct 20 2026', 'large offset, flaky')}
${qa('45 business days from today', 'Apr 30 2026', 'May 1 2026', 'business-day count, holiday-tripped')}`,
    notes: 'Honest scorecard against the two papers across several of their experiments, not just one. Explicit-date translation reproduces; the headline "arithmetic is bad" does NOT reproduce as stated — it splits by kind (simple offsets fine, holiday/business-day math hard); big offsets were actually shakier for us because we run the cheap default-tier model; durations we did not test in isolation. The examples are real direct-ISO answers — note the same prompt gives different answers across repeats, which is the flakiness, not a fixed error.',
  },

  // ── PART 3: THE SCATELITE HYPOTHESIS ──
  { section: true, kicker: 'part 3', title: 'The ScateLite hypothesis', notes: 'If models are shaky at producing dates, have them CLASSIFY the time into a small formal language and let deterministic code resolve it.' },
  {
    kicker: 'hypothesis',
    title: 'Don\'t resolve — classify, then resolve in code',
    body: `<p class="sub">Same question, two jobs. "weekends in March" —</p>
<p class="lbl2">ISO arm — the model must hand-produce all 9 ranges (one even crosses the DST change):</p>
<p class="code sm">2026-03-01T00:00−05:00 → 03-02 … 2026-03-08T00:00−05:00 → 03-09T00:00<b>−04:00</b> … (9 total)</p>
<p class="lbl2">IR arm — the model emits one expression; code expands it:</p>
<p class="code sm">{ type:"filter", within:{ type:"date", month:3 }, weekdays:["sat","sun"] }</p>`,
    notes: 'ScateLite is a small SCATE-like grammar — dates, presets, offsets, nth-of, ranges, filters, grains. The model classifies; a deterministic resolver (which owns the conventions and the holiday/DST tables) produces ISO. The hypothesis: classifying is easier than resolving.',
  },
  {
    kicker: 'hypothesis · prior art',
    title: 'A grammar, not a timestamp — borrowing from SCATE',
    body: `<p>The SCATE-style approach <span class="cite">(arXiv:2507.06450)</span> annotates time as a <b>composition of interval operators</b> — shifts, nth-of, ranges, intersections — instead of resolving to a point.</p>
<p class="big">"a month ago" → <span class="mono">shift(now, 1 month, before)</span></p>
<p class="punch">Structure kept, resolution deferred. Our bet: models are better at <b>naming the structure</b> than at doing the calendar math.</p>`,
    notes: 'SCATE is a compositional semantics for temporal expressions — operators over intervals rather than resolved points. The move we borrow: keep the expression unresolved so deterministic code (which knows the calendar) resolves it. We adapt the idea, trimmed to business needs; we do not reimplement the full schema.',
  },
  {
    kicker: 'hypothesis · our grammar',
    title: 'ScateLite — trimmed to what business users say',
    body: `<p class="mono small">now · date · preset · ref · shift · weekday · nth · range · filter · union</p>
<ul>
<li>a 10-node <b>discriminated union</b> (one <code>type</code> per node), composable to any depth</li>
<li>the resolver owns the hard parts — <b>conventions</b> (week start, pin-day), the <b>US-holiday table</b>, <b>business-day</b> math, <b>DST</b> — so the model never touches them</li>
<li>scoped to the business calendar: no "circa 1994", no leap seconds, no unbounded recurrence</li>
</ul>`,
    notes: 'The discriminated union is what makes it both LLM-emittable (structured output) and deterministically resolvable. Conventions live in one place and are swappable per org — that is artifact #3. We trimmed SCATE to what data-analysis users actually ask.',
  },
  {
    kicker: 'hypothesis · worked examples',
    title: 'What the model actually emits',
    body: `<div class="wx"><span class="wq">“last week”</span><span class="we">{ type:"preset", name:"last_week" }</span></div>
<div class="wx"><span class="wq">“5 business days ago”</span><span class="we">{ type:"shift", base:{type:"preset",name:"today"}, by:"P5D", direction:"before", businessDays:true }</span></div>
<div class="wx"><span class="wq">“the third Tuesday of next month”</span><span class="we">{ type:"nth", n:3, unit:"tue", of:{type:"preset",name:"next_month"} }</span></div>
<div class="wx"><span class="wq">“since March”</span><span class="we">{ type:"range", from:{type:"date",month:3}, to:{type:"now"} }</span></div>
<div class="wx"><span class="wq">“weekends in March”</span><span class="we">{ type:"filter", within:{type:"date",month:3}, weekdays:["sat","sun"] }</span></div>
<div class="wx ref"><span class="wq">“our next maintenance window”</span><span class="we">{ type:"ref", id:"maintenance_window" } &nbsp;<span class="defn">← org defines: 2nd Sat, 02:00–06:00</span></span></div>
<p class="sub">Real canonical expressions. <code>ref</code> points at a company-defined period (or a milestone from earlier in the conversation) — the model names it, your definition resolves it.</p>`,
    notes: 'These are the actual canonical IRs the dataset is keyed on. Small and readable — a model can emit it and you can eyeball it; every leaf is a label, not a computed date. The ref node is the custom-period and milestone mechanism: the model just references the name, and the org-supplied definition (or a prior tool result) is what gets resolved.',
  },
  {
    kicker: 'hypothesis · for engineers',
    title: 'The grammar: leaves + operators',
    body: `<p class="lbl2">leaves — anchors that resolve on their own</p>
<p class="mono small">now · date{year?,month?,day?,hour?,min?} · preset{name} · ref{id} · iso{start,end}</p>
<p class="lbl2">operators — compose other nodes, any depth</p>
<p class="mono small">shift{base, by:ISO-duration, dir, businessDays?} · weekday{day,which,of?} · nth{n,unit,of} · range{from,to,endExclusive?} · filter{within, weekdays?|timeOfDay?} · union</p>
<ul>
<li>every node resolves to a <b>point</b>, a <b>range</b>, or a <b>set</b></li>
<li>the resolver is a pure recursive <span class="mono">TimeExpr → Interval[]</span> (half-open, single zone) — its only config is the conventions object + the US-holiday table</li>
</ul>`,
    notes: 'For the engineers. Offsets are ISO-8601 durations (P5D, P2W, P1M). The resolver is ~one recursive function; swap the conventions object or holiday table and every expression re-resolves. No model in the resolver — it is deterministic and unit-tested.',
  },
  {
    kicker: 'hypothesis · why it wins',
    title: 'A convention is a guarantee — prompting only buys a tendency',
    body: `<p>Part 1: models split on "last week", "a month ago". The instinct is to prompt your house rule. But the prompt can't make it stick:</p>
<ul>
<li><b>Adherence</b> — spell the rule out and direct ISO barely moves: steering removed only <b>4 of 30</b> non-conforming readings (it keeps giving the other one). In the resolver path those readings collapse, because code applies the convention, not persuasion.</li>
<li><b>Determinism</b> — same prompt, repeated: the model varies (~1 answer in 5 differs). The resolver is identical <b>every time, by construction</b>.</li>
</ul>
<p class="punch">So the model just emits the <b>label</b> — <span class="mono">preset:last_week</span> — and <b>your resolver's conventions</b> decide whether that's Mon–Sun or Sun–Sat. Guaranteed, identical, swappable per org.</p>`,


    notes: 'The honest case is NOT the accuracy delta (steered ISO 78→85% is within noise). It is guarantee vs tendency: (1) Adherence — Task 5, n=417: telling direct ISO the convention removed only 4 of 30 non-conforming readings for haiku (4 of 19 for gpt); the model ignores an explicit rule most of the time. The IR/resolver path collapses those readings (27→11) because the resolver applies the convention deterministically. (2) Determinism — the model is ~77–86% reproducible (same prompt, different answer ~1 in 5); the resolver is 100% by construction. A convention must be a guarantee; only code gives one.',
  },
  {
    kicker: 'hypothesis',
    title: 'Three arms, graded against a hand-verified key',
    body: `<ul>
<li><b>ISO</b> — model computes the dates itself</li>
<li><b>ISO + crib</b> — same, plus a cheat sheet of precomputed common periods</li>
<li><b>IR</b> — model emits ScateLite; code resolves</li>
</ul>
<p class="sub">8 categories · seed-relative items · two small + two frontier models (Anthropic + OpenAI; Gemini in scope but skipped — no key).</p>`,
    notes: 'Seed-relative = the answer depends on "today", so nothing is memorized. The crib arm tests whether more reference anchors alone close the gap.',
  },

  // ── PART 4: RESULTS ──
  { section: true, kicker: 'part 4', title: 'Results', notes: 'The variety of findings — translation, the cliff, the DST class, the arithmetic myth, tool contracts, routing.' },
  {
    kicker: 'results · headline',
    title: 'Classify-to-IR wins for every model',
    body: `${headlineTable}<p class="punch">Never loses overall. Biggest margin on the hard categories and the weaker model; on easy traffic ISO ties.</p>`,
    notes: 'Translation accuracy, all questions. Holds across translation, multi-step conversations, and compound queries.',
  },
  {
    kicker: 'results · the cliff',
    title: 'Where direct ISO is simply wrong',
    body: `${qa('utilization over the past month, Tue–Thu, 8am–12pm', 'one range: May 9 → Jun 9 (filters ignored)', '12 windows: each Tue/Wed/Thu, 8am–12pm', 'compound filter')}
${qa('since March', 'Mar 1 2026 → Jun 9 <b>2027</b>', 'Mar 1 2026 → now (Jun 9 2026)', 'invented a future end')}
${qa('in 3 business days', 'Dec 1 2025', 'Dec 2 2025 (Thanksgiving skipped)', 'asked the day before Thanksgiving')}
<p class="sub">Flat errors, not "a different reading" — every key hand-verified. The model dropped the filters, ran a year past "now", and miscounted business days around a holiday.</p>`,
    notes: 'Chosen deliberately to be unambiguous model errors, not convention divergences (we excluded week-start and inclusive-vs-half-open cases where the model reading is defensible). Each key was checked against the resolver: 3 business days from Wed Nov 26 skips Thanksgiving → Dec 2; "since March" ends at the anchor, not a year out; the compound query is 12 separate windows, not one month-long range.',
  },
  {
    kicker: 'results · an ISO-only failure',
    title: 'DST: right day, wrong offset',
    body: `${qa('the quarter so far (Oct 1 → now)', 'Oct 1 2026 00:00 −05:00', 'Oct 1 2026 00:00 −04:00', 'opus, ISO arm')}
<p class="punch">October is EDT (−04:00); the model copied the anchor's winter offset. The window is shifted an hour. <b>Structurally impossible once code resolves.</b></p>`,
    notes: 'Zone-offset errors appear only when the model writes timestamps. The resolver knows the offset for every date. This whole failure class disappears under IR.',
  },
  {
    kicker: 'results · tool contracts',
    title: 'Should a tool take ISO, IR, or both?',
    body: `<p>We ran all three contracts on the multi-step tasks. The best-performing one for <b>every</b> model:</p>
<p class="big">domain tools take <b>ISO</b> · one <code>resolve(IR)→ISO</code> tool in front</p>
<p class="punch">That contract scored <b>${irLo}–${irHi}%</b> across the four models — top or tied-top everywhere. Resolution happens once, centrally; the query tools stay simple. Folding the grammar into the tools themselves didn't beat it.</p>`,
    notes: 'H3: do tools need to accept the IR? We tested ISO-only, IR-accepting, and a polymorphic both. The resolve-then-query contract (tools take ISO, one resolve tool produces it) was top or tied-top for every model — haiku 91, gpt-mini 90, opus 100, gpt-5.5 96. Keeping it performance-focused on purpose: the polymorphic-field fragility is real but fixable, so it is not the headline; the headline is that ISO-tools-plus-one-resolve-tool performs best and stays simplest.',
  },
  {
    kicker: 'results · the agent question',
    title: 'Can the model route itself? (with the right prompt)',
    body: `<p class="sub">Haiku, on a 30-question set built half-easy / half-hard (so these run below the headline). Each row = <b>answer accuracy</b> under one tool policy:</p>
<table><thead><tr><th>policy (what the agent is allowed / told)</th><th>answer accuracy</th></tr></thead><tbody>
<tr><td class="lbl">force ISO — only the ISO tool offered</td><td>${r(t8.bookends.isoAccuracy)}%</td></tr>
<tr><td class="lbl">force resolve — every date through the tool</td><td>${r(t8.bookends.resolveAccuracy)}%</td></tr>
<tr class="win"><td class="lbl">let it choose — tuned routing prompt</td><td>${r(bestRoute.answerAccuracy)}%</td></tr>
</tbody></table>
<p class="sub">Why isn't "always resolve" the ceiling? It still needs the model to build a correct <i>expression</i> — and forcing a trivial date through the grammar sometimes mis-builds it (easy items: 68% via the resolver vs 79% self-computed). Routing self-computes the easy ones and resolves the hard ones. <span class="cite">(the 8-pt edge is within noise at n=30 — read it as "at least a tie")</span></p>
<p class="punch">And it resolves only ${r(bestRoute.resolveRate)}% of the time: the ~${100 - r(bestRoute.resolveRate)}% it skips are easy dates answered in one step, not a resolver round-trip. <b>That saved round-trip — latency and tokens on every easy turn — is the reason to route rather than always resolve.</b></p>`,
    notes: 'Key clarification for the room: this is a SEPARATE, harder 30-item set (half deliberately chosen because Haiku\'s plain ISO fails them), so 63% here is not the 78% headline — different population. The column is ANSWER accuracy (did the queried window match the key), NOT a routing/resolve rate. "Force ISO" = only the ISO tool is offered, so it self-computes everything; "force resolve" = always use the resolver; "let it choose" = both tools + a tuned category-routing prompt. The point is the ordering: a good routing prompt beats forcing either path. MECHANISM (why routing can edge always-resolve): always-resolve is NOT a deterministic ceiling — it still depends on the model building a correct expression for EVERY item, and forcing a trivially-explicit date through the grammar sometimes mis-builds it. Haiku: easy items 73% self-computed / 79% routed but only 68% always-resolved; hard items 13% / 87% / 93%. Routing wins the easy items (×25) by more than it loses the hard items (×5). The 8-pt overall gap is within CI, so claim "at least a tie, at fewer round-trips," not a clean win. (Aside: the tuned prompt also delegates 12 of the 15 hard-case attempts — a recall that coincidentally also rounds to 80%, but over a different denominator than the accuracy; kept off the slide on purpose. A naive "prefer ISO" prompt under-routes; the tuned one names hard categories without naming any test item — that cheat was caught and removed.)',
  },

  // ── PART 5: ARCHITECTURE ──
  { section: true, kicker: 'part 5', title: 'Proposed architectures', notes: 'Two shapes, one principle: the model classifies, code computes, ISO is the wire format.' },
  {
    kicker: 'recommendation',
    title: 'Model classifies · code computes · ISO on the wire',
    body: `<div class="two">
<div><h3>Pipeline</h3><p>classify → resolve → validate → query. <b>Always resolve.</b> Highest accuracy. Most BI agents.</p></div>
<div><h3>Free-form agent</h3><p>ISO by default for explicit dates; a <b>required-argument</b> resolve tool for the hard categories, routed by an explicit list.</p></div>
</div>
<p class="lbl2">two cheap add-ons</p>
<ul>
<li><b>Preset crib</b> — precompute the few high-frequency periods ("last week", "this quarter", YTD) against the anchor and drop them in the prompt; cheap insurance for latency-sensitive easy traffic.</li>
<li><b>Model-free guardrail</b> — a deterministic check on every tool call (end&lt;start, zero-length, DST offset, implausible window); log it first, then have it trigger a retry on a hard failure.</li>
</ul>`,
    notes: 'Two shapes, one principle. The two add-ons sit on top of either shape. The preset crib is the "give it precomputed anchors" idea — small lift, near-zero cost. The guardrail catches malformed/implausible time args cheaply (it cannot catch wrong-but-plausible — that is what the resolver is for). Full decision table, every row cited to a measurement, in summary-viz.html and architecture.md.',
  },
  {
    kicker: 'recommendation · payoff',
    title: 'What it buys you',
    body: `<ul>
<li>Hard categories: 10–25 points behind → <b>solved</b>.</li>
<li>DST-offset and bounding-range failures → <b>structurally impossible</b>.</li>
<li>Conventions pinned <b>in code</b>, not re-litigated each call.</li>
<li>Model-swap is a <b>measurement</b>: re-run the eval, read the leaderboard.</li>
</ul>`,
    notes: 'The eval is the durable artifact — it turns "should we switch models" into a number.',
  },
  {
    title: 'Build it',
    body: `<ul>
<li><b>Lift</b> <code>src/scate-lite/</code> (grammar + resolver + conventions) + the guardrail.</li>
<li><b>Eval</b> before trusting a model: <code>npm run phase2 &amp;&amp; npm run analyze</code>.</li>
<li><b>Guardrail</b> live: model-free <code>checkTimeArgs</code>, log-only → retry-on-block.</li>
</ul>
<p class="sub">Reference: <code>architecture.md</code> · Handoff: <code>guide.md</code> · One-page leaderboard: <code>results/summary-viz.html</code></p>`,
    notes: 'guide.md is the step-by-step handoff: customize conventions to your calendar, build a dataset from your logs, measure your model\'s hard set, wire it, guardrail it.',
  },
];

const esc = (x: string) => x.replace(/&(?![a-z]+;|#)/g, '&amp;');
const slideHtml = slides.map((sl, i) => `
<section class="slide${sl.section ? ' divider' : ''}"${i === 0 ? ' data-active' : ''}>
  <div class="inner">
    ${sl.kicker ? `<div class="kicker">${esc(sl.kicker)}</div>` : ''}
    <h1${(i === 0 || !sl.kicker) && !sl.section ? ' class="title-lg"' : ''}>${esc(sl.title)}</h1>
    ${sl.body ? `<div class="content">${sl.body}</div>` : ''}
  </div>
  <aside class="notes"><b>Notes</b> · ${esc(sl.notes)}</aside>
</section>`).join('');

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Talk — time in data-analysis agents</title>
<style>
  :root { --ink:#1a1a1a; --muted:#5f6368; --accent:#2e7d32; --bg:#fbfbf9; }
  * { box-sizing:border-box; }
  html,body { margin:0; height:100%; background:#11130f; color:var(--ink); font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; }
  .slide { position:fixed; inset:0; display:none; padding:4vh 7vw; background:var(--bg); flex-direction:column; justify-content:center; }
  .slide[data-active] { display:flex; }
  .slide.divider { background:#13301c; color:#eaf3ea; align-items:flex-start; }
  .slide.divider .kicker { color:#9fd3a8; }
  .slide.divider h1 { font-size:6vw; color:#fff; }
  .inner { max-width:1020px; margin:0 auto; width:100%; }
  .kicker { text-transform:uppercase; letter-spacing:.12em; font-size:1.05vw; color:var(--accent); font-weight:700; margin-bottom:1.2vh; }
  h1 { font-size:3.3vw; line-height:1.1; margin:0 0 2.4vh; }
  h1.title-lg { font-size:4vw; }
  h3 { font-size:1.7vw; margin:0 0 .6vh; color:var(--accent); }
  .content { font-size:1.85vw; line-height:1.45; color:#2a2a2a; }
  .content ul { padding-left:1.2em; margin:.4em 0; } .content li { margin:.5em 0; }
  .sub { color:var(--muted); font-size:1.6vw; } .lbl2 { color:var(--muted); font-size:1.3vw; margin:1.4vh 0 .4vh; }
  .byline { color:var(--muted); font-size:1.15vw; margin-top:3vh; }
  .big { font-size:2.3vw; font-weight:600; line-height:1.3; }
  .punch { font-size:1.75vw; margin-top:2vh; border-left:4px solid var(--accent); padding-left:.7em; }
  .law { font-size:2vw; font-weight:600; background:#eef6ee; border-radius:10px; padding:.6em .8em; }
  .arrow { font-size:2.4vw; color:var(--accent); margin:.3vh 0; }
  .code, code { font-family:"SF Mono",Menlo,monospace; }
  .code { font-size:1.6vw; background:#1e2017; color:#c8e6c9; padding:.5em .7em; border-radius:8px; display:inline-block; }
  .code.sm { font-size:1.2vw; }
  code { font-size:.9em; background:#eceee6; padding:.05em .3em; border-radius:4px; }
  .qa { background:#fff; border:1px solid #e2e2da; border-left:4px solid var(--accent); border-radius:8px; padding:1vh 1.1vw; margin:1.2vh 0; font-size:1.5vw; }
  .qa .q { font-weight:600; margin-bottom:.5vh; }
  .qa .qtag { font-size:1vw; background:#eceee6; color:var(--muted); padding:.1em .5em; border-radius:20px; font-weight:400; }
  .qa .m { color:#c0392b; font-family:"SF Mono",Menlo,monospace; font-size:1.25vw; }
  .qa .k { color:var(--accent); font-family:"SF Mono",Menlo,monospace; font-size:1.25vw; }
  .splitex { background:#fff; border:1px solid #e2e2da; border-radius:8px; padding:.9vh 1.1vw; margin:1vh 0; font-size:1.55vw; }
  .splitex .ax { font-size:1vw; color:var(--muted); margin-left:.5em; }
  .splitex .rd { font-family:"SF Mono",Menlo,monospace; font-size:1.3vw; color:#2a2a2a; margin-top:.4vh; }
  .splitex .vs { color:var(--accent); font-weight:700; font-family:-apple-system,sans-serif; }
  .bad { color:#c0392b; font-weight:700; } .good { color:var(--accent); font-weight:700; }
  ul.score { list-style:none; padding-left:0; } ul.score li { margin:.5em 0; }
  ul.score .good,.score .bad,.score .warn,.score .muted2 { display:inline-block; min-width:4.2em; text-transform:uppercase; font-size:1.1vw; letter-spacing:.04em; }
  .warn { color:#a07a00; font-weight:700; } .muted2 { color:#9aa0a6; font-weight:700; }
  .mono { font-family:"SF Mono",Menlo,monospace; } .mono.small { font-size:1.3vw; color:var(--accent); background:#eef6ee; padding:.4em .6em; border-radius:8px; display:inline-block; }
  .cite { color:var(--muted); font-size:.8em; }
  .wx { display:flex; align-items:baseline; gap:.8vw; margin:.7vh 0; background:#fff; border:1px solid #e2e2da; border-radius:8px; padding:.7vh 1vw; }
  .wx .wq { font-weight:600; font-size:1.35vw; min-width:13vw; }
  .wx .we { font-family:"SF Mono",Menlo,monospace; font-size:1.05vw; color:#2e5d34; }
  .wx .defn { color:var(--muted); font-size:.85em; font-family:-apple-system,sans-serif; }
  table { border-collapse:collapse; font-size:1.6vw; margin:1vh 0; }
  th,td { padding:.32em .9em; text-align:center; border-bottom:1px solid #e0e0d8; }
  th:first-child, td.lbl { text-align:left; color:var(--muted); }
  tr.win td { background:#e8f5e9; font-weight:700; color:var(--accent); } tr.win td.lbl { color:var(--accent); }
  .two { display:flex; gap:3vw; } .two > div { flex:1; background:#fff; border:1px solid #e0e0d8; border-radius:12px; padding:1.4vh 1.4vw; } .two p { font-size:1.45vw; margin:0; }
  .notes { position:fixed; left:0; right:0; bottom:0; background:#11130f; color:#cfd3c8; font-size:14px; line-height:1.4; padding:10px 7vw; display:none; }
  body.show-notes .notes { display:block; } body.show-notes .slide[data-active] { padding-bottom:15vh; }
  .hud { position:fixed; bottom:10px; right:14px; color:#8a8f80; font-size:12px; z-index:10; }
  .progress { position:fixed; top:0; left:0; height:4px; background:var(--accent); z-index:10; transition:width .2s; }
</style></head>
<body>
<div class="progress" id="prog"></div>
${slideHtml}
<div class="hud" id="hud"></div>
<script>
  const slides=[...document.querySelectorAll('.slide')]; let i=0;
  function show(n){ slides[i].removeAttribute('data-active'); i=Math.max(0,Math.min(slides.length-1,n)); slides[i].setAttribute('data-active','');
    document.getElementById('prog').style.width=((i+1)/slides.length*100)+'%';
    document.getElementById('hud').textContent=(i+1)+' / '+slides.length; }
  document.addEventListener('keydown',e=>{
    if(['ArrowRight','PageDown',' '].includes(e.key)){e.preventDefault();show(i+1);}
    else if(['ArrowLeft','PageUp'].includes(e.key)){e.preventDefault();show(i-1);}
    else if(e.key==='Home')show(0); else if(e.key==='End')show(slides.length-1);
    else if(e.key.toLowerCase()==='n')document.body.classList.toggle('show-notes');
  });
  document.addEventListener('click',e=>{ if(!e.target.closest('a'))show(i+(e.clientX>innerWidth/2?1:-1)); });
  show(0);
</script>
</body></html>`;

mkdirSync('talk', { recursive: true });
writeFileSync('talk/index.html', html);
console.log(`wrote talk/index.html — ${slides.length} slides`);
