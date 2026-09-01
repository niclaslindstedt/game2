---
title: "Too tight" is a claim about RADIUS, so measure the angle carried at a fixed radius — a lock sweep hides whether the car slides more in the same corner
date: 2026-08-27
scope: engine/game/car.ts, engine/game/defs/tuning.ts
concepts: [drift, probe, cornering-radius, lateral-g, tuning-loop]
---

The skill's lock sweep answers "how much angle does this much wheel buy". It
does not answer the complaint. "It steers too much into the corner" means the
car holds too small a radius for its speed, and two tunings with identical
full-lock slip can put the car on completely different lines.

So interpolate the sweep the other way: for R = 90, 60, 40, 25 m, report the
slip the car carries while HOLDING that radius, at two speeds and per car.
That one table decides everything — it showed a candidate that raised
full-lock slip by 4° while leaving the angle at R60 unchanged (all depth, no
slide) and another that doubled the angle at R60 (the one that shipped).

Calibrate the radii against what the generator actually builds, not against
round numbers: `STAGE_RULES` turn severities are soft 55–100 m, medium 32–55,
hard 13–30. "Calibrate the drift for the longer corners" is a statement about
the soft band, and "tight corners should need braking" is a statement about
the hard one, so both are checkable.

Reproducing the OLD model for an A/B needs no stash: `TUNING.grip.latGive = 1`
makes the traction ceiling pass the demand through untouched, which is exactly
the pre-ceiling model. Feed a probe a `--set path=value` list and both tunings
run in one process.
