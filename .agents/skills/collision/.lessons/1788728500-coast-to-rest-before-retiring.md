---
title: A car that cannot drive never coasts to a stop on drag alone — give the retire rule a constant retardation, and stand the wedge rescue aside for it
date: 2026-09-01
scope: engine/game/damage.ts, engine/game/step.ts, engine/game/defs/tuning.ts
concepts: [collision, damage, retire, drag, stuck-rule]
---

Every longitudinal loss in `car.ts` is a SHARE of the speed (`surfaceDrag`,
`hurt.drag`, both `× u`), so a car with no power decays exponentially and is
still doing 8 m/s half a minute after its engine died — a retire rule gated
on "has come to rest" never fires. `DamageEffects.coastBrake` (m/s², from
`chassis.deadEngineBrake` / `hubBrake`) is the constant part that actually
stops it, applied in `car.ts` beside the drag and clamped so it cannot
reverse the car.

The other half is `stepStuck`: a dead engine with the throttle held IS a
car "asking and going nowhere", so without a gate the wedge rescue respawns
it two seconds after it stops — at the last board, still dead, to be
retired there instead of where it crashed. `beyondDriving` in `damage.ts`
is the one gate both the rescue and the reset read; any new way for a car
to be finished for good goes in there, with a coast-to-rest of its own.

Probe it with 30 s of throttle on a `freshState()` with `systems.engine =
1`: the answer wanted is a `retire` event within ~7 s, zero respawns, and
`car.u === 0`.
