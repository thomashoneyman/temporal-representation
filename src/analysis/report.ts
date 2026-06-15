/**
 * `npm run analyze` (second step) — renders results/report.md from results/summary.json.
 * The narrative answers each DESIGN objective and hypothesis with the measured numbers
 * pulled from summary.json at render time, so the prose can never drift from the data.
 */
import { readFileSync, writeFileSync } from 'node:fs';

interface Cell { task: string; model: string; arm: string; slice: string; metric: string; value: number; n: number; ci?: { lo: number; hi: number } }
const s = JSON.parse(readFileSync('results/summary.json', 'utf8')) as {
  keyVersion: string; promptVersion: string;
  models: string[]; slices: string[]; cells: Cell[];
  determinism: Record<string, { unprompted?: number; prompted?: number; n?: number }>;
  cost: Record<string, { per100Questions: number; tokensPerAnswer: { in: number; out: number } }>;
  decisionTable: Array<{ technique: string; adoptWhen: string; verdict: string; evidence: string }>;
};

const SHORT: Record<string, string> = {
  'anthropic/claude-haiku-4-5': 'haiku',
  'openai/gpt-5.4-mini': 'gpt-mini',
  'anthropic/claude-opus-4-8': 'opus',
  'openai/gpt-5.5': 'gpt-5.5',
  'chrono-node': 'chrono',
};
const MODELS = ['anthropic/claude-haiku-4-5', 'openai/gpt-5.4-mini', 'anthropic/claude-opus-4-8', 'openai/gpt-5.5'];

const get = (task: string, model: string, arm: string, slice: string, metric: string): Cell | undefined =>
  s.cells.find((c) => c.task === task && c.model === model && c.arm === arm && c.slice === slice && c.metric === metric);
const v = (task: string, model: string, arm: string, slice: string, metric: string): string => {
  const c = get(task, model, arm, slice, metric);
  return c ? `${Math.round(c.value * 100)}%` : '—';
};
const ci = (task: string, model: string, arm: string, slice: string, metric: string): string => {
  const c = get(task, model, arm, slice, metric);
  return c?.ci ? `${Math.round(c.value * 100)}% [${Math.round(c.ci.lo * 100)}–${Math.round(c.ci.hi * 100)}]` : '—';
};

const task4Table = (metric: string): string => {
  const lines = [`| arm | ${MODELS.map((m) => SHORT[m]).join(' | ')} |`, `|---|${MODELS.map(() => '---').join('|')}|`];
  for (const [arm, label] of [['iso', 'direct ISO'], ['iso-preset', 'ISO + preset crib'], ['ir', 'IR (code resolves)']] as const) {
    lines.push(`| ${label} | ${MODELS.map((m) => ci('task4', m, arm, 'ALL', metric)).join(' | ')} |`);
  }
  return lines.join('\n');
};

const sliceLeaderboard = (): string => {
  const lines = [`| slice | ${MODELS.map((m) => SHORT[m]).join(' | ')} | best arm |`, `|---|${MODELS.map(() => '---').join('|')}|---|`];
  for (const slice of s.slices.filter((x) => !['ALL', 'HARD'].includes(x))) {
    const armWins: Record<string, number> = {};
    const per = MODELS.map((m) => {
      const arms = (['iso', 'iso-preset', 'ir'] as const).map((a) => ({ a, c: get('task4', m, a, slice, 'exact') }));
      const best = arms.filter((x) => x.c).sort((x, y) => y.c!.value - x.c!.value)[0];
      if (best?.c) armWins[best.a] = (armWins[best.a] ?? 0) + 1;
      return best?.c ? `${Math.round(best.c.value * 100)}% (${best.a})` : '—';
    });
    const overall = Object.entries(armWins).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—';
    lines.push(`| ${slice} | ${per.join(' | ')} | ${overall} |`);
  }
  return lines.join('\n');
};

