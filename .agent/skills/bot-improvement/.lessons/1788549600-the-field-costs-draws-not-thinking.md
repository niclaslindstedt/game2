---
title: The field's bill is DRAW CALLS, not bot thinking — botInput is 0.1% of realtime and the cars on screen are +301 draws
date: 2026-08-30
scope: engine/sim/bot.ts, engine/sim/field.ts, pwa/src/game/field-cars.ts
concepts: [rivals, performance, bot, rendering, campaign, profiling]
---

"The phone gets hot in campaign and heads-up, make the bots cheaper" is the
obvious reading of a thermal complaint and it is the wrong one. Two
measurements settle it in ten minutes.

**The CPU** — `--cpu-prof` over `stepField`, full 15-car field, seed 7:

    the whole field    0.121 ms/step   1.5% of realtime
    botInput x 14      0.009 ms/step   0.1% of realtime

The bots' thinking is ~8% of the field's cost. The other 92% is the physics
`step()`, and its top self-times are all TERRAIN (`nearestSample` 8%,
`nearestRoad` 3.4%, `spurs.nearest` 2.9%, `corridorGround` 2.9%). Counting the
queries says why: an ON-ROAD step asks for one `parapetsNear` and one `sync`;
an OFF-ROAD step asks for **12 `groundAt`, 3.4 `waterAt`, 2 `spurSurfaceAt`**
plus `obstaclesNear` and `treesNear`. Off-road is 12% of a rival's steps at
3.4x the cost, so a third of the bill. The lever is how much time the bot
spends in the weeds, never its cleverness.

**The frame** — `make profile`'s `driving` and `headsup` rows are the same
seed, road and stage time and differ ONLY by the field, so they subtract:

    driving (no field)         401 draws   9.8 cpu ms
    headsup (whole grid)       702 draws  22.9 cpu ms

+301 draws and a doubled frame CPU, ~21 per rival — three orders of magnitude
past the bots, and where a phone's heat comes from.

Three things fall out:

- **A range LOD does not fix the worst frame.** `field-cars.ts` already culls
  by range and a rally start puts one crew in it. The expensive case is a
  heads-up GRID, whole field inside a hundred metres: cut the per-car draw
  count, not the distance.
- **Count the meshes per car first.** The ~21 are 4 wheels, body, lenses,
  bolt-on panels, cabin, glass, grime film, blades, 2 lamp blooms, shadow disc
  and name plate. The bolt-ons merge — they never move until one tears off,
  worth 48 draws across a grid. The wheels do not: they steer and spin.
- **Do not "optimise" the allocations.** Pooling `seenAs`'s 1800 `TrafficCar`
  objects a second measured 0.1212 → 0.1210 ms/step.
