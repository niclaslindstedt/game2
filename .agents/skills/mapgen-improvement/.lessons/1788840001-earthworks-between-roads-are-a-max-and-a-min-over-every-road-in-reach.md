---
title: The ground between two roads carries the taller fill and the deeper cut of EVERY road in reach — a hand-over at the midline is a step the height of the difference
date: 2026-09-05
scope: engine/mapgen/terrain.ts, engine/mapgen/spurs.ts, engine/mapgen/search.ts
concepts: [terrain, r31, r23, r24, spurs, road-network, measurement]
---

Every "nearest road shapes the ground" rule leaves a step along the
Voronoi line with the next road, the height of whatever the nearer road was
still standing over or under the country there: a route arm's 20 m fill met
the next arm's run-out as a 20 m step, a branch on a fill met a lower
branch the same way (seed 10), a route's bench blend was dropped twenty
metres onto a branch's line across a twelve-metre hand-over (seed 3), and a
deep-cut branch's CONE simply stopped where a higher branch became nearest
(seed 22). The model that has no midline is EARTHWORKS: the fill here is the
max over every road in reach of its own run-out, the cut is the min (which
for the route's arms and for branches alike is R31's cone — a min already),
and a fill built across a cut stands on the cut ground.

Three consequences that were each a separate bug:

- "The other arm" cannot be "the nearest sample outside the index window".
  Twenty-six samples along the same road IS outside the window, its fill is
  this road's own, and the real arm behind it stays hidden (seed 11). Pick
  by what each candidate STANDS at — the highest `elev − 0.45·d` for the
  fill, the lowest `elev + 0.45·d` for the cut — which also makes the
  same-road candidate harmless.
- The branch index answers three questions (`nearest`, `highest`,
  `lowest`), each with its own scratch record, each pruned by a per-cell
  `maxY`/`minY` and by the sample's own elevation before the square root.
- The end aprons are arms too, and R24's `entersStart` had no height
  clause: a stretch may pass the apron at the plain clearance a dozen
  metres above it. `armSeparation` there as well (seed 9's start).

The branch's CUT is left to its cone entirely — nobody blasts a cutting for
an abandoned road, the cone declares the face it cannot take up
(`cutAt`), and a bench line in `base` that is let go before it has climbed
back is the seed-22 wall again.
