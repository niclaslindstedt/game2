---
title: Judge a rendering change on draw calls, not on the headless fps — and find the cost by attributing the scene graph, not by guessing
date: 2026-08-28
scope: scripts/profile-render.mjs, pwa/src/game/
concepts: [rendering, tooling, harness, preview]
---

`make profile` drives the built app and reports draw calls, triangles,
program and texture binds per frame. Headless Chromium rasterizes in
software, so its fps column says nothing about a real machine — but the
counts are exactly what a GPU would see, and draw calls are what decides
how many cars a stage can carry.

Two traps in the harness itself:

- **Count frames by `gl.clear`, not by requestAnimationFrame.** The app
  runs three rAF loops (the frame loop, the HUD clock, the HUD spinner), so
  counting callbacks divides every per-frame figure by about three. Three
  clears once per `render()`, and nothing else in the app clears.
- **Patch the GL prototypes in an `addInitScript`,** before any page
  script runs, or the context three creates is already built when you get
  there.

Guessing where the cost is wastes a cycle. Attribute it: give the scene
graph's top groups temporary `.name`s, walk it from a `window.__scene`
hook, and tally objects and triangles per group against a hand-built
frustum. That is what turned "the flora is probably the problem" into
"the car is 49 draws, the sky is 230, and the wild spends a draw call per
two plants" — three different fixes, none of them the one guessed first.
Strip the names and the hook before committing.
