---
title: Anything shaped off "the nearest sample" steps where the nearest changes hands — the apron's spine, the other arm's fill, the other leg's side
date: 2026-09-05
scope: engine/mapgen/terrain.ts
concepts: [terrain, r31, verge, junctions, lattice, measurement]
---

`shapeAt` builds the ground beside the road off ONE sample — the nearest —
and every quantity that depends on which sample that is (its distance, its
elevation, its side grade) jumps along the Voronoi line where another
sample takes over. Three walls came from it, all found by `ground.climb`
and none visible in a top-down preview:

- **The end aprons.** `apronDistance` measured from the apron's spine only
  when the END sample was the nearest; past a curved end an earlier sample
  is nearer, and the distance jumped from 19 m (spine) to 82 m (sample)
  across one cell — a 12 m step in the corridor beside every stage end.
  `nearerApron` now asks the spine on every query.
- **Two arms at two heights.** The higher arm's embankment, still a dozen
  metres over the country at the line where the lower arm becomes nearer,
  was dropped for the lower arm's cross-section. `nearestSample` now finds
  the OTHER arm (more than `ARM_WINDOW` samples of arc away) and its fill
  is carried (`fillBeyond`, max with the base) until it has come down.
- **The other arm's side.** Reading that fill through `sideGrade` (a side
  read off the other arm's nearest sample) jumped from a cutting's rise to
  an embankment's fall as that sample changed legs of a bend — thirty
  metres between two corners. A fill has one grade whichever side it is
  read from; the other arm's fill is symmetric on purpose.

The tell in the numbers: adjacent lattice corners whose `roadDistanceAt`
differs by more than the cell (the triangle inequality forbids it), or
whose ground differs by more than the cone's grade times the cell.
