---
title: A flat `exp(-dt/tau)` is LINEAR drag — it takes the same fraction per second however violent the motion is
date: 2026-09-07
scope: engine/game/step.ts, engine/game/defs/tuning.ts
concepts: [water, physics, momentum, tuning]
---

The drowning bled the car's yaw with `yawRate *= Math.exp(-T.dt / D.slewIn)`.
That is a fixed time constant, so the WHOLE five-second penalty comes to a
fixed `slewIn × (1 - e^(-duration/slewIn))` = 2.16 × the entry rate, whatever
that rate is. A car driving off a verge enters at well under 1 rad/s and it
looked fine; a car LANDING in water arrives at `drift.overYaw` (6 rad/s) and
turned two full circles on the surface, which reads as the water not being
there at all. The tell is that the measured turns are exactly proportional to
the entry rate across the whole range — 0.14 / 0.34 / 0.69 / 1.37 / 2.06 /
2.75 turns for 0.4 → 8 rad/s.

Fluid resistance is QUADRATIC. Multiplying the exponent by `(1 + |rate| /
above)` gives a decay whose time constant halves at `above` and keeps halving,
which is bounded at BOTH ends and is what the feel actually wants: the same
sweep becomes 0.10 / 0.17 / 0.25 / 0.33 / 0.38 / 0.41 turns — a violent entry
stopped inside half a second, the gentle swing a float needs untouched.

The general shape: **whenever a decay is written as a constant, ask what it
does to an input ten times bigger than the one it was tuned against.** A knob
tuned on the case that happens most often is silently a linear law over the
case that happens rarely and looks worst. And a probe that sweeps the ENTRY
magnitude — rather than measuring the one entry a drive happens to produce —
is what makes the proportionality visible in one table.
