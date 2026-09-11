---
title: "\"It destroyed my car and there was nothing there\" is the GROUND, not the contact model — put groundAt beside the crown before opening collision.ts"
date: 2026-09-11
scope: engine/game/collision.ts, engine/mapgen/terrain-index.ts, engine/analysis
concepts: [collision, terrain, debugging, invisible-wall]
---

A report of the whole ledger spending in one hit — four wheels off, engine
dead, gearbox shot, every pane gone, three seconds into a race — is a
44 m/s closing speed, and there is nothing in `collision.ts` that invents
one. The car met a wall. If the picture shows no wall, the wall is the
terrain: `groundAt` is what the car rides and the road mesh is what the
player sees, and where those two part the step is real AND invisible.

Two probes settle it in a minute, before any collision code is opened:

- Walk the lateral profile of `terrain.groundAt` across the road's own
  width at a spread of arc positions. A frozen column — the same heights
  at s=0, s=20 and s=50 while `sample.elevation` falls — is ground being
  shelved against something that is not this piece of road.
- `groundAt(on the mat) − sample.elevation > 0` is the invariant, because
  the crown is the highest line ACROSS the road (track-shape.ts). Sweep it
  over seeds; it costs seconds and it names the defect rather than the
  symptom.

Then read `make analyze` before doing anything else. The analyzer had been
reporting this one as `!! rollers.cross` ("a 0.85 m step across the rank on
the road, 0.0 m off the centerline") on all 24 circuit seeds — nobody had
run it on `--shape circuit`. A whole class of "the game hit me with
nothing" is already written down in there; the sweep is per-shape and the
default shape is a sprint.
