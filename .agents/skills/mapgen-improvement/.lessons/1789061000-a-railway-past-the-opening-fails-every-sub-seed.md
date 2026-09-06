---
title: A public LINE laid just past the opening straight fails every sub-seed — and only a road can be turned onto, so a railway needs the wider start clearance
date: 2026-09-05
scope: engine/mapgen/highway.ts, engine/mapgen/generate.ts
concepts: [railway, start, search, seeds, r24, r41]
---

`generateStage` retries forty sub-seeds, but the COUNTRY is built once from
the stage seed: the land, the public roads and the railway are the same on
every attempt, and so is the opening straight (it is laid from the origin
up +z, never drawn). Anything that makes the opening illegal therefore fails
all forty attempts in a quarter of a second — a fast failure, not a
livelock, which is the tell.

The alpine's seed 30 was that: its railway crossed +z three metres past the
end of the opening straight. `START_RUN` kept lines off the opening itself,
but a line one clearance past its end is a line the route can neither turn
away from at any radius in the vocabulary nor square up to cross (R36 needs
a straight to line up on). A ROAD there is fine — the route turns onto it
(R17) — so widening the clearance for roads too re-rolled the desert's
first campaign stage for nothing. The railway alone keeps the opening plus
two clearances of room past it.

Diagnose a fast total failure by mutating the country in a scratch script
(`E.BIOMES.alpine.railway = false`, `asphalt: 0`) rather than by reading the
search: whichever removal makes the seed generate names the obstacle.
