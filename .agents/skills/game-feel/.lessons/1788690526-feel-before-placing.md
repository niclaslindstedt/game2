---
title: A feel reading that moves the BOOM has to be stepped before the lens is placed, not after the pose is written
date: 2026-09-06
scope: pwa/src/game/camera.ts, pwa/src/game/camera-feel.ts
concepts: [camera, game-feel, standoff, ordering]
---

`updateChase` used to call `feel.step` late — after `camX`/`camZ`, the floor
under them and the cliff hold — because everything it returned (the hover, the
tremor, the attitude) was applied ON TOP of a pose that was already written.
Anything that changes the STANDOFF breaks that order: the camera's ground floor
(`groundOver`) and the FLOOR snap are sampled AT the lens, so a boom moved after
the sample is a lens standing over ground that was read half a metre away —
which on steep terrain is metres of vertical error and a shot that pumps.

So a reading that moves where the camera STANDS is stepped with `climb` before
`camX`/`camZ`, and the pose is built from `dist + felt.reach`; readings that
only offset an already-placed lens can stay where they are. Add the surge to
`wantDist` instead and it gets eased twice — once on its own clock, once by the
rig's `RIG_EASE` — which turns a lag into a rumour of one.
