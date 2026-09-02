---
title: The river trace steers round `roadClear` only — a clearing or a pad that is not folded into what the trace is handed gets a stream through it
date: 2026-09-02
scope: engine/mapgen/terrain.ts, engine/mapgen/river.ts
concepts: [water, rivers, clearings, placement, keep-off]
---

`terrain.ts` hands `traceRivers` a `RoadClear` function, and the tracer's
`awayFromRoad` deflects a course wherever that comes back under the keep.
It is built from the stage and the branches; the pads and the `clearings`
list are NOT in it, so a paddock, a field, a yard and — the one that
surfaced this — a solar farm's fence can all have a watercourse traced
straight through them after they were placed. A test asking `waterAt` at a
fence's corners found one on the first sweep.

The fix is to hand the trace a wider function (`waterClear = min(roadClear,
energyClear)`), built from the records on the track — the ingest runs
before the trace in `sync`, so they are there. The homestead's paddocks and
fields are deliberately still left out: a real field is where the water
finds it, and folding them in re-rolls every river on every farmed stage.
Decide per feature; the default is that the water does not know about it.

Also the placer's half: a ford's channel runs tens of metres either side of
the road along the stage, so a fence laid beside a ford is in the water
however dry `land.flooded` says its corners are — keep the slot off
crossings along `s` (`keepOff.water`), the homestead's `nearCrossing`.
