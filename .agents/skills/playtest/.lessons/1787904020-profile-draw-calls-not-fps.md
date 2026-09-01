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

Three traps in the harness itself:

- **A frame is an animation callback that DREW something — never a
  `gl.clear`.** One frame is several three `render()` calls (the driving
  frame issues two, the map view draws its pane over a cleared canvas, the
  mirror fills its own target first), so counting clears multiplies every
  per-frame figure and halves the fps. AGENTS.md states this as a parity
  rule; anything that adds a pass must not quietly go back to clears.
- **The app runs several rAF loops** (the frame loop, the HUD clock, the HUD
  spinner), which is why the callback has to have drawn to count at all.
- **Patch the GL prototypes in an `addInitScript`,** before any page
  script runs, or the context three creates is already built when you get
  there.

A POOLED effect is the easiest thing to read off the table: one new cloud is
+1 draw per RENDER PASS, so +2 on the driving frame — and if it shows up in a
scene that has nothing to feed it, hide the `Points` on an empty list rather
than leaving it to be culled.

Guessing where the cost is wastes a cycle. Attribute it: give the scene
graph's top groups temporary `.name`s, walk it from a `window.__scene`
hook, and tally objects and triangles per group against a hand-built
frustum. That is what turned "the flora is probably the problem" into
"the car is 49 draws, the sky is 230, and the wild spends a draw call per
two plants" — three different fixes, none of them the one guessed first.
Strip the names and the hook before committing.
