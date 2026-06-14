# tests/

324 tests, all offline — no API keys, no network. They are the proof that the
deterministic core (resolver, calendar math, scoring) is correct, which is what makes
"code computes the dates" a meaningful experiment arm.

| suite | what it pins |
|---|---|
| `interval.test.ts` | half-open interval primitives, IoU, set-F1 — including hand-worked examples |
| `calendar.test.ts` | week starts, fiscal quarters, the 11-federal-holiday table against hand-verified dates, business-day stepping, the pin-day month-arithmetic assumption (convention C7) |
| `ir-schema.test.ts` | the `TimeExpr` grammar: both profiles (core excludes the `iso` leaf recursively — the H1/H2 fairness boundary), bounds, and that the schema compiles to provider-safe JSON (`anyOf`, never `oneOf`) |
| `oracle.test.ts` | 40 grammar-level cases hand-checked in a pre-build lab exercise, with the documented divergences where the locked conventions superseded the lab |
| `answer-key.test.ts` | the full dataset: every item's key re-derives from its canonical expression, structural counts, DST boundaries inside the key |
| `handlabel.test.ts` | the independently hand-derived sample — keys computed by a person, not the resolver, so resolver and key cannot share a bug |
| `crib-sheets.test.ts` | the pre-resolved preset crib against hand-derived fixtures |
| `scoring.test.ts` | the 0–6 severity ladder on worked examples: fenceposts vs include-today readings, grain misses, wrong-direction reflection, set coverage-equality |
| `prompt-parity.test.ts` | fairness guards: the arms' prompts differ only where the experiment intends; no dataset phrasing leaks into any prompt surface (the contamination test) |
| `production-scorer.test.ts` | the model-free guardrail (`checkTimeArgs`) flags |

Two ideas worth stealing for any eval repo: the **hand-label sample** (a slice of the
answer key derived by a human with no resolver involved — catches shared-bug
circularity) and the **contamination test** (grep every rendered prompt and schema
description against every dataset query — it caught three real teach-the-test leaks
here).
