---
title: Anything set out LATERALLY from the centreline foots on the ground at its own point — a sample's `elevation` is half a metre wrong by the verge
date: 2026-09-09
scope: pwa/src/game/gate-furniture.ts, pwa/src/game/split-board.ts, pwa/src/game/
concepts: [placement, renderer-seam, terrain, roadside, review]
---

A roadside fixture is usually laid out from a track sample: take `s.x/s.z`,
step `lat` metres along `rightOf(s.heading)`, and stand the thing there. The
height is the half that gets forgotten — `s.elevation` is the CENTRELINE's, and
by the time `lat` reaches the verge the mat has cambered away (0.17 m on
gravel), the shoulder has stepped down (0.14 m), the verge has leaned off
(0.24 m over `ROAD_CROSS.reach`) and any bank has tilted the lot. Half a metre
to a metre of air, and on a stage the tiles have taken further down, more.

The start/finish gate did exactly this: its bales, its cannons and its striped
legs all took `s.elevation`, and stood up to a metre over the hillside beside
the road — reported as "grass in the air" from a screenshot of seed 11's line.

Two right answers, and which one depends on whether there is a landscape:

- **In the world**, pass `terrain.standOn` down and read it at the fixture's
  own `(x, z)`. It is `TerrainField.groundAt` — the ribbon where there is one,
  the lattice past R16's hand-over, snow and ice included — which is what every
  other planted thing in the world stands on.
- **With only a ribbon** (the item catalog turns props on a bare compiled
  track, no terrain), `s.elevation + corridorOffset(s, lat, s.width)` is the
  corridor's own cross-section and the best there is. `split-board.ts` does
  this; make the ground sampler optional and fall back to it.

Note `corridorOffset` wants the SAMPLE's width (R33 wanders it), not
`track.width`, and returns a big negative on a bridge deck, where past the
parapet is air.
