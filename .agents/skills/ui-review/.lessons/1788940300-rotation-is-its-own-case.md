---
title: A canvas left IN THE FLOW sizes the pane it is supposed to fill — and a rotation is the only viewport change that exposes it
date: 2026-09-03
scope: pwa/src/styles.css, pwa/src/game/
concepts: [css, responsive, landscape, portrait, rendering, verification, menus]
---

A `<canvas>` is a REPLACED element. Give it `height: 100%` inside a pane whose
own height is indefinite — `height: auto` sized by a grid row, which is what
the pre-race card's stand is on every two-column shape — and the percentage
cannot resolve, so it falls back to the BUFFER's aspect ratio and the picture
starts sizing its own frame.

Both of this app's canvases have a per-frame "cut the buffer to the box" resize
(`car-turntable.ts`, `renderer.ts`'s `syncSize`), which turns that into a
closed loop: pane height ← buffer ratio ← pane height. Every ratio is a fixed
point, so the pane keeps whatever shape it had when its height was last
DEFINITE. Turning a phone from upright to sideways carried the stand's portrait
ratio into a landscape pane — 44% too tall, START under the fold — and no later
screen could talk it back down. The fix is `position: absolute; inset: 0` on
the canvas (its pane `position: relative`): out of the flow it contributes no
height, and causation only points one way.

**Every fixed-viewport screenshot is blind to this**, which is why it shipped.
Rotation needs its own probe: walk to the surface at one shape,
`setViewportSize` to the other, and compare the geometry against the SAME
surface loaded cold at the target shape — they must be identical.
`scripts/screenshot.mjs`'s `shot-menu-car-turned` is the kept version.

Two things about running such a probe. Use ONE page at a time: two concurrent
world builds starve each other past Playwright's 30 s click timeout (Roam is
the one that dies). And a hover-driven caption bar makes turned and cold differ
for a reason that is not a bug — a synthetic pointer keeps its client
coordinates through a resize and ends up over a different row, so compare the
caption's TEXT before believing that difference.
