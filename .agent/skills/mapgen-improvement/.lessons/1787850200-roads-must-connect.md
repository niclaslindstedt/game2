---
title: Roads must lead somewhere and MEET rather than merge — plan the junction, don't paint the surface
date: 2026-08-27
scope: engine/mapgen/compile.ts, engine/mapgen/spurs.ts, engine/mapgen/road.ts
concepts: [junctions, asphalt, spurs, plausibility, road-network]
---

Painting a surface change onto an arbitrary arc position produces two roads
that dissolve into each other, and a branch that leaves at a random fork
angle produces a road that stops in a field. Both read as broken instantly,
however correct the rules underneath are.

What works is planning the junction as a junction: hold the surface change
until a corner inside a sane angle band (60°–110°) turns up, put the meeting
point where the corner's two tangents cross, send the abandoned branch along
the OTHER arm of the road being joined (its own line, never a fork of its
own), cut both roads' borders away inside the junction, and pave the gap with
a flared throat. Then run the branch until it is out of the stage's bounding
box so it always leaves the map.

The tell that it is right: you can say out loud which road runs straight
through and which one turns.
