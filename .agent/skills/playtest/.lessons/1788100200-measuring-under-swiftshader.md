---
title: The harness renders in SOFTWARE — time the suspect call itself; longtask, CPU profiles and frame gaps all lie
date: 2026-08-27
scope: scripts/, pwa/src/
concepts: [harness, performance, tooling, playwright]
---

Chromium runs on SwiftShader in web sessions and CI, so the game sits at
~4-10 fps and every rendered frame costs 500-800 ms. Three measurement habits
break on that, all silently:

- **`PerformanceObserver` on `longtask`** reports nothing useful — every
  frame is already a long task, and a 700 ms rebuild is one entry slightly
  larger than its neighbours.
- **A CPU profile** of anything in the render loop comes back ~88%
  `(program)` — the rasterizer, not the code under test — and reads like
  "nothing to optimise here".
- **A frame-gap or update-rate probe** cannot see any throttle shorter than a
  frame. Checking whether the HUD's 80 ms snapshot throttle was gone gave an
  identical `clock-updates / frames ≈ 1.0` on the old and new builds, because
  every frame was already 250 ms apart.

What works is instrumenting the suspect call directly and temporarily —
`console.time`/`timeEnd`, or `performance.now()` around it — then `make build`
and read it back through `page.on("console")`. Per-phase numbers are honest
about their RELATIVE size even though the absolute ones are a software
renderer's: `compileStage` vs `createGame` vs `renderer.setGame`, or
`createGame` 8 ms / `setCar` 8 ms / turntable 7 ms against a 650 ms observed
stall — which is what showed the remaining cost was GPU-side. Strip the
instrumentation before committing.

For a WHOLE-operation cost the frame-gap probe is still honest (a
`requestAnimationFrame` loop recording `t - last`, cleared just before the
click), and comparing it against a stashed baseline build (`git stash`,
`make build`, copy `pwa/dist`) is what turns a number into a verdict.

Second trap in the same place: `App.tsx` clamps the frame delta to 0.1 s, so
anything that budgets work from `dt` saturates at that clamp and behaves as if
the machine ran at 10 fps. Size such a budget against a real frame rate, then
check the harness's own waits are still long enough for the work to finish
before the shutter.
