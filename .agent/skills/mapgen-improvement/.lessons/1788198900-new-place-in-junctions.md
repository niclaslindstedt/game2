---
title: A new kind of entry in `track.junctions` is a change to eleven consumers, and none of them ask whether it is a junction
date: 2026-08-31
scope: engine/mapgen/compile.ts, engine/analysis/, pwa/src/game/road-mesh.ts, scripts/lib/stage-render.mjs
concepts: junctions, road-network, analysis, renderer, measurement
---

`track.junctions` is not a list of junctions — it is the list of PLACES where
two roads share a graded platform, and everything downstream reads it as the
former. Adding R36's level crossing to it broke, silently or loudly, in eleven
places, and the pattern is worth knowing before the next kind is added:

- **`joining` stops meaning anything.** Every consumer that picks a side with
  `j.joining ? … : …` — `analysis/junctions.ts` (the arrival angle, the through
  road), `compile.ts`'s `mouthFlare`/`throatOf`, the two renderers' `minor` and
  `onMinorSide` — silently measures one half of a symmetric place.
- **One junction, one spur** is assumed by `buildForks`'s platform lookup,
  `roads_test`'s index pairing, and `analysis/roads.ts`'s pair sweep (whose two
  arms are 0 m apart by construction and read as an R23 breach).
- **The analyzers measure the design.** A deliberate ramp reads as a `drive.grade`
  error, a `drive.heave`, and a `rollers` bump forty times the floor. Each needs
  its own exemption, and they are not the same exemption: `drive` and the grain
  check must skip the ramp, the seam and edge checks must NOT — an embankment's
  rim is exactly what they exist to judge.
- **The two renderers cull differently.** `road-mesh.ts` decides per VERTEX and
  was already right; `scripts/lib/stage-render.mjs` decides per band behind a
  `kind === "gravel"` guard, so a route that is briefly SEALED walked past it and
  drew its verge across the tarmac.

Before touching the type, grep `\.junctions` and `\.spurs` across `engine/`,
`pwa/src/game/`, `scripts/lib/` and `tests/` and answer for each: does this ask
"which side", "how many arms", or "how tight is the corner"? Those three
questions are the whole failure surface.
