---
title: The field's bill is DRAW CALLS, not bot thinking — the cars on screen are +301 draws a frame
date: 2026-08-30
scope: engine/sim/field.ts, pwa/src/game/field-cars.ts
concepts: [rivals, performance, rendering, campaign, profiling]
---

"The phone gets hot in campaign and heads-up, make the bots cheaper" is the
obvious reading of a thermal complaint and it is the wrong one.

`make profile`'s `driving` and `headsup` rows are the same seed, road and
stage time and differ ONLY by the field, so they subtract:

    driving (no field)         401 draws   9.8 cpu ms
    headsup (whole grid)       702 draws  22.9 cpu ms

+301 draws and a doubled frame CPU, ~21 per rival. The whole 15-car field's
ENGINE cost is 0.12 ms per 120 Hz step — about 1.5% of realtime — so the
rendering is three orders of magnitude past the simulation. Cut draws.

Two things that fall out:

- **A range LOD does not fix the worst frame.** `field-cars.ts` already culls
  by range and a rally start puts one crew in it. The expensive case is a
  heads-up GRID, whole field inside a hundred metres: cut the per-car draw
  count, not the distance.
- **Count the meshes per car first.** The ~21 are 4 wheels, body, lenses,
  bolt-on panels, cabin, glass, grime film, blades, 2 lamp blooms, shadow disc
  and name plate. The bolt-ons merge — they never move until one tears off,
  worth 48 draws across a grid (shipped). The wheels do not: they steer and
  spin independently.

One trap on the rate question. Lower the step rate and a heads-up scrambles
(worst crew 65 s) while a heat's damage-dealt drops ~28% — which reads as the
contact model going soft, and invites a collision clock of its own. Both wrong.
`collideCars` is an impulse resolver, so a held rub at a fixed closing speed
deals identical crush at 120, 90, 60 and 30 (locked in `collision_test.ts`);
the scrambling is fourteen bots taking different lines. **Stage the mechanism
before believing a field-level number about it.**
