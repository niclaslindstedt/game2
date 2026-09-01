---
title: Nothing may read the road by its NOMINAL width — that is the one width the road mostly is not
date: 2026-08-30
scope: engine/mapgen/, engine/analysis/rollers.ts, pwa/src/game/world.ts
concepts: [placement, junctions, flora, road-width, renderer-seam, measurement]
---

`track.width` is what the stage was BUILT at. What the road IS at a given
metre is `sample.width`, and it differs everywhere: R33 cuts the gravel a
fifth under nominal, wanders it either side of that, opens it out at the
bends, and R17's junction mouth flares it half as wide again. Two kinds of
code get this wrong, and they fail differently.

**Anything that stands beside the road** planted things ON it — most visibly
a shrub in the middle of every crossing on the map. `props.ts` (the three
`*_ROAD_CLEAR` bands and the outcrop), `pwa/src/game/world.ts`'s
`clearOfRoad` (takes a MARGIN now, adding each sample's own half-width) and
`kerbs.ts`'s marker foot were all measuring against the nominal.

**Anything that MEASURES the road** scores the difference as a defect.
`analysis/rollers.ts` built its rank's `want` — the cross-section a contact
is compared against — and its mat/verge classification off the nominal,
while `terrain.groundAt` lays the shelf at the sample's own width.

`terrain.ts`'s `roadClear` is the deliberate exception: R18 traces the
watercourses against it, so a width that breathes would move every river on
every stage to buy a metre of accuracy the water cannot see.

Two riders. A marker needs the WIDEST width within its own length, not the
width under it — a post is a thing standing in the ground, and where the mat
widens fastest the two differ by about the tenth of a metre a post has to
spare. And the engine's populations are only half of it: the shrub that
started this is renderer-side flora, invisible to `treesNear`, so the check
that catches it has to measure the placement RULE as well as walk the solids.
