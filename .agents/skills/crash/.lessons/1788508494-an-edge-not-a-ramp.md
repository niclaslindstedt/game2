---
title: A body resting on a face is STABLE however steep the plane — what turns a slide back into a roll is an EDGE, and a ramp scenario says the model is broken when the scenario is
date: 2026-09-04
scope: engine/game/roll.ts, scripts/lib/crash-stage.mjs
concepts: [roll, slide, slopes, scenarios, measurement, physics]
---

"A car sliding down a cliff should roll again" was staged as a uniform bank
falling away across the body, and the answer came back damning: on its roof,
at grades from 0.2 to 1.2 (up to 50°), peak roll rate **0.00 rad/s**. It
looked like a missing mechanism.

It is not. A roof resting on a plane is at the bottom of the roof's own
valley in `centreHeight`, and gravity holds it there whatever the plane is
doing — which is exactly what a real car on its roof on a hillside does. It
slides. The scenario was asking the model to produce something the world does
not produce either.

What actually puts a sliding car back over is the ground running out from
under ONE side of it. Re-staged as an EDGE (flat, then a drop, then flat
again — a cliff with a bottom), the same body goes 0.75 of a turn. The two
scenarios are now `bank` and `cliff` in the crash lab and the CONTRAST is the
point of having both: one is the control that should NOT roll.

Two traps this cost, both worth avoiding by hand:

- **An unbounded ramp is a car falling for the whole scenario.** The first
  edge had no floor and reported 656 m across, 523 km/h and −1.47 g.
- **A terrain patched under a car standing on the ROAD is never read.**
  `step.ts` takes the road's own frame for `slope`/`slopeLat` and only the
  wild branch samples `terrain.groundAt`. Any scenario about ground shape has
  to put the car well off the ribbon first, or it measures nothing and says
  so with a straight face.
