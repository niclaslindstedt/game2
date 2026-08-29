---
title: Every ground cloud has to read the CONTACT PATCH, not the speedometer — and a spinning wheel is worth more than a rolling one
date: 2026-08-29
scope: pwa/src/game/dust.ts, pwa/src/game/plume.ts, pwa/src/game/renderer.ts
concepts: [dust, plume, wheelspin, launch, particles, readability]
---

`CarState.wheelspin` is the engine's own slip readout in m/s, and it is the
right input for anything thrown off a tyre. Two things were reading around it.

The renderer had its own launch detector: it differentiated `car.u` frame to
frame and low-passed it, because "nothing in `GameState` carries it". That was
true once and is not now — and the differentiated version is actively WRONG for
a launch that goes badly, because a car whose tyres are lit accelerates
_slowly_, so the most violent moment on the stage came out as the smallest
cloud. Reading `wheelspin` also makes the cloud and the DRAWN WHEELS one
number, which is what stops them disagreeing about whether the car is gripping.

The towed plume (`plumeScale`) read `car.u` alone, so a car standing still with
its axle lit hung nothing at all. Feed it `|u| + wheelspin × PLUME.spin`. The
weight matters and it is over 2: a rolling wheel runs over fresh ground and
leaves it, a spinning one stands on one patch and grinds it to powder. At
parity `PLUME.from` (30 km/h) eats the whole of the slip and the burnout still
raises nothing — the number has to clear the threshold, not just reach it.

One thing the plume cannot do, and do not try: `GROUND_CLOUD.nearFade` and the
chase rig mean a puff born under a stationary car is faded out at the lens by
design. What reads at a standstill is the GRAIN cloud plus the haze the plume
leaves once it has drifted clear — judge it from the shot, not from the spawn
count.
