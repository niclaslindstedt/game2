---
title: A new pooled THREE.Points must be parked (visible = false) until something spawns into it, and its update() skipped with it
date: 2026-09-04
scope: pwa/src/game/car-fx.ts, pwa/src/game/dust.ts
concepts: [particles, performance, rendering, dust, three]
---

A `THREE.Points` added to the scene costs a draw call and its whole vertex
buffer EVERY frame, live particles or not. `car-fx.ts` already parks the
pools nothing is using — `mud.points.visible = false`,
`plume.points.visible = !wetGround` — and a new pool that skips that
convention taxes every stage for an effect most runs never fire. The crash
grit pool is 3072 particles and was added visible.

The two shapes of gate, and they are not interchangeable:

- **Decided once at stage start** (mud, the wet-ground plume): set `visible`
  where the ground/weather is read, and forget it.
- **Decided by its own use** (a crash): the pool cannot know in advance, so
  expose a `show<Pool>()` on `CarFx` that sets `visible = true` and arms a
  countdown of one particle's whole LIFE. Call it from the spawn site,
  _before_ the spawn — grains written into a hidden cloud are simply lost.
  When the countdown expires the pool is provably empty, so it parks again.

Skip `pool.update(dt)` while parked as well. The walk over 3072 particles is
real CPU and the draw counter does not measure it at all; that saving shows
up only in `cpu ms`, which under software rasterization is noise — so it will
never appear in a table, which is not a reason to leave it out.

Make the life a shared constant (`CRASH_THROW.life`) that both `dust.ts`'s
`DustStyle` and the countdown read, so a lifetime raised in one place cannot
leave the gate parking a pool that still has grains in it.
