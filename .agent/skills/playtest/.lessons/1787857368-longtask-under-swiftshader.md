---
title: longtask entries are useless in the headless harness — every software-rendered frame is one
date: 2026-08-27
scope: scripts/, pwa/src/
concepts: [harness, performance, tooling]
---

Measuring a main-thread stall with a `PerformanceObserver` on `longtask` in
the screenshot harness reports nothing useful: Chromium runs on SwiftShader
there, every rendered frame takes 500–800 ms, and so every frame is already a
long task. A 700 ms stage rebuild shows up as one entry very slightly larger
than its neighbours.

What works is instrumenting the suspect call directly —
`const t = performance.now(); …; console.log("MEAS …", performance.now() - t)`
— temporarily, in the source, and reading it back through
`page.on("console")`. That gives per-phase numbers (compileStage vs
createGame vs renderer.setGame) that are honest about their RELATIVE size even
though the absolute numbers are a software renderer's.

Second trap in the same place: `App.tsx` clamps the frame delta to 0.1 s, so
anything that budgets work from `dt` saturates at that clamp under software
rendering and behaves as if the machine were running at 10 fps. Size such a
budget against a real frame rate, then sanity-check that the harness's own
waits are still long enough for the work to finish before the shutter.
