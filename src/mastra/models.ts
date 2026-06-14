/**
 * Model registry: provider+tier → router model string, plus per-provider
 * low-reasoning options (reasoning enabled at its lowest setting — the kind of
 * default agent a typical application ships; an experiment-wide constant so it can
 * never confound an arm comparison).
 */
import { CONFIG, type Provider, type Tier } from '../../experiment.config.js';

export const modelFor = (provider: Provider, tier: Tier = CONFIG.tier): string =>
  CONFIG.models[provider][tier];

/**
 * Lowest reasoning setting, per MODEL (not just provider): Anthropic's thinking API
 * changed at opus-4-8 — `{type:'enabled', budgetTokens}` is rejected in favor of
 * `{type:'adaptive'}` + `output_config.effort` (probe-verified). Typed loosely; cast
 * at the boundary.
 */
export function lowReasoning(provider: Provider, tier: Tier = CONFIG.tier): Record<string, Record<string, unknown>> {
  const model = modelFor(provider, tier);
  switch (provider) {
    case 'openai':
      return { openai: { reasoningEffort: 'low' } };
    case 'anthropic':
      return model.includes('opus-4-8')
        ? { anthropic: { thinking: { type: 'adaptive' }, output_config: { effort: 'low' } } }
        : { anthropic: { thinking: { type: 'enabled', budgetTokens: 1024 } } };
    case 'google':
      return { google: { thinkingConfig: { thinkingBudget: 512 } } };
  }
}

/** $ per 1M tokens {in, out} — from mastra.ai/models, checked 2026-06-12. */
export const PRICING: Record<string, { in: number; out: number }> = {
  'anthropic/claude-haiku-4-5': { in: 1, out: 5 },
  'openai/gpt-5.4-mini': { in: 0.25, out: 2 },
  'anthropic/claude-opus-4-8': { in: 5, out: 25 },
  'openai/gpt-5.5': { in: 5, out: 30 },
};
