---
title: Engine tests must place props relative to `state.car`, never at a bare 0 — the spawn is not the world origin
date: 2026-08-27
scope: tests/
concepts: [test-conventions, spawn, synthetic-tracks]
---

`createGame` puts the car on `track.samples[0]`, which is a couple of metres
down +z and at the stage's own rolled elevation — never `(0, 0, 0)`. Several
collision tests mixed the two conventions in one scenario: the car read from
`state.car`, the obstacle from `solid()`'s `x: 0, z: 0` defaults. They passed
only because both happened to be at the origin.

The failure mode is silent in the direction that matters. A prop that drifts
out of reach makes an "it happens once" assertion pass trivially — nothing
collides, nothing breaks, and the test still goes green. Always write the
prop's position as `car.x + …` / `car.z + …`, and when a scenario resets the
car for a second hit, restore the captured start (`const grid = car.z; …;
car.z = grid`) rather than assigning 0.
