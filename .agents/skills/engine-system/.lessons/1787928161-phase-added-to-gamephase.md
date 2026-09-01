---
title: Adding a `GamePhase` breaks every `=== "countdown"` in the app — grep the string literal, and give the HUD a helper instead of a second comparison
date: 2026-08-28
scope: engine/game/state.ts, engine/game/step.ts, pwa/src/game/
concepts: [state, phases, hud, test-conventions]
---

`GamePhase` is a string union, so a new member compiles everywhere and
silently changes behaviour at every site that tested for the phase it used to
be first in. Adding `"intro"` ahead of `"countdown"` moved four app readers and
four tests without a single type error:

- `pwa/src/game/snapshot.ts` — `createLive()`'s seed phase and the countdown
  clock (now `startsIn(state)`, exported from the engine so nothing app-side
  has to know how the beats before green are divided).
- `pwa/src/game/audio/drive-bed.ts` — the gantry tick.
- `pwa/src/game/renderer.ts` — the revving exhaust read.
- `pwa/src/game/hud.tsx` — the gear readout's **N**.
- `tests/{start,circuit,wind,audio}_test.ts` — every "hold on the grid" test
  asserted `"countdown"` after 0.5 s.

`grep -rn '"countdown"' --include='*.ts' --include='*.tsx'` finds all of them
and is the first thing to run. Where two phases now mean one thing to a
reader, add a named predicate (`onTheLine(phase)` in hud.tsx) rather than a
second `||` — the next phase then lands in one place.

Two more that are easy to miss: anything storing a TAPE of inputs keyed by
step index (`pwa/src/game/ghost.ts`) needs its format version bumped, because
step 0 now means a different moment; and the tooling entry (`?start=1`) wants
a way past the new beat or every screenshot scene sits through it.
