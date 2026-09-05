---
title: Motion on a lens is DISPLACEMENT on soft limits, sized by whose motion it is — a still camera, a clamp and a rattle are the three ways it goes wrong
date: 2026-08-27
scope: pwa/src/game/camera-eye.ts, pwa/src/game/camera-shake.ts, pwa/src/game/camera.ts
concepts: [camera, shake, grain, aliasing, hood, collision, frame-rate]
---

The stage's ground is a smooth loft with no grain, so a lens bolted to the
body is perfectly still at 150 km/h and the bonnet under it is a painted
slab. Two layers put the motion back and both are needed: a sprung HEAD
(a damped mass chasing the mount, damped against the mount's own velocity —
against the world it trails metres at pace) for landings, brakes and
corners; and the road's GRAIN, applied as DISPLACEMENT rather than as a
force into that spring — a ~2 Hz mass answers a 10 Hz forcing with (2/10)²
of it, so a rumble shaken into the neck disappears. Drive grain from
time-based oscillators scaled by pace and surface, never from distance, and
let it SATURATE (`soften(...)`) rather than scale: there are springs between
the road and the seat. Wobble the GAZE too — position only moves what is
close.

"Too rocky" is almost never amplitude. Two mechanisms are worth more than
any turning-down: the frequency ceiling (the skill's 8 Hz rule — jolt goes
as f², so 11.3 → 7.9 Hz halved the violence for free), and every `clamp` on
the camera's path, which is a knock — a head thrown into a hard travel limit
stops dead in one frame (p99.9 heave 130 → 96 m/s² from that alone).
`soften(v, lim) = lim · tanh(v / lim)` never arrives at a wall.

"Too shaky" is mostly WHOSE motion it is. The engine already drops the body
onto its springs at every contact (`loadSprings` in collision.ts) and
car-mesh.ts draws it, so from an outside rig the car rocking IS the hit; a
lens on a boom that rattles with it doubles the motion and hides the car
doing it. `ShakeSource` classes each blow by cause: outside rigs take none
of a `contact` and the in-car rigs take all of it. The reviewable measurement is a parked car, kicked, with the lens
displacement from its settled datum metered over two seconds (`blowRun` in
`tests/camera_test.ts`); a still cannot review any of this.
