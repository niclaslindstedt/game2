---
title: A drawn damage instrument must take its tiers from TUNING.collision.callAt, and be worst-of rather than a mean
date: 2026-09-04
scope: pwa/src/game/car-health.ts, engine/game/defs/tuning.ts
concepts: [damage, hud, collision, calls]
---

The damage model already reports itself in words — `systemFail` puts
`ENGINE DAMAGED` / `FAILING` / `DEAD` in the middle of the screen on the lines
in `TUNING.collision.callAt` (0.45 / 0.85 / 1). Anything that also DRAWS the
damage is a second reporter of the same ledger, and two reporters that
disagree are worse than one: a driver told a part is amber while the screen
says it is failing believes neither.

So a drawn instrument gets no thresholds of its own. `HealthTier` in
`car-health.ts` is literally `"ok" | DamageStage`, `healthTier(score)` reads
`callAt`, and everything that is NOT a system ledger is remapped into that
space before it is coloured:

- a WHEEL has landmarks the call ladder does not (`chassis.wheelFlat` is the
  tyre down, 1 is the wheel on the road), so pin `wheelFlat` to `callAt.hurt`
  and ramp to 1 — a puncture then reads exactly where the calls start;
- a CRUSH depth caps at `zoneMax` for every face, belly and roof included
  (`dealCrush` clamps against it), so `depth / zoneMax` is the whole
  normalizer.

The other rule is `max`, never mean. A region is as bad as the worst thing in
it: an engine at 1 must paint its compartment red with four sound
contributors beside it, and a mean is exactly how a dead engine comes out
amber next to two intact headlamps. Weights say "how much of this region is
this part" and then the worst weighted part wins.

One more, learned from looking at it: a summary tier over the WHOLE car must
exclude the lamps. They are binary, so including them means one clipped hedge
on a night stage reports the car as broken for the rest of the run.
