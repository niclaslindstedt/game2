---
title: The landscape heightfield lives in the engine now — renderer and physics each build the same field from the track
date: 2026-08-26
scope: engine/mapgen/terrain.ts, pwa/src/game/terrain.ts, pwa/src/game/world.ts
concepts: [terrain, off-road, streams, obstacles, determinism]
---

Since the wild became driveable, `createTerrain(track)` (engine/mapgen/
terrain.ts) owns the heightfield, the streams, the water table and the
solid props; the pwa's terrain.ts only meshes and paints tiles from it,
and world.ts places scenery against `field.roadDistanceAt` /
`field.streams`. Both sides construct their OWN field instance from the
track — pure seeded functions, so they agree everywhere without sharing
state. Two traps: anything moved here must keep noise lookups pure (the
paint seeds stay renderer-side, drawn from a different rng stream, so
shape and paint can evolve independently); and wild props are drawn by
the CELL that owns their position, not by every cell whose query radius
sees them, or neighbouring cells double-draw. Ground tiles stream around
the car as well as the corridor (budgeted per frame); wild flora/prop
cells are world.ts's `buildWild`, planted only beyond the road bands'
150 m reach.
