---
title: Prove a rear view is reversed with a free camera stood on the mirror mount looking back — the driver's side is on the frame's LEFT in the forward view and must be on the left of the glass too
date: 2026-09-05
scope: pwa/src/game/mirror.ts, pwa/src/game/car/cockpit.ts
concepts: [camera, mirror, verification, debug-tools]
---

Whether the strip and the cockpit's pane are mirror images is not something a
frame at speed shows, and the chain is three sign conventions deep (the pass
texture's `repeat.x = -1`, a plane whose UVs run along −x, a camera whose
right is +x when it looks down −z). Reason it once and then LOOK:

1. Take the hood view at the start (`make debug-shot REPRO='?seed=42&start=1&debug=1&camera=hood'`)
   and crop the strip at 4x.
2. Stand the free camera on the mirror mount looking BACK — the same
   stage, `god=1&gyaw=3.1416`, `gx/gy/gz` at the car's mirror — and shoot.
   That picture is the UNREVERSED view.
3. The strip must be its horizontal flip. The reading is by SIDE: the
   driver's side (+x) is on the left of the forward frame and must be on the
   left of the strip; whatever the free camera shows on its right must be
   on the strip's left.

Use near features. The mirror's reach is a fifth of the fog distance (the
pace ladder's `range`), so anything past sixty metres is haze in the strip.
The cabin's own asymmetry — the handbrake on the driver's side of the tunnel,
the terrain through the two rear quarter windows — is the honest reference
at the start line, where nothing else is behind the car.
