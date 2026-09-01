---
title: The ground under the car answers TWO questions — what an FX is coloured, and whether it happens at all; and "nature" is not one ground
date: 2026-08-27
scope: pwa/src/game/ground-tint.ts, pwa/src/game/renderer.ts, pwa/src/game/terrain.ts, pwa/src/game/plume.ts
concepts: [particles, dust, terrain, surface, biome, plume]
---

`GameState.surface` has one value for the whole wild — meadow, forest floor,
bare mountain rock and high plateau are all `"nature"` — so an effect keyed off
it alone throws torn grass at a car scrabbling up a bedrock face. The paint's
own rule is exported: `rockAt()` in `terrain.ts` is the tile paint's steep-flank

- altitude test, evaluated off `state.terrain.groundAt` (the ridden lattice, so
  it matches the physics as well as the picture).

Blend a two-tone `DustTint` by CHOOSING per burst
(`Math.random() < rock ? STONE_DUST : WILD_DUST`) rather than lerping: ground
going over to rock throws some of each, which reads as the ground changing. A
lerp between green and grey is just a dull green.

**And a colour is not an answer to "does this happen".** Two effects reading one
ground tint quietly forces them to agree on existence too, which is wrong the
moment they are different SUBSTANCES. Grass is the case: a wheel digging a verge
genuinely throws torn turf (grains, arcing, gone in a second), but no cloud can
be MADE of grass — turf binds its soil, and a green haze reads as the ground's
paint smeared into the air rather than as anything a car did. So `ground-tint.ts`
answers twice: `groundTint` for what a wheel throws, `plumeGround` for what hangs,
and the second is allowed to return null. When you gate one effect off, check
what carried the load with it — the wild's plume was half its ground FX, so
`WILD_THROW` on the grains had to come up (0.45 → 0.9) or a car crossing a field
at 150 km/h disturbs nothing.

Make the MAJORITY tone the one that is honest at a distance: a tyre cuts through
turf into the soil, so `WILD_DUST` is earth with grass flecks, not the reverse.
