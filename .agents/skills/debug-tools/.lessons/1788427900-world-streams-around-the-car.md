---
title: The world is drawn around the CAR, not the free camera — fly god mode a few hundred metres off and you photograph the world's edge
date: 2026-09-03
scope: pwa/src/game/world.ts, scripts/, pwa/src/game/camera-free.ts
concepts: [god-mode, camera, screenshots, tooling, preview, streaming]
---

`world.ts`'s `sync` streams the terrain tiles and the wild scenery around
`state.car.x/z` — on a FINITE stage too, not just an endless one — and god
mode holds the car wherever the run started. The free camera is not part of
that decision at all.

So a `?god=1&gx=…&gz=…` shot taken a few hundred metres from the car does not
show what is there: it shows the ridge backdrop, the fallback ground disc,
and one floating island of terrain around the car. It reads as a broken
build rather than as an unloaded one, which is what makes it expensive —
the obvious next move is to go looking for a rendering bug that is not
there.

Two things follow for any tool that parks the camera:

- **Stand near the car.** A shot over the start line is reliable at any
  altitude; a shot from somewhere more scenic is only reliable if the car is
  taken there too. `scripts/biome-preview.mjs` lifts straight up over the
  start for exactly this reason.
- **Height is cheaper than distance.** Lifting to ~200 m keeps everything
  inside the streamed world; past roughly 250 m the far edge of the drawn
  terrain comes into shot instead.

The give-away that this is what you are looking at, rather than a real
defect: distant mountains and sky render fine while the ground is missing.
The backdrop is camera-locked, so it is the one thing that follows the lens.
