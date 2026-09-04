---
title: A seam between two ground readers is not a small height error — at 120 Hz it becomes tens of m/s and throws the car
date: 2026-09-04
scope: engine/game/ground.ts, engine/game/step.ts, engine/game/car.ts
concepts: [physics, terrain, verification]
---

The car's ground is stated twice — the road's ribbon (`track.ts`, `locate`)
on the mat, the terrain lattice out in the country — and `step.ts` used to
swap readers the moment `preFix.offRoad` flipped. Anywhere the two disagree,
that swap is a TELEPORT, and nothing downstream reads heights: `wheelSpeed`
and the foot's speed are both a height difference over `T.dt`. A 22 cm
disagreement became −27 m/s of ground apparently falling away, which opened
the whole loft in one step and threw the car upward off the verge — and fed
`groundJolt`'s bump channel its 25 m/s ceiling, which is the bounce.

The rule this leaves: **anything a step differences across `dt` must read one
surface at both ends, and that surface must be continuous in space.** Where
two authorities meet, hand over with a ramp (`countryShare` in `step.ts` does
it on R16's own smoothstep); never switch on a boolean. The same applies to
any per-car offset carried between steps (`CarState.foot` is one) — an offset
measured on one surface and spent on another is the same bug wearing a
different hat.

Two traps found on the way. A constant artifact READS AS A PASSING TEST:
`slope_test` asserted a sealed road's edge lofts a car past `air.loft`, and
it passed because the seam lofted every crossing by the same 9 cm whatever
the road was or how fast it was taken — the assertion was on the artifact,
not the chamfer. Suspect any physics number that comes back identical across
widths and speeds. And a formula-stated cross-section (`profileOf`) answers
ANYWHERE it is asked; a car's corners reach a half-diagonal past its middle
(`ground.ts`, `corners`), so a reader is routinely asked about ground metres
outside where its formula is meaningful.

`make verge` draws all of this: the crossing from behind, the ground under
every frame from both readers, and the foot's speed under it.
