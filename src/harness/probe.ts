/**
 * One-off live probe — run with: pnpm probe
 *
 * Settles the two open questions before any real run:
 *  1. Does a LIVE provider fill the recursive z.lazy TimeExpr union as structured
 *     output (and the flat IsoValue union), such that our resolver resolves it?
 *  2. Do the configured model IDs resolve on the router? (claude-opus-4-8 is newer
 *     than @mastra/core 1.41's registry snapshot — verified here.)
 *
 * Uses MINI models for the schema probe (cheap), plus one 1-item call per FRONTIER
 * model purely to validate routing. Skips providers with no API key.
 */
import { RequestContext } from '@mastra/core/request-context';
import { CONFIG, type Provider, type Tier } from '../../experiment.config.js';
import { ALL_CASES, anchorIso, PROMPT_DEFINITIONS } from '../datasets/cases/index.js';
import { DEFAULT_CONVENTIONS } from '../scate-lite/conventions.js';
import { toEnvelope } from '../representation/translation-schema.js';
import { scoreTranslation } from '../scoring/translation.js';
import { mastra } from '../mastra/index.js';
import { modelFor } from '../mastra/models.js';

const PROBE_ITEMS = ['R2-01', 'G5-04', 'C4-01'] as const; // arithmetic · set · custom-preset

const keyFor: Record<Provider, string | undefined> = {
  openai: process.env.OPENAI_API_KEY,
  anthropic: process.env.ANTHROPIC_API_KEY,
  google: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
};

function rcFor(provider: Provider, tier: Tier, itemId: string): RequestContext {
  const item = ALL_CASES.find((c) => c.id === itemId)!;
  const rc = new RequestContext();
  rc.set('provider', provider);
  rc.set('tier', tier);
  rc.set('anchor', anchorIso(item.anchor));
  if (item.customPresets) rc.set('customPresetsText', PROMPT_DEFINITIONS);
  return rc;
}

async function probeTranslation(provider: Provider, arm: 'iso' | 'ir', itemId: string): Promise<boolean> {
  const item = ALL_CASES.find((c) => c.id === itemId)!;
  const agent = mastra.getAgentById(arm === 'ir' ? 'translate-ir' : 'translate-iso');
  const label = `${provider}/${CONFIG.tier} ${arm.toUpperCase()} ${itemId} "${item.query}"`;
  try {
    let res;
    try {
      res = await agent.generate(item.query, { requestContext: rcFor(provider, CONFIG.tier, itemId) });
    } catch (err) {
      if (/timeout|fetch failed|ECONN/i.test((err as Error).message)) {
        res = await agent.generate(item.query, { requestContext: rcFor(provider, CONFIG.tier, itemId) }); // one retry on transient network errors
      } else throw err;
    }
    const raw = (res as { object?: unknown }).object;
    const obj = raw == null ? undefined : toEnvelope(raw);
    if (!obj) {
      console.log(`✗ ${label}: no structured object on result (keys: ${Object.keys(res as object).slice(0, 12).join(', ')})`);
      return false;
    }
    const ctx = {
      anchor: anchorIso(item.anchor),
      conventions: { ...DEFAULT_CONVENTIONS, ...item.conventionsOverride },
      ...(item.customPresets ? { customPresets: item.customPresets } : {}),
      window: CONFIG.window,
    };
    const score = scoreTranslation(obj, item, ctx, arm);
    const summary =
      obj.kind === 'none'
        ? 'kind=none'
        : `resolved → ${score.resolved?.intervals.map((i) => `[${i.start} → ${i.end})`).join(', ') ?? '(unresolvable)'}`;
    console.log(`✓ ${label}\n    output: ${JSON.stringify(obj).slice(0, 220)}\n    ${summary}\n    exact=${score.exact} sev=${score.severity} ambiguity=${obj.kind === 'time' ? obj.ambiguity : '-'}`);
    return true;
  } catch (err) {
    console.log(`✗ ${label}: ${(err as Error).message.slice(0, 300)}`);
    return false;
  }
}

async function probeModelId(provider: Provider, tier: Tier): Promise<void> {
  const model = modelFor(provider, tier);
  const agent = mastra.getAgentById('translate-iso');
  const rc = rcFor(provider, tier, 'R2-01');
  rc.set('tier', tier);
  try {
    const res = await agent.generate('three days ago', { requestContext: rc });
    const ok = Boolean((res as { object?: unknown }).object);
    console.log(`✓ model id resolves: ${model} (structured output: ${ok ? 'yes' : 'NO'})`);
  } catch (err) {
    console.log(`✗ model id FAILED: ${model}: ${(err as Error).message.slice(0, 200)}`);
  }
}

const providers = CONFIG.providers.filter((p) => {
  if (!keyFor[p]) console.log(`(skipping ${p}: no API key)`);
  return Boolean(keyFor[p]);
});

console.log(`\n── schema probe (tier: ${CONFIG.tier}) ──`);
let pass = 0;
let total = 0;
for (const provider of providers) {
  for (const arm of ['iso', 'ir'] as const) {
    for (const itemId of PROBE_ITEMS) {
      total++;
      if (await probeTranslation(provider, arm, itemId)) pass++;
    }
  }
}

console.log(`\n── frontier model-id check (1 tiny call each) ──`);
for (const provider of providers) await probeModelId(provider, 'frontier');

console.log(`\nschema probe: ${pass}/${total} calls produced a valid structured object`);
process.exit(pass === total ? 0 : 1);
