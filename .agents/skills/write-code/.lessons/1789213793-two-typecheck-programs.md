---
title: There are TWO typecheck programs and NEITHER is a superset — run `make lint`, which runs both, before any push that changes an import
date: 2026-09-12
scope: pwa/src/game, tests, tsconfig.json, Makefile
concepts: [typecheck, tsconfig, imports, dom, ci, gates]
---

AGENTS.md says to scope the linter and never the typechecker. The reason is
usually given as "a changed signature breaks its CALLERS". There is a
second, sharper reason, and it bites on changes that alter no signature at
all — one import edge is enough. This session broke CI twice, in opposite
directions, by running one of the two programs and calling it verified:

* **Root `tsc --noEmit`** (bare, from the repo root) checks `engine/`,
  `tests/`, and whatever `pwa/` files the tests happen to reach — because
  tests import renderer modules directly. It has **no `lib.dom`**.
* **`tsc --noEmit -p pwa/tsconfig.json`** checks the whole app and **has
  the DOM**.

Neither contains the other, so each misses a whole class of breakage:

1. Checking only the PWA project misses a DOM leak. Adding an import from
   any module that touches `document` (`car-mesh.ts`, `road-mesh.ts`,
   anything reaching `textures.ts`) into a module `tests/` reaches drags
   `document` into a program with no DOM. CI then fails in
   `textures.ts` — a file the diff never touched, which reads as someone
   else's breakage until you notice which tsconfig is talking.
2. Checking only the ROOT misses anything in the app that tests do not
   reach. Moving `ROAD_PAINT` out of `road-mesh.ts` left `terrain.ts`
   importing a name that module now only imports itself. Root tsc: silent,
   because nothing in `tests/` reaches `terrain.ts`. `vite build`: dead.

`make lint` runs BOTH (`tsc --noEmit && npm run typecheck --workspace pwa`)
and is the gate for exactly this reason. It is ~6 s. Run it, not a hand-
rolled half of it, before any push that adds, moves or removes an import.

And note what `tsc` alone still cannot tell you even when you run both: a
MISSING EXPORT is a type error, but a bundler-only failure (a cycle, a
resolution quirk) is not. `make build` is a separate gate from `make lint`,
and `check-seo` runs it — so a change to the module graph owes a build too.

The structural fix, both times, was the same: a value two layers need is its
own DOM-free module, not an export bolted onto whichever file declared it
first (`wheel-steer.ts`, `road-paint.ts`, following `rumble.ts` and
`voice.ts`).
