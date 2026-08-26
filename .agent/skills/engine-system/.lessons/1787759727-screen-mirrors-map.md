---
title: The rendered world MIRRORS the engine's map view — screen-space signs flip once, in input.ts
date: 2026-08-26
scope: pwa/src/game/
concepts: [steering, coordinates, camera, input]
---

The engine's convention (heading 0 → +z, positive steer rotates +z toward
+x, "clockwise in map view") is self-consistent, and the renderer maps
engine x/z straight onto three.js x/z — but a y-up right-handed top-down
view has opposite handedness to the map view, so everything on screen is a
MIRROR of the map: the engine's positive steer reads as a LEFT turn through
the chase cam, and `make track` previews show the mirror image of the
in-game stage. This shipped as inverted steering. The fix is a single
negation at the input boundary (`pwa/src/game/input.ts` sample()) with
screen-space semantics (positive = right) everywhere in the app layer —
never flip signs in the HUD, camera, or engine to compensate, or left/right
invert again.
