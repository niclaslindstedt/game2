---
title: Friction must be dissipative on EVERY axis it torques — check the sign by hand, because an anti-damped axis looks like tuning
date: 2026-09-04
scope: engine/game/roll.ts
concepts: [roll, friction, contacts, coulomb, physics, debugging]
---

`rubGround` spends one Coulomb budget on four jobs at once. Three of them —
the travel, the roll and the pitch — were capped at the impulse that would
bring the slipping patch to a common speed with the ground, exactly as the
module's comments demand. The fourth, the SPIN, had two faults nobody had
looked for because it was written last:

- **the moment's sign was inverted.** The generalized force conjugate to the
  heading rate is `along × F_across − across × F_along`; the code had the two
  terms the other way round. That is anti-damping _by construction_: the
  torque turns the patch further INTO the slide that made it. A car merely
  lying on its roof on a bank wound itself from 0.35 rad/s up to **6.7** and
  stood itself back up on its wheels.
- **the patch's own sweep from the spin was missing from the slip.** The roll
  and pitch rates were both in it (`car.w + rollRate × lever`); the yaw was
  not, so the friction could not oppose the rotation it was creating.

Two checks that would have caught either in a minute, and both are cheap:

1. **Derive the sign twice, by different routes** — the 3-D cross product
   `(p × F)·up`, and the generalized force `F · ∂v_P/∂ω`. They must agree.
2. **Put in a pure rotation and nothing else.** A body with a spin and no
   travel must lose that spin. Set the translation to zero, give it a rate,
   and watch the sign of the change. Anti-damping is unmistakable and needs
   no scenario.

The general form: friction is a constraint that removes energy. Any axis it
applies a moment to must have that axis's slip in the slip it is computed
from, and the result must shrink. An axis torqued but not read is a pump, and
it will read to everyone downstream as a number that wants tuning.
