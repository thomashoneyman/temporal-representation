# `src/representation` — the output contracts under test

The exact schemas models are held to, in both experimental modes. Small on purpose:
these files ARE the experiment's independent variable.

| file | mode | contract |
|---|---|---|
| `translation-schema.ts` | Translation tasks (final answer, structured output) | One shared envelope — `{kind: 'none'}` or `{kind: 'time', value, ambiguity 1–5, reasoning}` — where `value` is concrete ISO (`TranslationISO`) or a core-grammar ScateLite expression (`TranslationIR`). The arms differ **only** in the value language. |
| `tool-schemas.ts` | Threading tasks (tool-call arguments) | `QueryRangeArgs` (the range-only downstream tool, all arms), `ResolveRangeArgs` (IR arm: unresolved expression, shape-enforced at the boundary), `ShiftArgs` (the deterministic arithmetic helper whose voluntary usage we measure). |

Fairness notes baked into the schemas:
- The IR translation schema uses the **core** grammar profile — the `iso` leaf is
  excluded (recursively), so the IR arm cannot fall back to computing concrete dates.
- Both translation arms carry the identical ambiguity/reasoning burden, so neither
  pays extra tokens for metadata.
