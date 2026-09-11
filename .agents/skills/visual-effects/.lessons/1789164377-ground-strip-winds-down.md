---
title: A strip swept along the car's path faces DOWN — section × travel crosses to -y here, and front-face culling then eats the whole mesh
date: 2026-09-11
scope: pwa/src/game/snow-marks.ts, pwa/src/game/carpark.ts
concepts: [geometry, rendering, decals, conventions, debugging]
---

Anything built as a cross-section swept along the car's path — a trail, a
trodden walk, a skid ribbon — has one winding trap. The driver's right is
`(cos h, -sin h)` and forward is `(sin h, cos h)`, so `right × forward` is
`-y` whichever way the car points: a quad taken in section order (left to
right across, then along) faces INTO the ground, and a `FrontSide` material
throws every triangle away. `snow-marks.ts` shipped that way and the trail was
laid, shaped, coloured and updated for several commits while never once being
on screen. `carpark.ts`'s walk gets it right — it emits
`(prev c, this c, prev c+1)`, i.e. forward-then-across — and is the pattern to
copy. Fix the index order; do not reach for `DoubleSide`, since a mark on the
ground has no under-side to see.

**The failure looks exactly like "not drawing one", so prove the mesh is on
screen before tuning what it looks like.** Two diagnostics that do NOT work:
pinning the material red is undone by the per-frame `light()` tint, and
`depthTest: false` proves nothing when the triangles are back-facing. What
works is counting in the page — stash the lay call's tallies and the last
stamp's y on a global and read them with `page.evaluate` — and then
`side: THREE.DoubleSide`, which makes a winding fault appear instantly.
