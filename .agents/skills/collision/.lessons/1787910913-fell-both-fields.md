---
title: The engine and the renderer each build their OWN TerrainField — anything taken out of the world has to be taken out of both
date: 2026-08-28
scope: engine/mapgen/terrain.ts, pwa/src/game/world.ts
concepts: [collision, terrain, renderer, props]
---

`createTerrain(track)` is called twice per run: once by `step.ts` for the
state, once by `pwa/src/game/terrain.ts` for the drawing. They agree because
both are pure functions of the seed — which stops being true the moment
anything MUTATES one of them.

So a felled solid needs `terrain.fell(ob)` on both sides: the engine's (via
the callback `collideCar` is handed) so nothing collides with it again, and
the renderer's own instance (inside `world.fell`) so no later build stands it
back up. The wild streams cells in around the car for the whole run and the
road chunks build as the stage grows, so a renderer field that still places a
felled trunk re-plants it the moment the player drives away and comes back —
which looks exactly like the felling never happened, several seconds later
and nowhere near the code that did it.

Retiring the already-drawn instance is a separate job again (`retireAt` on
both the scenery chunks and the wild cells), because a pool that has already
been flushed is not rebuilt by the field forgetting the prop.
