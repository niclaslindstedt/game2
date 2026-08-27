---
title: A camera bolted to the body is a still photograph — an in-car view needs a sprung head AND road grain, and the grain has to be MOTION, not a force
date: 2026-08-27
scope: pwa/src/game/camera.ts
concepts: [camera, hood, game-feel, speed]
---

The stage's ground is a smooth loft: grades, crests and dips, no grain. So a
camera mounted rigidly to the bodyshell is perfectly still at 150 km/h, and
anything else mounted to the same body — the bonnet in a hood view — never
moves a pixel against the frame. It reads as a painted slab pinned to the
glass, and no amount of fov stretch fixes it.

Two layers fix it, and both are needed. The BIG motions come from giving the
eye mass: a damped spring chasing the mount, damped against the mount's own
velocity (damp it against the world and the head trails metres behind at
pace). That alone answers landings, braking and cornering — a landing burst
measured ~70 px of hood travel over 350 ms — but nothing at all on a smooth
straight.

The road's own buzz is the second layer, and it must be applied as
DISPLACEMENT, not as a force into that spring: a ~2 Hz mass-spring answers a
10 Hz forcing with roughly (2/10)² of it, so a rumble shaken into the neck
disappears. Drive it from time-based oscillators (4–12 Hz, incommensurate)
scaled by pace and surface, not from distance — a wavelength short enough to
read as vibration aliases against the frame rate once the car is quick.

Wobble the GAZE as well as the eye. Position only moves what is close:
0.016 m of heave swings the bonnet ~6 px and the horizon ~0.3 px, so without
a few thousandths of a radian of nod and tilt the near bodywork trembles
while the world stays nailed down.
