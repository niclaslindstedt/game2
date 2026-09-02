---
title: A drawn shadow cut to the car's own footprint is invisible — the car is standing on it
date: 2026-09-01
scope: pwa/src/game/car-shadow.ts
concepts: [shadow, silhouette, rendering, penumbra, car-design]
---

Nothing in this game casts a real shadow, so the sheet under each car
(`car-shadow.ts`) is drawn from the body's own plan outline. The obvious
version of that — sample `sampleProfile` + `flareAt` per station, close the
loop, done — renders a shadow nobody can ever see, and it reads exactly like a
material bug: the car floats, and every camera the game uses shows plain
ground under it.

The reason is geometric, not graphical: from a chase or god camera the car's
BODY occludes its own footprint, so what a player ever sees of a shadow is its
FRINGE. A real one has a fringe because a shadow is the whole body projected —
every panel above the ground lands outside the outline the tyres stand in — so
the sheet needs the same: a pad past the plan outline (0.2 m), a soft skirt
past that (0.3 m), and the lean the sun's elevation gives it. The old 16-gon
blob got away with being crude because it was twice the car's width.

So shape the silhouette off the spec, but SIZE it for the fringe, and pin that:
`tests/car_shadow_test.ts` asserts the sheet is wider and longer than
`bodyHalfWidth`/`bodyHalfLength`, which is the check that would have caught
this in seconds. And when a flat sheet looks absent, suspect its size before
its material.
