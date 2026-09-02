---
title: A particle pool up in the SKY gets two things wrong that a ground one never does — sort order, and the sheet you judge its size on
date: 2026-09-02
scope: pwa/src/game/ambient-life.ts, pwa/src/game/sky-traffic.ts, pwa/src/tools/
concepts: [particles, sky, three, sorting, render-order, harness, contact-sheet]
---

Both bit on the contrails, and neither shows up as an error.

**Sorting.** three orders transparent objects by the distance from the
camera to the object's ORIGIN, not to its particles. A pool that rides the
camera has its origin on the ground under the camera, so half a kilometre
of sky sorts as the nearest thing in the frame and paints itself over the
cumulus it is supposed to be far above. The cumulus ring draws at the
default order and the dome, stars and halo below it, so `renderOrder = -1`
puts a sky pool where it belongs. Depth still works underneath that: the
ridge rings are opaque and write depth at a radius of ~550, so anything
further out goes behind the mountains for free — which is why a trail may
be allowed to run down past the skyline at its ends.

**The contact sheet.** A point sprite's pixel size is
`size * (drawingBufferHeight / 2) / depth`. Cut a sheet the usual way — one
big canvas, `setViewport`/`setScissor` per cell — and a five-row sheet draws
every sprite FIVE TIMES the width the game will, so tuning against it lands
at a fifth of the right size. Render each cell into its own canvas at the
real cell size and `drawImage` it into a 2D mosaic. Anything that meters
against the drawing buffer needs this; a mesh-only sheet like `make sky`
does not.
