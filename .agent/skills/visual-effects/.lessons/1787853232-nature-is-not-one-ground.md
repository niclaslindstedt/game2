---
title: The engine collapses everything off the road to surface "nature" — an FX that should follow the ground must ask the terrain, not the surface
date: 2026-08-27
scope: pwa/src/game/renderer.ts, pwa/src/game/terrain.ts
concepts: [particles, dust, terrain, surface, biome]
---

`GameState.surface` has one value for the whole wild. Meadow, forest floor,
bare mountain rock and high plateau are all `"nature"`, so an effect keyed off
it alone throws torn grass at a car scrabbling up a bedrock face.

The ground's own answer is in the terrain PAINT, and the way to stay honest is
to share the rule rather than re-guess it: `rockAt()` in
`pwa/src/game/terrain.ts` is the tile paint's own steep-flank + altitude test,
exported and evaluated off `state.terrain.groundAt` (the ridden lattice, so it
matches the physics as well as the picture). Whatever the paint draws grey, it
returns ~1 for.

Blend a two-tone `DustTint` by CHOOSING per burst
(`Math.random() < rock ? STONE_DUST : WILD_DUST`) rather than lerping the
colors: ground going over to rock then throws some of each, which reads as the
ground changing. A lerp between green and grey is just a dull green — the same
reason `DustTint` mixes grain by grain in the first place.
