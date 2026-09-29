---
title: A prop's model geometry is returned FRESH every call and the caller disposes it as it disposed the code's — a shared cached geometry is freed by the first teardown
date: 2026-09-29
scope: pwa/src/game/prop-models.ts
concepts: [three, disposal, caching, models]
---

`traffic.ts`, `train.ts`, `livestock.ts` and the rest each dispose their
geometries when a race is torn down — they built them, so they own them.
A `propModel` that cached and shared one dressed geometry per kind and id
(as `treeModel` does, behind `userData.shared` that the flora's instancing
honours) would hand the same buffer to every caller and lose it to the
first `dispose()`, with the next race drawing nothing where the model was.
The trees can share because `flora.ts` checks `userData.shared` before
disposing; nothing else does. So `propModel` expands the pieces into a new
unindexed geometry every call — a vehicle is a few thousand triangles, a
figure's part a few dozen — and the seam in each module treats it exactly
as it treated the code's own. The paint that varies (a vehicle's, a
tractor's) is simply an argument of that call.
