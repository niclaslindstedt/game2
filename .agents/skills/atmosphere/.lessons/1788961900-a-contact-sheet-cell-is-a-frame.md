---
title: A contact-sheet cell has to be RENDERED at its own size — one big canvas behind a scissor scales gl_PointSize off the whole sheet
date: 2026-09-09
scope: pwa/src/tools/sky-preview.ts
concepts: [sky, screenshots, rendering, snow, particles, review]
---

`make sky` built its sheet the obvious way: one canvas the size of the whole
grid, `setViewport`/`setScissor` per cell, render. For a sky drawn per view
ray that is exactly equivalent. It is WRONG for anything sized in device
pixels, and points are the worst case — three sets a `PointsMaterial`'s
`scale` uniform from the DRAWING BUFFER's height, not the viewport's, so a
snowflake came out as many times too big as the sheet had rows: seven on a
`--rows=rain,storm,snow` slice, twelve on the full sheet. The same code
photographed the same weather at two different flake sizes depending on
which slice was asked for, and neither was the game's.

The tell is that it looks plausible. A blizzard of huge crystals reads as
"too dense, turn the pool down" rather than as a units bug, and the fix that
suggests itself is the wrong one — the pool was actually too SMALL.

Render the cell at the cell's size (`setSize(CELL_W, CELL_H, false)` on an
offscreen canvas, `preserveDrawingBuffer: true`) and `drawImage` it into a
2D canvas at the cell's spot. The blit also drops the GL y-flip the
scissored version needed. Then remember what the honest sheet is telling
you: a 400x260 cell IS a small frame, so a flake there really is a quarter
the pixels it is at 1080p — judge near-field particle DENSITY on a real
`make screenshots` frame and use the sheet for the sky, the distance and
the ladder between weathers.

The same trap waits for any per-pixel feature on this sheet: the shader
sky's grids, the stars, a hairline. Sibling lesson:
`sky-detail-is-sized-in-pixels`.
