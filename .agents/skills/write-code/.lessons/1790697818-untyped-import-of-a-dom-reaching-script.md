---
title: A root test that needs a scripts/*.mjs whose imports reach a DOM module takes it through a NON-LITERAL dynamic import — the typecheck never follows it, vitest runs it fine
date: 2026-09-29
scope: tests/, scripts/lib/
concepts: [test-conventions, typecheck, dom, imports]
---

`tests/prop_models_test.ts` wanted the driver's data script
(`scripts/lib/prop-model-data.mjs`) to compare every model against the
code's own bounds. That script imports `traffic-fleet.ts`, `train.ts` and
kin, which import `textures.ts`, which names `document` — so a literal
`import { propModelData } from "../scripts/lib/prop-model-data.mjs"`
fails `make build`'s whole-program typecheck twice over: TS7016 (no
declaration for the `.mjs`) and TS2584 (`document`) from three files away,
while vitest runs green. The line that holds: `const PROP_DATA =
"../scripts/lib/prop-model-data.mjs"; const mod = (await
import(PROP_DATA)) as { … }` — a specifier that is a value is not
resolved by the type program, the module is typed by the cast alone, and
at run time (Node, where `textures.ts` is only imported, never called)
it loads exactly as the driver loads it. Keep the cast honest and small,
and keep every tint table and drawing module out of the test's static
imports.
