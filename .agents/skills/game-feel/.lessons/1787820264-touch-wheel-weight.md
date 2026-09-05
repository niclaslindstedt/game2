---
title: A touch steering axis mapped straight from finger position gives the player no way to ask for a LITTLE — shape the throw and give the rim weight
date: 2026-08-27
scope: pwa/src/game/hud-touch.tsx, engine/game/defs/tuning.ts
concepts: [steering, touch, hud, drift]
---

A position-mapped thumb axis turns every wobble into a steering input: at a
70 px throw (`WHEEL_REACH_PX`), 15 px of thumb noise is a fifth of full
lock, which past ~70 km/h is a drift nobody asked for. Two levers fix it and
both are needed: SHAPE the throw (`travel ** WHEEL_THROW_CURVE`, so the first
centimetre buys much less while full travel still means full lock), and give
the rim WEIGHT — never assign the thumb's value, chase it at
`WHEEL_TURN_FLOOR + WHEEL_TURN_GAIN · |gap|` lock/s. Rate proportional to
the GAP keeps a hard input sharp while a wobble corrected before the rim
catches up never steers at all; a rate keyed to the wheel's own angle would
blunt countersteer, the one input a drift cannot afford to lose.

The rim is only the first of TWO lags, and they stack: the engine's rack
(`TUNING.steering.rackRate`) eases `car.steer` toward whatever the rim hands
it. Tune either alone and it under-delivers — drive the rim's chase in sim
time inside a Node probe, feed it to `step()`, and time `|car.yawRate|` to
half and 90% of settled.

The chase needs its own `requestAnimationFrame` loop started on pointerdown
and cancelled on release: a thumb holding still fires no `pointermove`, so
event-driven integration stalls mid-turn. Measure it rather than feel it —
`page.mouse` gestures (wobble-out-and-back, hold-small, full shove,
countersteer) sampling the `--turn` custom property after each.
