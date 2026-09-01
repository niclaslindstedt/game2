---
title: The solid-contact block is gated on OFF-ROAD — a solid that stands on the road is never asked about
date: 2026-08-28
scope: engine/game/step.ts, engine/mapgen/solids.ts, pwa/src/game/world.ts
concepts: [collision, solids, bridges, road-furniture]
---

`step.ts` runs `obstaclesNear` / `treesNear` inside `if (fix.offRoad)`,
because everything in the wild stands off the road. Road FURNITURE does not:
a bridge's parapet stands on the deck's own edge, and the car it exists for
is the one that has only just put a wheel wide. Gated behind `offRoad` it is
never checked at all — the car slid across the deck and through the wall
into the river without one contact. Anything standing inside the corridor
needs its own query, hoisted out of that gate.

Two things that make a run of circles read as a WALL:

- Space them under their own diameter and walk them by ARC LENGTH, not per
  sample: sample spacing is only approximately `SAMPLE_STEP`, and one gap in
  the run is a gap the nose finds.
- The circle has to be fatter than the wall is thick for that, so line the
  two up on the wall's INNER FACE rather than on their centres. Otherwise
  the car stops a third of a metre short of visible concrete. `PARAPET_INSET`
  is that offset, and encoding the side in the solid's own `spin` (turn the
  left-hand ones about-face) means the renderer needs no memory of which
  order the pairs came out in.

Build them from ONE exported function the engine and the renderer both call
(`bridgeParapets`), never from a rule restated on each side — a wall drawn a
metre from where the car stops is worse than no wall.
