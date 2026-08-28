---
title: A continuous cloud's spawn arithmetic dies quietly — write it as a rate per SECOND and carry the fractional debt
date: 2026-08-27
scope: pwa/src/game/dust.ts, pwa/src/game/plume.ts, pwa/src/game/fumes.ts, pwa/src/game/renderer.ts
concepts: [particles, dust, spawn-rate, frame-rate, tuning, screenshotting]
---

Continuous clouds spawn a handful of grains many times a second, so both
halves of the arithmetic are small enough to round away to nothing — and
neither failure has any symptom except a thinner cloud.

**Per TICK is not per second.** `clock += dt; if (clock > M) { clock = 0;
spawn(N) }` caps the effect at ONE spawn per frame the moment a frame is
longer than M — a weak phone, a stutter, and always the software renderer
`make screenshots` runs on. The towed plume was tuned three times against
screenshots showing a fifth of the cloud the same code made at 60 fps.
Write it as `debt += perSecond * min(dt, cap) * fx`, with dt clamped so a
tab returning from the background does not fire a second of cloud into one
point. Then the effect looks the same at 20 fps and 120, which is the real
requirement, and a screenshot becomes a measurement rather than a picture
of the machine that took it.

**Rounding per spawn is a switch, not a fade.** Multiply a per-spawn count
(4 grains off each rear wheel) by an effects-budget scale, a pace factor
and a surface factor, and `Math.round` turns 0.14 grains into 0 forever —
and costs a fifth of the cloud at 1.2. Carry a fractional debt across
spawns (`Math.floor` and subtract) so a tenth of a grain per spawn arrives
as one grain every ten spawns, which is what "thinner" should mean.

Two riders from the same arithmetic: gate every continuous cloud on SPEED
as well as state, or a branch without one (`state.offRoad` had none) leaves
a stationary car spewing forever; and scale SPREAD by whatever you scale
count by, because a thinned count inside an unchanged spread is the same
wide skirt with holes in it.
