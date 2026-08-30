---
title: Nothing may keep off the road by its NOMINAL width — that is the one width the road mostly is not
date: 2026-08-30
scope: engine/mapgen/props.ts, engine/mapgen/terrain.ts, pwa/src/game/world.ts
concepts: [placement, junctions, flora, road-width, renderer-seam]
---

`track.width` is what the stage was BUILT at. What the road actually is at a
given metre is `sample.width`, and it differs everywhere: R33 wanders the
gravel either side of nominal down the whole stage, and R17's junction mouth
flares it half as wide again. Every keep-off distance that measured against
the nominal therefore planted things on the road — most visibly a shrub
standing in the middle of every crossing on the map.

There were four of them and they had to be found separately, because each
lives with the thing it places rather than with the road:

- `props.ts` — `half + PROP_ROAD_CLEAR` / `OB_ROAD_CLEAR` / `TREE_ROAD_CLEAR`
  and the outcrop band. All take the nearest sample's own half-width now
  (`halfAt(near)`; `sampleAt` had to start returning `width`).
- `pwa/src/game/world.ts` — `clearOfRoad(x, z, r)` took an absolute radius
  built from `half`. It takes a MARGIN now and adds each guard sample's own
  half-width, which also fixes the three call sites that passed
  `half + something`.
- `terrain.ts`'s `roadClear` is the exception, and deliberately: R18 traces
  the watercourses against it, so a width that breathes with the road moves
  every river on every stage to buy a metre of accuracy the water cannot
  see. Leave that one nominal.

The general rule: anything that STANDS beside the road asks the sample;
anything that ROUTES past it at map scale may use the nominal. And the
engine's own populations are only half the problem — the shrub that started
this is renderer-side flora, invisible to `treesNear`, so the analyzer check
that catches it has to measure the placement RULE (is the paving further out
than the keep-off radius) as well as walking the solids.
