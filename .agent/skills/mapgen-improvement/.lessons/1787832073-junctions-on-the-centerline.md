---
title: A junction goes ON the centerline at a corner's tangent point — the tangent INTERSECTION lands in a field
date: 2026-08-27
scope: engine/mapgen/compile.ts, engine/mapgen/spurs.ts, engine/mapgen/road.ts
concepts: [junctions, asphalt, spurs, plausibility, road-network]
---

Painting a surface change onto an arbitrary arc position gives two roads
that dissolve into each other. But putting the meeting point where the
corner's two TANGENTS cross — the surveyor's answer — is worse: on a
sweeping corner that point is tens of meters off the road, so the branch
starts in a field and the paving between them is a wedge floating on grass.

What works: the meeting point is a point the route actually drives — the
corner's START where the route turns off the sealed road, its END where it
turns onto one. The main road is then the route's own collinear arm plus
the branch, exactly collinear and exactly the same width. Three things make
it read as built rather than collided:

- **Only at a corner tight enough that the carriageways PART.** They share
  a tangent at the meeting point, so they overlap for about
  `radius · acos(1 − width/radius)` meters. Bound that in ROAD WIDTHS —
  the look is a matter of proportion, and a fixed meter bound breaks the
  moment the width becomes a dial.
- **One graded platform.** Inside it both roads get crown, camber, bank,
  wheel tracks and borders warped out (`flat` on the sample) and their
  height eased onto one plane. Two crowned mats overlapping is a seam you
  cannot paint away.
- **The minor road stops at the MAIN road's edge**, cut at its angle. Key
  the surface seam on distance from the main road's centerline, per vertex,
  not on arc position — that is what makes the seam the edge line instead
  of a band ruled across the minor road.

The tell that it is right: you can say out loud which road runs straight
through and which one turns.
