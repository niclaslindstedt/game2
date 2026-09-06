---
title: Folding built branches into a new branch's shelf band does not fix stacked arms — an EMPTY band clamps a cliff into the branch
date: 2026-09-06
scope: engine/mapgen/compile.ts, engine/mapgen/spurs.ts
concepts: [spurs, r31, road-network, analysis, junctions]
---

`roads.step` on the alpine (seed 6 at the sim dials: two branches 75–100 m
apart with 36 m of height between them) is the route's stacked hairpin
arms each forking a branch down the same face. A branch's height walk reads
only the ROUTE's cone (`shelfBand`), never the branches already standing.

The obvious fix — wrap the band so the built branches tighten it with the
same cone — was tried and reverted. Where the second branch must pass the
first the band comes back EMPTY (floor over ceiling), `y = min(floor,
ceiling)` clamps it, and the arm gets a 2 m step, a 207% grade and a
`roads.sealed` cut at the stage; the 36 m step itself did not move, because
the arm is already pinned to its junction's platform and the route's cone
where the two pass. The honest fix is upstream: the SEARCH (R47's steer)
should not fork branches off two arms stacked closer than the country can
climb, or the second fork should be refused at trial. Not done in the
alpine follow-up pass; the finding stands.
