---
title: A web session renders in SOFTWARE — time a suspect call with console.time, never a CPU profile or a frame-gap
date: 2026-08-27
scope: scripts/screenshot.mjs, pwa/src/
concepts: [harness, tooling, playwright, performance]
---

Claude web sessions have no GPU: Chromium rasterizes through SwiftShader, and
the game runs at roughly 4–10 fps at any viewport (shrinking the window does
not help — the cost is draw calls and geometry, not pixels). Two measurement
habits break on that, both silently:

A **CPU profile** of anything in the render loop comes back ~88% `(program)`,
which is the software rasterizer, not the code under test. It buries the JS
you are looking for under a flat native block and reads like "nothing to
optimise here".

A **frame-gap or update-rate measurement** cannot see any throttle shorter
than a frame. Measuring whether the HUD's 80 ms snapshot throttle was gone gave
an identical `clock-updates / frames ≈ 1.0` on both the old and the new build,
because at 4 fps every frame is already 250 ms apart.

What works: bracket the suspect call with `console.time`/`timeEnd` in the
source, `make build`, and read it off `page.on("console", …)`. That gave real
JS numbers (createGame 8 ms, renderer car swap 8 ms, turntable 7 ms) against a
650 ms observed stall, which is what showed the remaining cost was GPU-side and
the JS fix was already done. Strip the instrumentation before committing.

For a WHOLE-operation cost the frame-gap probe is still honest — a
`requestAnimationFrame` loop recording `t - last`, cleared just before the
click — and comparing it against a stashed baseline build (`git stash`, `make
build`, copy `pwa/dist`) is what turns a number into a verdict.
