---
title: The big pwa/src/game modules sit AT or past the 1000-line §20.5 cap — new work there goes in a sibling, and a feature that pushes one over owes the split
date: 2026-08-28
scope: pwa/src/game/
concepts: [file-size, camera, renderer, module-split]
---

`camera.ts` is past the cap and `renderer.ts` sits exactly on it, and nothing
in `make lint` enforces §20.5 — measure with `wc -l` before adding to either.

Two different calls, depending on which side of the line the file is on:

- **Already over** (`camera.ts`): add the new concern as a SIBLING and let the
  oversized file grow only by the lines that WIRE it. God mode's free-fly rig
  went in `camera-free.ts`; `camera.ts` grew by a `"free"` arm in `update()`,
  a hand-over in `setMode`, and the handles on the returned object. Splitting
  it properly is its own PR — doing it inside a feature change buries both.
- **Pushed over by your change** (`renderer.ts`, by the rear-view mirror):
  a sibling for the new thing is not enough, because the file is over the cap
  either way. Take one cohesive concern OUT of it in the same pass. The
  transient FX pools went to `car-fx.ts` — what the pools are, how the light
  tints them, the four-wheel burst — leaving the renderer every decision about
  WHEN anything is thrown, which is what needs the whole frame. That is ~80
  lines back and a file that reads as one job again.
