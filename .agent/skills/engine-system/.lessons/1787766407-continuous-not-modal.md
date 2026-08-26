---
title: State-machine mechanics (drift mode, entry kicks) are what make a car feel like a skier
date: 2026-08-26
scope: engine/game/
concepts: [drift, handling, state, events]
---

The old drift was a MODE: an entry that injected `w` and yaw impulses, a
different yaw formula while in it, and an exit that paid a boost. Injected
velocity is the tell — nothing in a car ever teleports sideways, so it reads
as a jump-and-turn rather than a slide. Replacing the mode with one
continuous 0..1 `slide` factor (lateral demand `u·yawRate` over the car's
`gripAccel` ceiling) and fading every drift-specific force in and out with it
gives the same big angles with no discontinuity anywhere — and drops the
`driftStart`/`driftEnd` events entirely. Keep a readout (`car.slide`,
`car.drifting`) for FX/HUD/stats, but derive `drifting` from the slip ANGLE
with hysteresis, never from the slide: the slide tracks steering input, which
chatters, and a chattering flag means a stuttering dust plume and a drift
count in the hundreds.
