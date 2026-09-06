---
title: A fill's crest is rounded over a RUN sized to the lattice, never to a fixed bend — a bend holds a hillside fill out over the falling country
date: 2026-09-06
scope: engine/mapgen/terrain.ts, engine/mapgen/rules.ts
concepts: [terrain, lattice, r31, verge, embankment, measurement]
---

A kink from the level lip to the falling side is a shape the 14 m lattice
cannot draw: a tile chords under it by up to half a cell's fall (measured
over twelve taiga seeds: a mean 0.75 m under the field a metre past the
lip, a third of the points over a metre, the worst 4 m), and along the
road the chord comes and goes once a cell — the fill-crest `rollers.grade`
class on every country, and the ribbon's edge standing over a trench.
`fillDrop` in `terrain.ts` rounds it: level at the lip, steepening evenly
over `verge.crest` (three cells), then the fill's own grade.

The first draft rounded it to a fixed BEND (curvature) so the sag was a
constant half metre. On the alpine that put `ground.climb` errors on six
seeds: a fill on a steep hillside stands at the hillside's grade plus a
little (`fillGrade`'s `hill` term), and a crest that starts level and
turns at a fixed rate takes a hundred metres to reach a grade of one —
holding the fill out over the falling country the whole way and landing
it on `letGo`'s bound at `climbable` instead of on its own line. A RUN
keeps the overhang to half the run whatever the grade, and the sag then
scales with the grade (a metre and a quarter at a grade of one), which is
inside the verge's tolerance. `landingGrade` is `fillDrop` solved for the
grade, so a fill still lands by `LAND_BY`; and it is capped at
`hill + climbable`, because a fill too tall to land at that is landed by
the bound at the same grade rather than by a face.

Measure it with a probe over the lip, not with the tally: the sag under
the field at `lip + 1` on the fill side, away from other roads, on
`latticeAt` against `heightAt` (`explore_test`'s crest case holds the
after-numbers).
