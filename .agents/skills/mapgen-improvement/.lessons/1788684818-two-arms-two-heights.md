---
title: Two branches stacked down one face are refused at TRIAL — the arm's band cannot mend them, and neither can the terrain
date: 2026-09-06
scope: engine/mapgen/compile.ts, engine/mapgen/spurs.ts
concepts: [spurs, r31, r23, road-network, analysis, junctions]
---

`roads.step` between two BRANCHES (alpine seed 6 at the campaign dials:
branches 75–100 m apart with 36 m of height between them) is the route's
stacked switchback legs each forking an arm down the same face. A branch's
height walk reads only the ROUTE's cone (`shelfBand`), never the arms
already standing, and the route's own R23-in-height (`armSeparation`) was
never asked of two arms.

Two fixes that do NOT work, both tried: wrapping the band so the built
branches tighten it with the same cone comes back EMPTY where the second
branch must pass the first (floor over ceiling), `y = min(floor, ceiling)`
clamps it, and the arm gets a 2 m step and a 207 % grade while the 36 m
face does not move — the arm is pinned to its junction's platform; and
nothing in the terrain can split the difference, because the ground
between two roads is the taller fill and the deeper cut of both.

What works is refusing the FORK: `armsKeepHeight` in `compile.ts` measures
the trial arm against every trial arm already taken (`bench + drop /
verge.climb + slack` centreline to centreline, stricter than the
analysis's `stepFloor`) inside `armCanLeave`, and a corner whose arm would
stack is not given a junction — the search flips no surface and draws on.
Over 72 stages across three countries it re-rolled exactly one (the repro),
because the route's line is planned before the compiler decides junctions;
only that stage's sealed share and heights moved.
