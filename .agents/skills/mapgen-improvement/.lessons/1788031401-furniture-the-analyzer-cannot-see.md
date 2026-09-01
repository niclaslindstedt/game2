---
title: Gameplay furniture placed by the RENDERER is invisible to the analysis — a third of every stage's junctions were blocked across the road the route takes
date: 2026-08-29
scope: engine/mapgen/spurs.ts, engine/analysis/rollers.ts, pwa/src/game/
concepts: [analysis, junctions, spurs, placement, renderer-seam]
---

`rollers.clear` reported zero solids in the road on every seed and was right:
the engine's props are all kept off it. Meanwhile the barrier shutting each
abandoned branch — cones, tape and a chevron board — was placed app-side at
the branch's first sample off the junction platform, and a 24-seed probe put
30 of 91 of them essentially ON the route's centerline. A branch leaves along
the main road's own tangent and the route turns off it, so for the first
stretch the two carriageways are still one piece of ground.

Two things generalize:

- **Anything a driver meets at speed is a generator decision**, even when
  nothing collides with it. The place has to be in `Track` — here
  `spur.block`, chosen by `placeBlock` so that every point along the barrier's
  LINE clears the route, not just its midpoint — or no instrument can see it.
- **A check that only walks the contact model's population measures the
  contact model.** `rollers.clear` now walks everything that STANDS on a stage
  (solids, trunks, R17's barriers, R26's marker posts) with two named
  exemptions, and the way to prove such a check works is to sabotage a stage:
  drag one barrier onto the centerline in a test and assert it fires. A
  "nothing is wrong" check that has never been shown something wrong is
  indistinguishable from a check that measures nothing.

Placement wants two bars, not one: the earliest point clearing the full
corridor plus a margin (a barrier is a sign, and a sign belongs where it is
read), falling back to the roomiest point in the window if the branch runs
alongside the route the whole way. Where even that would touch the mat, place
nothing — 4 of 91 branches end up open, and an open fork reads as a choice
where a barrier in the road reads as a bug.
