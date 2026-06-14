/**
 * Prompt inspection (offline, no keys): swaps a mock model into the translation
 * agents and prints VERBATIM what the provider would receive — system instructions,
 * Mastra's injected JSON-schema block (jsonPromptInjection), and the user message.
 * Writes the full text to artifacts/prompt-previews/ and prints it.
 *
 * Run: pnpm show-prompt
 */
import { Agent } from '@mastra/core/agent';
import { mkdirSync, writeFileSync } from 'node:fs';
import { ALL_CASES, anchorIso, PROMPT_DEFINITIONS } from '../datasets/cases/index.js';
import { renderTranslationInstructions, type Arm } from '../datasets/render.js';
import { TranslationIR, TranslationISO } from '../representation/translation-schema.js';

const ITEM_ID = process.env.ITEM ?? 'C4-01'; // custom-preset item: shows the org-defs block too
const item = ALL_CASES.find((c) => c.id === ITEM_ID)!;

function captureModel(sink: { prompt?: unknown }) {
  return {
    specificationVersion: 'v2',
    provider: 'inspect',
    modelId: 'inspect',
    supportedUrls: {},
    async doGenerate(opts: { prompt: unknown }) {
      sink.prompt = opts.prompt;
      return {
        content: [{ type: 'text', text: '{"kind":"none","value":null,"ambiguity":null,"reasoning":"inspection"}' }],
        finishReason: 'stop',
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        warnings: [],
      };
    },
    async doStream() {
      throw new Error('not used');
    },
  };
}

function renderMessages(prompt: unknown): string {
  const msgs = prompt as Array<{ role: string; content: unknown }>;
  return msgs
    .map((m) => {
      const text = Array.isArray(m.content)
        ? (m.content as Array<{ type: string; text?: string }>).map((p) => p.text ?? `[${p.type}]`).join('\n')
        : String(m.content);
      return `┌─ role: ${m.role} ${'─'.repeat(Math.max(0, 60 - m.role.length))}\n${text}`;
    })
    .join('\n\n');
}

mkdirSync('artifacts/prompt-previews', { recursive: true });

for (const arm of ['iso', 'ir'] as Arm[]) {
  const sink: { prompt?: unknown } = {};
  const agent = new Agent({
    id: `inspect-${arm}`,
    name: `inspect-${arm}`,
    model: captureModel(sink) as never,
    instructions: renderTranslationInstructions(arm, {
      anchor: anchorIso(item.anchor),
      customPresetsText: item.customPresets ? PROMPT_DEFINITIONS : undefined,
    }),
    defaultOptions: {
      structuredOutput: { schema: arm === 'ir' ? TranslationIR : TranslationISO, jsonPromptInjection: true } as never,
      maxSteps: 1,
    },
  });
  await agent.generate(item.query);
  const rendered = `EXACT PROMPT — arm=${arm.toUpperCase()}, item=${item.id} ("${item.query}"), anchor=${anchorIso(item.anchor)}\n\n${renderMessages(sink.prompt)}\n`;
  const path = `artifacts/prompt-previews/${arm}-${item.id}.txt`;
  writeFileSync(path, rendered);
  console.log(`\n${'═'.repeat(80)}\n${rendered}`);
  console.log(`(saved to ${path})`);
}
