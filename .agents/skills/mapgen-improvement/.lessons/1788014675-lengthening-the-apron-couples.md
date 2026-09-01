---
title: The start apron's length is coupled to the catch-up window and the opening straight — move one and re-measure the other two
date: 2026-08-29
scope: engine/mapgen/rules.ts, engine/sim/grid.ts, engine/game/defs/tuning.ts
concepts: [mass-start, grid, tuning, coupling, rules]
---

Doubling `STAGE_RULES.startZone.apron` (30 → 56 m, to stand a sixteen-car
heads-up grid) broke three things that look unrelated to it, and
`tests/mass_start_test.ts` caught all three:

1. The back row's deficit doubled to 52.5 m, and `catchUpFor` saturated at
   `catchUpMax`. A cap that binds in normal use stops being a guard and
   silently becomes the model.
2. `catchUpYield` is measured, not derived, and it FALLS as the window grows —
   a car at terminal speed buys almost nothing with extra drive. Lengthening
   `catchUpS` from 200 to 320 m dropped the real yield from 0.66 to 0.52.
3. A grid 52.5 m deep needs the opening straight to be longer AND its first
   corner to be fast, or the field arrives still stacked (`STAGE_RULES.launch`).

Also: `GRID_MAX` was `min(roster, apron)`, which made "does the apron hold a
field" unanswerable. Split it — `APRON_HOLDS` is the generator's half, and the
roster's cap is a different module's problem.
