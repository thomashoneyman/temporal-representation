/**
 * The dynamic translation agents: ONE agent per arm, not
 * one per model×arm. The provider/tier (→ model), anchor, org presets, optional crib,
 * and optional convention block all arrive per item via requestContext, so a single
 * ISO agent and a single IR agent cover every provider and every prompt modifier
 * (ISO-PRESET = ISO + crib; Task 5 = + convention).
 */
import { Agent } from '@mastra/core/agent';
import type { RequestContext } from '@mastra/core/request-context';
import type { Provider, Tier } from '../../experiment.config.js';
import { renderTranslationInstructions, type Arm } from '../datasets/render.js';
import { TranslationIR, TranslationISO } from '../representation/translation-schema.js';
import { lowReasoning, modelFor } from './models.js';

const rcGet = <T = string>(rc: RequestContext, key: string): T | undefined =>
  rc.get(key) as T | undefined;

const promptParts = (rc: RequestContext) => ({
  anchor: rcGet(rc, 'anchor') ?? '(missing anchor)',
  customPresetsText: rcGet(rc, 'customPresetsText'),
  crib: rcGet(rc, 'crib'),
  convention: rcGet(rc, 'convention'),
});

const armOf = (rc: RequestContext, fallback: Arm): Arm => rcGet<Arm>(rc, 'arm') ?? fallback;

function makeTranslationAgent<S extends typeof TranslationISO | typeof TranslationIR>(
  id: 'translate-iso' | 'translate-ir',
  schema: S,
): Agent {
  const baseArm: Arm = id === 'translate-ir' ? 'ir' : 'iso';
  return new Agent({
    id,
    name: id,
    description: `Translation arm (${baseArm}): emits the ${baseArm.toUpperCase()} representation as a structured final answer.`,
    model: ({ requestContext }) =>
      modelFor(
        (rcGet<Provider>(requestContext, 'provider') ?? 'anthropic') as Provider,
        rcGet<Tier>(requestContext, 'tier'),
      ),
    instructions: ({ requestContext }) =>
      renderTranslationInstructions(armOf(requestContext, baseArm), promptParts(requestContext)),
    defaultOptions: ({ requestContext }) => {
      const provider = (rcGet<Provider>(requestContext, 'provider') ?? 'anthropic') as Provider;
      return {
        providerOptions: lowReasoning(provider, rcGet<Tier>(requestContext, 'tier')) as never,
        // ONE structured-output mechanism everywhere: jsonPromptInjection (the schema
        // travels in the prompt; zod validates client-side). Probe-verified rationale:
        // native modes are provider-lumpy — Anthropic's output_config rejects the
        // `definitions` the recursive TimeExpr needs, OpenAI's strict response_format
        // rejects `oneOf` AND optional properties. A uniform mechanism means schema
        // transport never confounds the arm or provider comparisons; schema-adherence
        // itself becomes a measurable failure mode (counted as `unresolvable`).
        // (Boundary cast: the OUTPUT generic can't infer through the union of arms.)
        structuredOutput: { schema, jsonPromptInjection: true } as never,
        maxSteps: 1,
      };
    },
  });
}

export const translateISO = makeTranslationAgent('translate-iso', TranslationISO);
export const translateIR = makeTranslationAgent('translate-ir', TranslationIR);

export const buildAgents = () => ({ translateISO, translateIR });
