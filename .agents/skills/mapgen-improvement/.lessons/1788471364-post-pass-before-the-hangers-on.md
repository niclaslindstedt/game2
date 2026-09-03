---
title: A pass that moves the ROUTE's profile must run before anything is hung off the road — and a junction is written down twice
date: 2026-09-03
scope: engine/mapgen/compile.ts, engine/mapgen/spurs.ts
concepts: [circuit, junctions, spurs, terrain, compile, elevation]
---

`closeCircuitHeight` (R22) ramps a circuit's elevation so the lap closes at
the start line. It moved `track.samples` and `track.junctions`, and ran
AFTER `append()` — so every road hung off the stage inside `append`
(`buildForks`, `buildTowns`, `buildHomesteads`) had already been laid
against the pre-ramp profile. Half a lap along, that is the ramp's full
half-step of tarmac floating over the country: on seed 27 medium circuit
the junction arm started 1.27 m under the road it joined, and the terrain's
two shelves met in a cliff a few metres out.

Two rules fall out of it, and both cost a second debugging round to find:

- **Order.** Such a pass belongs inside the compiler, after the last thing
  that writes `sample.elevation` (`shapeJunctions`) and BEFORE `buildForks`.
  Only the samples and the junctions can be moved by arithmetic — an arm, a
  drive and a car park lane are anchored to the route at one end and to the
  COUNTRY at the other, so no offset is right for both. What they have is
  their own grade-limited walk down to the land, and that walk only comes
  out right when it starts from the corrected profile. It is also the
  profile `shelfBand` (R31) is read off, live from `track.samples`.
- **A junction exists twice.** `noteJunction` pushes to `track.junctions`
  (what the mats are warped onto) AND to the compiler's local `junctions`
  notes (what the branch is WALKED from). Moving one without the other is
  worse than moving neither: the mat rises onto the closed road, the walk
  under it does not, and the branch gets dragged onto the platform over the
  warp's falloff and dropped off its rim as a brow.

Measured on circuit seeds 1-12: analysis errors 232 → 138, `lanes.agree`
and `lanes.step` errors to zero. Sprints are byte-identical.
