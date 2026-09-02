---
title: A spin that goes round is a FLOOR on the yaw rate in a latched direction, with the tyre's hold on the travel let go and no exit short of the speed floor
date: 2026-09-02
scope: engine/game/car.ts, engine/game/defs/tuning.ts
concepts: [spin, drift, yaw, redirect, probe]
---

Past `spinAt` the SPIN has to be carried separately, and three things
about that, each found the hard way: it is a FLOOR on `yawRate` in the
latched spin direction (`spinDir`, `spinCarry`), never a term in the yaw
target — round on its tail the slip reads as straight, `sliding` shuts,
`speedFactor` reads the nose's speed (none at ninety degrees) and the lock
still on steers the other way, so a target term was cancelled to nothing
and the car parked rolling backwards at 130 km/h; the tyre's hold on the
travel (the redirect, the weathervane, `slipYaw`) must drop to `spinHold`
or the spun car scrubs itself back into a drift; and once spun the car
stays spun until `spinOut`, because the slip crosses zero twice a turn and
a spin that ended there counted itself five times.

Probe it with the LEVER held at 33–36 m/s on the rear-driver (`probe-spin`
style: peak, spins, end slip AND the sign of `u`): it should go round to
its tail and end at walking pace inside four seconds, the catch at 35°
should gather it, a held flick at 28 should park under `spinAt`, and `make
drift ARGS=--table` must move under a tenth of a degree everywhere else.
