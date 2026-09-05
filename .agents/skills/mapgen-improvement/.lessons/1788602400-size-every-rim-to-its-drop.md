---
title: A blend of fixed length from a level onto the country is a wall wherever the drop is big — size every rim, bank and fade to the drop it takes up
date: 2026-09-05
scope: engine/mapgen/terrain.ts, engine/mapgen/rules.ts
concepts: [terrain, r31, verge, lattice, measurement, water, towns, homesteads]
---

Six passes in `terrain.ts` eased something level back onto the country over
a FIXED length: the verge cone's lift-off (60 m, steepening to `cut.face.max`
whatever stood over it), a branch's shelf (30 m), a stream's bank (9 m), a
yard's and a village's rim (11 m / 20 m), and the corner guard's mound
(`rise` 0.9 per metre of radius). Each is fine on a flat and a wall on a
hillside, because a smoothstep's steepest point is 1.5 × its mean: a 20 m
drop over 20 m stands at 1.5 m/m. None of it was measured, because the
only steepness check was `ground.wall` at 2.6 m/m — the cliff, not the
climb.

The rule is now `STAGE_RULES.verge.climbable` (0.62, under
`collision.climbLimit` by the lattice's √2), and every such run is sized
to its drop: `run = max(minimum, 1.5 · drop / climbable)`, capped, with the
cap also padding the box the thing is rejected by (`BANK_MAX`, `RIM_MAX`).
A branch's shelf runs out at `verge.climb` first and is only blended at
the toe. A mound's cosine peaks at `rise · π / 2`, so `rise` is 0.39.

Two things the drop-sizing does NOT fix, and where the check
(`ground.climb`, on the drawn lattice, exempting `cutAt`, `sharpAt` and
the country's own scoured flanks) still reports: a road's fill standing
over country that itself falls faster than `verge.climb` — nothing gentler
exists to come down to, so the flank exemption covers it — and the cone
letting go of a mountain, which becomes a declared rock face (`cutAt`'s
`join`) rather than a gentler slope, because 60 m of fade cannot take up
80 m of excess. Measure with the probe in the check before touching a
number: seeds 1-4 went from 563 unclimbable triangles to ~50.
