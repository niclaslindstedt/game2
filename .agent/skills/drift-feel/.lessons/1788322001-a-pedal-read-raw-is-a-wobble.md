---
title: A pedal wired straight into the slide is a wobble — lag the weight, and check the drift COUNT, not just dTime
date: 2026-08-28
scope: engine/game/car.ts, engine/game/defs/tuning.ts, engine/game/state.ts
concepts: [drift, throttle, weight-transfer, readout, sim-table]
---

Anything the THROTTLE feeds into the slide has to go through a lagged weight
state, the way `flick` already does. The pedal is a key on a keyboard and a
thing the bot breathes several times a second; the mass it moves takes a
couple of tenths each way. Wired raw, a lift term pumped the angle the slide
was asking for and one long drift was counted and drawn as a dozen twitchy
little ones.

`CarState.lift` (first-order lag toward `1 - throttle` at `grip.liftSettle`)
is that state, and it pays for itself twice: how fast it is FALLING is how
hard the power is coming back on, so the throttle-application transient needs
no state of its own and cannot fire on a throttle that was already open.

**Read the drift COUNT column, not only `dTime`.** Count up with `dTime` down
is the readout chattering across `enterSlip`/`exitSlip` — 21 drifts averaging
0.17 s each on a 4.4 km stage is one corner being counted twenty times, and
it is invisible in the summary line, which only reports average drift time.
It is also the first thing a stronger `releaseSnap` does: the slip resolves
sooner, so each drift closes earlier and the bot re-provokes.

A lift can only deepen the angle by moving `askedSlip`. Pushing harder does
nothing: every deepening force, `liftYaw` included, fades against that
setpoint, so a lift applied at the bottom of a shut band is a lift the car
never feels. The handbrake reaches deeper only because its yaw is ungated.
