---
title: Gearing and power barely move `make sim` — the bot is corner-limited, so measure them as TOP SPEED on a flat-out probe
date: 2026-08-28
scope: engine/game/defs/, scripts/simulate-run.mjs
concepts: [simulation, balance, cars, gearing, measurement]
---

Anything longitudinal — `gearTop`, `gearAccel`, a gearbox multiplier — is
nearly invisible in the sim table. Handing the manual box +6% gearing and +5%
power moved avg pace by +0.4%; DOUBLING the power bonus to +10% moved it to
+0.6%. Stage pace is set by the speed the bot plans corners at, and the top of
a gear is reached on a handful of straights per stage.

That is not the knob failing. The same change is worth **+6% top speed** —
204 → 216 km/h in the Vireo, 242 → 256 in the Kestrel — which is what the
player feels and what the spec card quotes. So measure a gearing or power
change with a flat-out probe (`createGame` + full throttle down a long
straight, peak `car.u`), and read `make sim` only for the regressions it is
good at: `resp`, `off`, and whether every car still finishes.

The corollary for balance: a car knob that only changes what happens above
corner speed cannot unbalance the roster much either — do not spend rounds
chasing a sub-1% pace movement it produces.
