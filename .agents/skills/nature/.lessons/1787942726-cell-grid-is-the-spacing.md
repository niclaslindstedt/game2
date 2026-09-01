---
title: A one-prop-per-cell field cannot cluster — give the cell a CLUMP and divide its chance by the clump's expected size
date: 2026-08-28
scope: engine/mapgen/props.ts
concepts: [placement, clustering, groves, density]
---

The stand noise clumps a forest at 40 m, but inside that the trunk field was
still one candidate per 10 m cell — so the tightest thicket the engine could
build had 10 m spacing, and a saturated stand came out as a lattice. The grid
IS the spacing; no amount of noise on top of it buys a knot of three spruces
two metres apart.

The fix is to let one candidate stand SEVERAL stems, thrown into a couple of
metres around it, more of them where the stand noise is thick — and to divide
the cell's own chance by the clump's expected size, so the landscape carries
exactly as many trunks per hectare as before. That last half is what keeps
`make sim` flat and the forest drivable: the same rule applies to any cell
field that grows a group (`obstacleInCell`'s blowdowns, `outcropInCell`'s
stones).

Two things move with it. `treesNear`/`gather` must widen their cell walk by
the group's own spread, or a clump straddling the search edge is half drawn.
And every member needs its OWN road/stream/water check — a clump thrown across
a bank should lose the stems that landed in the water and keep the rest.

Measure it: trunk count over a big patch before and after (`treesNear` over a
1.2 km square) should be within a percent or two, and the share of trunks with
a neighbour inside 5 m should jump from near zero to a third or more.
