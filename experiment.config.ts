/**
 * Central experiment config — the single knob.
 * To add a model: set one env var (or edit `models`) and re-run.
 *
 * Tiers: every provider has a frontier and a mini model. ALL preliminary work (probes,
 * smoke runs) uses TIER=mini to stay cheap; the full Phase 1/2 runs flip to frontier
 * (and can be run at both tiers for a frontier-vs-mini comparison).
 * Google is configured but off by default (no key yet) — set PROVIDERS to include it.
 */
export type Provider = 'openai' | 'anthropic' | 'google';
export type Tier = 'mini' | 'frontier';

export const CONFIG = {
  providers: (process.env.PROVIDERS ?? 'openai,anthropic').split(',') as Provider[],
  tier: (process.env.TIER ?? 'mini') as Tier,
  models: {
    openai: {
      frontier: process.env.MODEL_OPENAI ?? 'openai/gpt-5.5',
      mini: process.env.MODEL_OPENAI_MINI ?? 'openai/gpt-5.4-mini',
    },
    anthropic: {
      // claude-opus-4-8 is newer than @mastra/core 1.41's registry snapshot — verified
      // live by the step-5 probe; fall back to claude-opus-4-7 if the router rejects it.
      frontier: process.env.MODEL_ANTHROPIC ?? 'anthropic/claude-opus-4-8',
      mini: process.env.MODEL_ANTHROPIC_MINI ?? 'anthropic/claude-haiku-4-5',
    },
    google: {
      frontier: process.env.MODEL_GOOGLE ?? 'google/gemini-3.5-flash',
      mini: process.env.MODEL_GOOGLE_MINI ?? 'google/gemini-3.5-flash-lite',
    },
  } satisfies Record<Provider, Record<Tier, string>>,
  reps: Number(process.env.REPS ?? 5), // K (determinism)
  concurrency: Number(process.env.CONCURRENCY ?? 5),
  window: { backMonths: 12, forwardMonths: 12 }, // convention C13: anchor ± 1 year
  clarifyThreshold: 4, // ambiguity rating that counts as "asked to clarify"
  fixtures: (process.env.FIXTURES ?? 'off') as 'off' | 'record' | 'replay',
  smokeOnly: process.env.SMOKE === '1',
} as const;
