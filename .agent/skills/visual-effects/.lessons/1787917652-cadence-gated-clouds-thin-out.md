---
title: A continuous effect gated on a fixed interval spawns once per FRAME on a slow one — write the rate per second, not per tick
date: 2026-08-28
scope: pwa/src/game/plume.ts, pwa/src/game/renderer.ts, pwa/src/game/dust.ts
concepts: [particles, dust, spawn-rate, frame-rate, tuning, screenshotting]
---

Every continuous cloud here is written as "N particles every M seconds",
gated by `clock += dt; if (clock > M) { clock = 0; spawn(N) }`. Resetting
the clock to ZERO rather than subtracting M silently caps the effect at ONE
spawn per frame: the moment a frame is longer than M — a weak phone, a
stutter, and always the software renderer `make screenshots` runs on — the
cloud thins in proportion to the frame time and there is no other symptom.
The towed plume was tuned three times against screenshots that were showing
a fifth of the cloud the same code produced at 60 fps.

Write anything dense as a RATE: `debt += perSecond * min(dt, cap) * fx`,
carry the fractional debt, and clamp dt so a tab returning from the
background does not fire a second of cloud into one point. The same
arithmetic makes the effect look identical at 20 fps and 120, which is the
actual requirement — and it makes a screenshot a measurement rather than a
picture of the machine that took it.
