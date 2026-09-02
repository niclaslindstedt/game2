---
title: Anything that lays a shelf beside the stage must keep off the fords along it, or it fills the channel R18 keeps visible past the road's edge
date: 2026-09-01
scope: engine/mapgen/homesteads.ts, engine/mapgen/terrain.ts
concepts: [fords, r18, water, placement, homesteads]
---

`tests/water_test.ts` — "keeps a ford's channel visible beyond both road
edges" — asks `waterAt` just outside the mat at every ford. A homestead
drive that left the stage sixteen metres from a ford (seed 186, `long`,
`water: 0.8`) put its shelf over that channel and the water disappeared.
The placer had only refused samples that were THEMSELVES water or deck; the
channel extends tens of metres either side along the road.

Anything that flattens ground beside the route — a drive, a pad, a stand, a
mound — has to keep off the fords and bridges ALONG THE STAGE, not just off
the water on the map: `keepOff.water` (90 m along `s`, either way) is the
homestead's version. `land.flooded` says nothing about a ford, because a
ford is the road's water, not the country's.

Two habits that made this cheap: the sweep of suites the change touches is
re-run after EVERY generator fix, not once at the end (this appeared only
after the bench fix moved the homesteads), and a scratch probe that lists
"homesteads within 80 m of a water sample" over the sweep confirmed the
mechanism in one run before any code moved.