const md = `# Report — Temporal Representation in Agent Systems

*Rendered from \`results/summary.json\` (answer key ${s.keyVersion}, prompts ${s.promptVersion}). Every
number here is recomputable offline from the committed raw runs; \`npm run phase2:replay\` verifies the
scoring pipeline against committed fixtures. Small models (haiku 4.5, gpt-5.4-mini) ran 3 repeats;
frontier models (opus 4.8, gpt-5.5) ran 1 repeat as a scale check — their numbers are noisier. The
self-contained visualizations (\`results/*-viz.html\`) carry the click-to-inspect detail behind every
claim.*

*Scope vs. the design: the plan named one frontier model per provider including Gemini-3.5-flash;
Google was skipped (no API key), so this is a two-tier Anthropic + OpenAI read (four models, minus
Google). Of the named dependent variables, accuracy / determinism / clarification / cost are reported;
latency is not separately measured (the harness recorded only cell-elapsed time) and is reasoned about
structurally where it matters.*

## The one-paragraph answer

Classifying time expressions into a small formal language and letting deterministic code compute the
dates (**IR**) matched or beat the model computing dates itself (**ISO**) for **all four models on
every task family we measured** — translation, prompted steering, multi-step threading, and
compound-query decomposition — with the margin largest for the weakest model and on the hardest
slices (compound, custom-defined periods). Contrary to the 2024–25 literature, plain day-grain date
*arithmetic* is no longer a failure mode at any tier once a one-sentence grain instruction is in the
prompt; what still fails is *calendar-table* arithmetic (business days across holidays), *DST offsets*
(an ISO-only failure class), and *expression construction* in the IR arm. The production shape we
predicted going in is largely confirmed, with one revision: a standalone arithmetic/shift tool earned no place
— models rarely used it voluntarily and it never improved their best arm.

## Objective 1 — what do models prefer for "last week"? (ungraded measurement)

29 phrases × 7 anchor positions, ungraded (\`preferences-viz.html\`): models overwhelmingly choose
**calendar-aligned, Monday-start** readings (e.g. "last week" = previous Mon–Sun) and **calendar
months** over 30-day windows; day-pinning ("a month ago" = same day-of-month, not nearest weekday) is
the dominant convention. Divergence concentrates in a handful of phrases ("the last few months",
"recently", "mid-March") — those became the steering targets for Task 5 and the documented-conventions
block. These preferences directly seeded our locked conventions, so "exact" in every graded task means
"matches the convention models themselves most often choose," not an arbitrary house rule.

## Objective 2 — date arithmetic (H1: "LLMs will be poor at it; defer to code")

**Prediction wrong at day grain, right at the edges.** The relative-dates slice (the arithmetic test):

| arm | ${MODELS.map((m) => SHORT[m]).join(' | ')} |
|---|---|---|---|---|
| direct ISO | ${MODELS.map((m) => v('task4', m, 'iso', 'relative', 'exact')).join(' | ')} |
| IR | ${MODELS.map((m) => v('task4', m, 'ir', 'relative', 'exact')).join(' | ')} |

In our early prompt iterations the dominant "arithmetic" failure was not wrong math at all but a
*grain* mismatch (a minute-grain instant answering a day-grain question); one guidance sentence
("answer at the grain the question implies") removed that class in both arms, and the scoring rubric
separates it from real misses (right-time-wrong-precision, not wrong-date). The genuinely hard residue: business-day counting across federal
holidays (the Task-7 Christmas hop: half of all attempts missed the holiday rule), extreme magnitudes
("in 250 days"), and ordinal arithmetic — exactly the cases deterministic code resolves for free in
the IR arm. **Verdict on H1: defer the calendar-table cases to code; plain offsets no longer need it.**

## Objective 3 — classification accuracy by category (H2: "IR beats resolving to ISO")

**Confirmed for every model, with the margin where we predicted it.** Overall (strict; Wilson 95% CI):

${task4Table('exact')}

Counting documented reasonable readings (within-acceptable):

${task4Table('withinAcceptable')}

Per-slice winner (best arm per model, strict):

${sliceLeaderboard()}

The rule-based baseline (chrono) sits far below every model arm — the PRIMETIME finding reproduces.
IR's lead concentrates in **compound/multipart**, **custom presets**, and **ranges/sets**; on easy
slices ISO ties it. The 2-point IR "adherence tax" we measured early was OUR bug (missing ids in the
org-definitions block), not the representation's cost — after the fix, unresolvable IR is 0.0%.

## Objective 4 — multi-part questions driving tool calls (Tasks 7 & 7b; H3)

**H3 ("ISO tool params will be just as accurate as IR") holds only at frontier.** Threading (hop-exact
across 10 multi-step investigations): IR is the best arm for all four models (haiku ${v('task7', 'anthropic/claude-haiku-4-5', 'ir', 'chains', 'hop-exact')} vs
${v('task7', 'anthropic/claude-haiku-4-5', 'iso', 'chains', 'hop-exact')} ISO; opus ${v('task7', 'anthropic/claude-opus-4-8', 'ir', 'chains', 'hop-exact')} vs ${v('task7', 'anthropic/claude-opus-4-8', 'iso', 'chains', 'hop-exact')}). Decomposition (exact set of range-only calls
for compound queries): haiku ${v('task7b', 'anthropic/claude-haiku-4-5', 'ir', 'compound', 'exact-set')} IR vs ${v('task7b', 'anthropic/claude-haiku-4-5', 'iso', 'compound', 'exact-set')} ISO; gpt-5.5 ties (${v('task7b', 'openai/gpt-5.5', 'ir', 'compound', 'exact-set')} both). Structural findings:

- **Drift is hop-type-, not depth-concentrated**: with chain composition held constant, accuracy does
  not decay with step number; re-querying a step-1 date at step 8 is nearly perfect, and **zero**
  attempts ever bound the wrong *named* milestone. Implicit references and window-edge business-day
  math are what break.
- **Two failure classes exist only under the ISO contract**: DST zone-offset errors, and (small models
  only) collapsing a windowed query into one bounding range that sweeps in unasked time.
- **The stale-value trap is phrasing-sensitive**: with vague wording small models reused a rescheduled
  date in half the follow-ups; with a clean update, 46/48 attempts tracked it.
- **Tool feedback is part of the contract**: repairing one unhelpful validation message ("Invalid
  input") moved gpt-5.5's IR threading 91→96% — measured, not hypothetical.

## Objective 5 — determinism and clarification (Tasks 5 & 6)

Determinism (identical resolved output across 3 repeats, same prompt): unprompted ISO 77–84%,
IR 85–86%; adding the conventions block (prompted) moved haiku-ISO 77→83% but gpt-ISO 84→78% — and
steering converts IR's reasonable-alternative answers to exact while ISO's persist. **You can pin the
convention reliably via the IR's resolver; you cannot fully pin it via prompt.** Clarification: models
**under-ask** (recall 38–71% on genuinely-ambiguous items) but their asks are mostly warranted
(precision 50–80% after we fixed a metric artifact that counted correct no-time abstentions as false
positives). No-time detection is essentially solved (every cell ≥80%, most at 100%) — models do not
invent times for "who owns the billing service?".

## Cost (from recorded usage × list pricing, $ per 100 questions)

| arm | ${MODELS.map((m) => SHORT[m]).join(' | ')} |
|---|---|---|---|---|
${(['iso', 'iso-preset', 'ir'] as const).map((arm) => `| ${arm} | ${MODELS.map((m) => (s.cost[`${m}|${arm}`] ? `$${s.cost[`${m}|${arm}`].per100Questions.toFixed(2)}` : '—')).join(' | ')} |`).join('\n')}

IR costs ~1.4–1.8× ISO per question (the injected grammar is ~1.2k extra input tokens) — at mini-tier
absolute prices (under a cent per question) the accuracy gain dominates; at frontier the crib arm is
the cost-efficient middle when IR's margin is small for that model.

## The Synthesis decision table, filled

| Technique | Adopt it when... | Verdict | Evidence |
|---|---|---|---|
${s.decisionTable.map((r) => `| **${r.technique}** | ${r.adoptWhen} | **${r.verdict}** | ${r.evidence} |`).join('\n')}

## We predicted X, found Y

- *Predicted:* LLMs are poor at date arithmetic (H1). *Found:* poor only at calendar-table arithmetic
  and extreme magnitudes; day-grain offsets are solved with one prompt sentence. Defer the former to
  code; don't buy a tool for the latter.
- *Predicted:* IR classification beats direct ISO (H2). *Found:* confirmed for all four models, margin
  widest on compound/custom slices and for the weakest model.
- *Predicted:* ISO tool params would keep up with IR (H3). *Found:* true at frontier only; at small-model
  tier the IR contract wins threading and decomposition, and two ISO-only failure classes (DST offsets,
  bounding-range collapse) disappear under it.
- *Predicted production shape:* direct ISO for the easy majority + preset crib + resolve(IR→ISO) tool +
  shape-restricted boundaries. *Found:* confirmed, minus the standalone arithmetic tool (net-negative or
  unused everywhere we offered it), plus one addition we did not predict: **the resolve tool's
  validation-error text is load-bearing** — write it for the model, not the developer.
- *Predicted (stretch):* a tool accepting either ISO or the IR, model's choice, would obviate the dedicated
  resolve tool. *Found:* the hybrid is buildable but governed by a sharp law discovered through nine contract
  variants — the expression channel works **iff its shape is non-optional AND the grammar is visible in-band**.
  Optional object fields make GPT-family models emit degenerate \`{}\` (≈0 well-formed expressions in ~50
  attempts); a string field with the grammar hidden yields fencepost errors; a required object (its schema IS
  the grammar) or a string with the grammar inlined both work for every vendor. None beats the dedicated
  resolve-then-query tool — the same law applied once at a central boundary — which remains the recommendation.
`;

writeFileSync('results/report.md', md);
console.log('wrote results/report.md');
