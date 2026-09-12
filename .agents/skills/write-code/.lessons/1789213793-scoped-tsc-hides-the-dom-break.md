---
title: `tsc -p pwa/tsconfig.json` cannot see the break a new pwa→pwa import causes — the ROOT program has no DOM, and that is the one that checks engine and tests
date: 2026-09-12
scope: pwa/src/game, tests, tsconfig.json
concepts: [typecheck, tsconfig, imports, dom, ci, layering]
---

AGENTS.md says to scope the linter and never the typechecker. The reason is
usually stated as "a changed signature breaks its CALLERS". There is a
second reason, and it bites on a change that alters no signature at all:

There are TWO programs. `pwa/tsconfig.json` has `lib: dom`. The ROOT one
does not — it checks `engine/` and `tests/`, which are DOM-free by design —
and it reaches into `pwa/` anyway, because tests import renderer modules
directly (`tests/snowpack_test.ts` imports `pwa/src/game/snow-marks.ts`).

So adding ONE import between two files that both already live in `pwa/` can
turn the root program red, if the new edge pulls a DOM-touching module into
a graph the root program walks. `snow-marks.ts` importing a constant from
`car-mesh.ts` did exactly that: car-mesh builds the body out of canvas
textures, so `document` arrived in a program with no `lib.dom`, and CI
failed on `textures.ts` — a file the diff never touched, which reads as
someone else's breakage until you notice which tsconfig is talking.

`npx tsc --noEmit -p pwa/tsconfig.json` is GREEN through all of this. Only
the bare `npx tsc --noEmit` (root, which is what `make lint` runs) sees it.
Run the bare one before pushing anything that adds an import into a module
`tests/` reaches.

The fix is never to widen the root lib. It is to put the shared value in a
DOM-free module both sides import — the repo's standing pattern
(`rumble.ts` → `haptics.ts`, `voice.ts` → `synth.ts`, now `wheel-steer.ts` →
`car-mesh.ts`). A constant that two layers need is a module, not an export
bolted onto whichever file happened to declare it first.
