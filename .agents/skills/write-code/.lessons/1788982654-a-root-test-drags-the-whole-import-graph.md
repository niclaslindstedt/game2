---
title: A root-suite test importing a renderer module drags its WHOLE import graph into the DOM-free program — one `document` anywhere fails `make lint`
date: 2026-09-09
scope: tests/, pwa/src/game/
concepts: [test-conventions, tooling, lint-coverage, rendering, renderer-seam]
---

The root `tsconfig.json` has no `dom` lib, on purpose. `tests/` may import
`pwa/src/game/*` — plenty do — but the typecheck then pulls in everything those
modules import, transitively. One module in that graph touching `document` is
four `TS2584: Cannot find name 'document'` errors in a file you never opened,
and `make lint` fails on code your diff does not contain.

`pwa/src/game/textures.ts` is the usual culprit: every canvas-painted texture
lives there, so any renderer module that draws lettering or a chevron takes the
whole suite down with it.

Stubbing `globalThis.document` in the test does NOT fix this. The stub satisfies
the RUNTIME (vitest goes green) and the typecheck still fails, because tsc is
looking at `textures.ts`'s own source. Two green commands and one red one is
the confusing shape this arrives in.

The fix is the repo's existing DOM-free-payload split, applied to the module
you want tested: put the geometry and the numbers in one file with no
`document` in its graph, leave the canvas half next door, and have the test
import the DOM-free one. `finish-gate.ts` was split this way —
`gate-furniture.ts` carries the legs, the bales and the guns; the banner's
painted cloth stays behind. Importing `three` itself is fine: `BoxGeometry`,
`Mesh` and `Group` all build headless, so a test can assert on real meshes.

Run `make lint` (not just `npx tsc --noEmit -p pwa/tsconfig.json`, which HAS
the dom lib and passes) before believing a new test file is clean.
