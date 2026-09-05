---
title: Self-feeding drift torques must stay well under the wheel's authority, and the saturation fade must be WIDE
date: 2026-08-26
scope: engine/game/
concepts: [drift, oversteer, rwd, counter-steer, pendulum, steering-authority]
---

Two ways a drift model stops answering the wheel, both playtested into this
repo. (1) A power torque (`T.grip.powerYaw`) whose hands-off equilibrium
`powerYaw / (driftLat · surfaceGrip)` sits at or above where full lock
parks: the slide reaches its angle on its own and the wheel commands only
the last few degrees — reported as "the drift is steering itself". Keep
that equilibrium far below the full-lock park angle; the lingering tail on
exit survives at a fraction of the wheel's authority. (2) A narrow
saturation band (`satAt`/`satWidth`): the deepening forces hit a cliff, so
every steer past about a third of lock parks at the same angle — half lock
and full lock become the same drift. A wide fade tilts the equilibrium so
the parked angle moves with the wheel. The bounded torque still needs its
`× (1 − intoSlide)` gate (ungated it deepens held corners past the tuned
angle — "wobbly") and the soft sign `clamp(-slip/T.steering.tailSoftSlip)`
for the pendulum. Verify with slip-vs-time traces from a scripted probe at
several LOCKS (0, 0.5, 1.0) — the sim table cannot see whether the wheel
commands the angle, and a full-lock-only probe cannot either.
