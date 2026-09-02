---
title: Anything that is a ROAD beside the stage goes into the terrain's spur index, or the forest grows on it and the scatter tufts it
date: 2026-09-01
scope: engine/mapgen/terrain.ts, engine/mapgen/props.ts, pwa/src/game/world.ts
concepts: [placement, spurs, homesteads, keep-off, ground-cover]
---

There is exactly one channel through which the engine's trunk field
(`props.ts`: `offEveryRoad`, `addSolid`, `addTree`) and the renderer's
ground cover (`world.ts`: `clearOfRoad`) know about a road that is not the
stage: the terrain field's `spurClearance`, read off `createSpurIndex`. A
new kind of road — a homestead's drive — that is not added to that index is
invisible to both: spruces stand in the middle of it and grass tufts grow
on its mat, and neither `make analyze` nor any test says so.

So: `SpurIndex` takes a `SpurLine` (`atS`, `samples`, `width`) precisely so
that anything road-shaped can be added without pretending to be a branch;
add it in `terrain.ts`'s `sync` with its own ingest cursor and prune it by
`atS`. A flat PAD (a yard) is not a line — it is folded into the same
`spurClearance` as a disc, so one function still answers "am I on a road".

Until this session the renderer's scatter did NOT read that channel at all
(`clearOfRoad` only tested the stage's own samples), so tufts and shrubs
were being planted on every abandoned branch. `clearOfRoad` now ends with
`field.spurClearance(x, z) >= margin`; anything new that decides where a
plant stands should go through `clearOfRoad`, not around it.
