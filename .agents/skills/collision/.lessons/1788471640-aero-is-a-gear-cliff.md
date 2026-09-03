---
title: Damage drag shows up as a LOST GEAR, not as a few km/h — the top-speed loss is a staircase, so measure combos and never a sweep of one number
date: 2026-09-03
scope: engine/game/defs/tuning.ts, engine/game/damage.ts
concepts: [damage, aero, drag, top-speed, gearbox, tuning-loop]
---

Top speed in this game is where `engineAccel`'s taper brings a ratio's pull to
nearly nothing, so the equilibrium sits just under `gearTop` and the auto
box's up-shift threshold is right beside it. Add drag and the car stops
REACHING the shift: the loss is flat for a while and then falls a whole gear
(205 → 165 km/h on the reference car). Sizing `TUNING.collision.aero` against
a target percentage is therefore pointless — pick the numbers physically
(CdA in m², a whole car ≈ 0.65) and then measure which side of the step each
realistic COMBINATION lands on.

Two traps in the measuring, both of which produced nonsense numbers first:

- **A probe that drives straight into the scenery measures the grass.** Any
  one-sided loss carries `pull`, so a full-throttle straight-line probe leaves
  the road and reports a 25% "drag" loss for a missing mirror. Feed
  `steer: -damageEffects(car, |u|, t).pull` back in each step.
- **Injecting crush to stand in for a part does not isolate the air.** Crush
  also feeds `chassis.crushDrag` (linear) and the systems, and that linear
  term is what actually moved the gear — the aero sweep read as a cliff that
  the parts themselves never reached.

The car's own resistance is one lumped LINEAR term (`surfaceDrag`), ~1.6 m/s²
at 205 km/h, which is far larger than any honest added CdA at that speed. That
is why a physically-sized hole is worth tenths of a per cent until the total
crosses the step — and why the honest thing to write in the comment is the
ordering and the step, not a per-part percentage.
