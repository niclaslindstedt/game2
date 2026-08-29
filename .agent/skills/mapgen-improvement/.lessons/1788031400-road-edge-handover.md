---
title: The road's edge is a HAND-OVER, not a boundary — the ribbon has to reach down to the lattice, because the lattice can never come up to the ribbon
date: 2026-08-29
scope: engine/mapgen/road.ts, engine/mapgen/terrain.ts, pwa/src/game/road-mesh.ts
concepts: [road-edge, terrain, lattice, renderer-seam, corridor]
---

The road mesh is sampled every 2 m and the ground lattice every 14 m. For as
long as the ribbon insisted on its own height right out to its last vertex,
the lattice under that vertex was wherever the lattice happened to be —
measured over four seeds, a median of 0.39 m below it, a quarter of the road
over 0.5 m, and up to 13.45 m where a road crossed a cell diagonally. That
difference is a VERTICAL FACE the length of the stage, and the drawn skirt
existed to hide it rather than close it. It is what every screenshot of the
road taken from beside it shows as a dark line.

The fix that works is one function, `handoverAt(out)`, read by all three
consumers: past the bare shoulder the corridor's surface leans onto the
lattice and by `ROAD_CROSS.reach` the lattice has it entirely. `groundAt`
blends it, the road mesh drapes its outer vertices onto `latticeAt` (exposed
on `TerrainField` for exactly this), and the two meshes then meet at a shared
height. Cost: the outer verge sags by `TILE_SINK` — which is a shallow ditch
at the road's edge, i.e. the thing that belonged there.

Measure it with a scratch probe, not by eye: rebuild the lattice the way
`buildTile` does (`heightAt` at the cell corners, interpolated across the same
two triangles) and take `ribbonY - lattice` at `half + reach` down four seeds.
Print min/median/p90/p99/max. Every step of this change moved that
distribution, and none of them was visible in a single screenshot.

Two companions the same pass needed: the analyzer had no check for the edge at
all (`rollers.cross` reported it as one warning among many, on every seed, and
nobody could act on it), and R31's cone was letting a road sixty metres away
and twenty below hollow out the ground under this one.
