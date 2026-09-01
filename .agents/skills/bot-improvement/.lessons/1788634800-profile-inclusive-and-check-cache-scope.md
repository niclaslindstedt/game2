---
title: Profile the field INCLUSIVE, never by self time — and look for a table built N times before shaving any inner loop
date: 2026-08-31
scope: engine/sim/bot.ts, engine/mapgen/terrain.ts
concepts: [performance, profiling, bot, terrain, rivals, caching]
---

Reading a `--cpu-prof` by SELF time said the bots were 8% of the field's CPU.
Inclusive time says 30%. The gap is `exposureAt`, whose cost lands under
`waterAt`/`cutAt` rather than under the bot that called them — so self time
was wrong by nearly four times, and it was wrong in the direction that stops
you looking.

    inside stepField (3785 ms)   inclusive
    step()  — the physics          60%
    botInput — the driver          30%   (exposureAt alone: 20%)
    snapshot + the O(n²) pair loop 10%

The same trap on the physics side: `stepGrounded` — the whole handling model,
grip and slide and gearbox and suspension — is 5% self, while the TERRAIN
underneath it (`nearestSample` 8%, `nearestRoad` 3.4%, `spurs.nearest` 2.9%,
`corridorGround` 2.9%) is most of the step. An ON-ROAD step asks the terrain
~2 questions; an OFF-ROAD step asks ~18 (12 `groundAt`, 3.4 `waterAt`, 2
`spurSurfaceAt`, plus trees and obstacles) at 3.4x the cost, and off-road is
12% of a rival's steps but a third of the bill.

**Then check the SCOPE of every cache before optimising anything inside it.**
`exposureAt` was keyed on the `TerrainField`, and each rival gets its own
terrain — so a 15-car field filled fifteen byte-identical copies of one table
(verified identical; ~60 ms each). `createTerrain` takes the track and nothing
else, so the country is a fact about the TRACK: re-keying on it took a whole
race from 2907 ms to 2405 ms, **−17%**, with the `make sim` table
byte-identical.

The guard is worth copying. The old comment defended the terrain key because a
test spreading its own `waterAt` over a field must not get the real country's
answers — true, and a spread defeats any flag or property on the object. A
`WeakSet` filled inside `createTerrain` (`builtTerrain`) does not care: a
spread makes a NEW object, so it falls back to its own table.

For contrast, the micro-optimisation in the same file: pooling `seenAs`'s 1800
`TrafficCar` allocations a second measured 0.1212 → 0.1210 ms/step. Nothing.
