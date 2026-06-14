/**
 * Prompt-parity guarantees: the arms' rendered instructions may differ ONLY in the
 * contract section (and the crib block for ISO-PRESET). If anyone edits a shared block
 * in one arm's path, or smuggles dataset answers into the prompt, this fails.
 */
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ALL_CASES, anchorIso } from '../src/datasets/cases/index.js';
import { PROMPT_VERSION, cribSheet, renderTranslationInstructions } from '../src/datasets/render.js';
import { TranslationIR, TranslationISO } from '../src/representation/translation-schema.js';

const anchor = anchorIso('A1');
const blocks = (s: string): string[] => s.split('\n\n');

describe('prompt parity across arms', () => {
  it('ISO vs IR differ in exactly one block (the contract)', () => {
    const iso = blocks(renderTranslationInstructions('iso', { anchor }));
    const ir = blocks(renderTranslationInstructions('ir', { anchor }));
    expect(iso.length).toBe(ir.length);
    const differing = iso.filter((b, i) => b !== ir[i]);
    expect(differing).toHaveLength(1); // only the contract section
    expect(iso[0]).toBe(ir[0]); // shared rules + ambiguity scale identical
    expect(iso[2]).toBe(ir[2]); // anchor line identical
  });

  it('ISO vs ISO-PRESET differ only by the crib (block + one contract sentence)', () => {
    const iso = renderTranslationInstructions('iso', { anchor });
    const isoPreset = renderTranslationInstructions('iso-preset', { anchor, crib: cribSheet(anchor) });
    expect(isoPreset).toContain(iso.split('\n\n')[0]); // shared block intact
    expect(isoPreset).toContain('Pre-resolved reference periods:');
    // strip the crib block + the one extra contract sentence → identical to ISO
    const stripped = isoPreset
      .replace(/\n\nPre-resolved reference periods:[\s\S]*$/, '')
      .replace(' A list of pre-resolved common periods is provided; use it when relevant.', '');
    expect(stripped).toBe(iso);
  });

  it('PROMPT_VERSION is a stable 12-hex fingerprint', () => {
    expect(PROMPT_VERSION).toMatch(/^[0-9a-f]{12}$/);
  });
});

describe('no dataset contamination in prompts', () => {
  // Multi-word dataset queries must not appear in the rendered instructions (worked
  // examples in the grammar/schema must use phrasings absent from the dataset).
  // Custom-slice queries are excluded: their org DEFINITIONS legitimately enter the
  // prompt — but only via per-item customPresetsText, which this render omits.
  const multiword = ALL_CASES.filter(
    (c) => c.slice !== 'custom' && c.query.trim().includes(' ') && c.query.length >= 8,
  ).map((c) => c.query.toLowerCase());

  for (const arm of ['iso', 'ir'] as const) {
    it(`${arm} instructions contain no dataset query`, () => {
      const text = renderTranslationInstructions(arm, { anchor }).toLowerCase();
      const leaked = multiword.filter((q) => text.includes(q));
      expect(leaked).toEqual([]);
    });
  }

  // The model also sees the INJECTED JSON SCHEMAS (jsonPromptInjection) — their
  // .describe() strings are prompt surface too. This catches what the template-only
  // scan once missed (an endExclusive example that quoted a dataset item verbatim).
  for (const [name, schema] of [['ISO', TranslationISO], ['IR', TranslationIR]] as const) {
    it(`${name} injected schema contains no dataset query`, () => {
      const text = JSON.stringify(z.toJSONSchema(schema)).toLowerCase();
      const leaked = multiword.filter((q) => text.includes(q));
      expect(leaked).toEqual([]);
    });
  }
});
