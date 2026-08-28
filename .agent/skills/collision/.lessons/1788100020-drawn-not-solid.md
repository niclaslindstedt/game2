---
title: A scatter the renderer plants is a scatter the car drives through — audit world.ts before believing "everything solid is engine-side"
date: 2026-08-28
scope: pwa/src/game/world.ts, engine/mapgen/terrain.ts
concepts: [collision, placement, invariants, nature]
---

The "anything solid is placed engine-side" invariant held for trunks,
boulders and fallen trunks — and quietly did not hold for the two biggest
things beside the road. `buildScenery` in world.ts planted its own loose
boulders (up to 2.1 m across) and its own bedrock outcrops (2–9 m tall,
2.5 m off the shoulder) as instanced dodecahedrons with no collider at
all, which is what "I drive straight through rocks" means when a player
reports it. Nothing catches this: the invariant is prose, the two files
have no compile-time link, and app-side scatter looks exactly like the
engine's own props on screen.

When a report says a thing is not solid, grep world.ts for
`InstancedMesh` and for `buildFlora` placements the engine did not
supply, before touching `collision.ts` — the contact model is usually
fine and the thing simply was never a collider.

The fix shape that worked: place it in `terrain.ts` as a `WildObstacle`
kind with an honest radius/height, draw it in `buildWild` from the same
record (`stoneMatrix` keeps the drawn seat and the collision circle
written from one formula), and cap whatever the renderer still scatters
under `SOLID_PROP_HEIGHT` so app-side dressing can never again be
something the car should have hit.
