---
title: An effect whose throw has a DIRECTION of its own does not fit the renderer's `wheel()` helper — give it a sibling module with the direction maths and the knobs
date: 2026-09-02
scope: pwa/src/game/renderer.ts, pwa/src/game/drift-spray.ts, pwa/src/game/plume.ts
concepts: [particles, dust, drift, module-split, tuning]
---

The renderer's wheel logic throws every grain the same way: born at a
contact patch, carrying part of the car's wake, spread isotropically. That
is right for grit and smoke and wrong for anything aimed — the rooster
tail is thrown SIDEWAYS along the slide (`sign(w) × right`, sized by
`|w|`), leaned back by a lit axle's kick, pitched up by an angle, and
fanned about that direction. Bolting that onto `wheel()` would have added
a fourth positional argument nobody could read.

The pattern that worked is plume.ts's: a sibling module that owns its
pool, its `DustStyle`, a knob group with a unit on every number, and a
state-driven `update(state, dt, fx, amount, color)` the renderer calls
once a frame beside `plume.update`. Per-second rates with a carried debt,
a cumulative weight table to pick the wheel with one `Math.random()`, and
the fan as a 2D rotation of the (along, across) velocity before it is
turned into world axes. `renderer.ts` is already over the file cap, so
this is also the only place the code could go.

Judge the elevation off what the TYRE put into the stone (the flung speed
plus the kick), never off the car's carried speed: a stone keeping pace
with the car is not being thrown up by anything, and pitching the carry
sends the whole tail skyward at speed.
