---
title: A root test that imports a pwa/ module pulls in everything IT imports — one DOM reference anywhere in that graph fails `tsc --noEmit`
date: 2026-08-29
scope: tests/, pwa/src/game/
concepts: [test-conventions, tooling, dom]
---

The root tsconfig has no `dom` lib — that is what "engine tests, no DOM" means
mechanically. A `tests/*_test.ts` that imports from `pwa/src/` therefore has to
have a graph that is DOM-free ALL THE WAY DOWN, not just at the file it names.

The trap is transitive and the error blames the wrong file. Importing
`menu-nav.ts` for one pure geometry function dragged in its `playUi` import,
`audio/ui.ts`, and `lib/synth.ts` — and `tsc` reported thirty errors about
`AudioContext` and `document` in `synth.ts`, a file the test never mentions.
Vitest itself is happy either way, so `make test` stays green and only
`make lint` catches it; run lint, not just the suite, after adding a test that
reaches into `pwa/`.

The fix is the split the repo already uses (`shot-plan.ts` beside
`screenshots.ts`, `thumb-guard.ts` beside the HUD, `menu-cursor.ts` beside
`menu-nav.ts`): put the pure half — the geometry, the plan, the policy — in its
own module with no imports that touch a browser, and let the DOM half import
it. Doing this up front is cheaper than discovering it after the test is
written, and the pure half is the half worth testing anyway.
