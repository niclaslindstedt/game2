---
title: pwa/src/game/camera.ts is already past the 1000-line §20.5 cap — new camera work goes in a sibling module
date: 2026-08-28
scope: pwa/src/game/
concepts: [file-size, camera, module-split]
---

`camera.ts` was ~1165 lines before this session, so it is over OSS_SPEC §20.5
and nothing in `make lint` enforces the cap — the file will keep growing
silently until somebody measures it.

Adding a whole camera to it (god mode's free-fly rig) would have made that
worse for no benefit, because the new code reads no `GameState` at all. It
went in `camera-free.ts` instead and `camera.ts` grew by about twenty lines:
a `"free"` arm in `update()`, a hand-over in `setMode`, and the handles on the
returned object.

The general call: when a module is already over the cap, add the new concern
as a sibling and let the oversized file grow only by the lines that WIRE it.
Splitting `camera.ts` properly is its own PR, and doing it inside a feature
change buries both.
