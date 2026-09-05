---
title: A breakable is modelled in body coordinates around the CAR's origin — re-centre it on its own box before it tumbles, and stop bending it
date: 2026-09-05
scope: pwa/src/game/car-damage.ts, pwa/src/game/car-body.ts
concepts: [damage, debris, tumble, renderer, car-design]
---

Every part in `body.breakables` is a mesh at the chassis origin whose
VERTICES sit where the part is on the car — a door's are 0.8 m out and 0.5 m
up from (0, 0, 0). `tumble.ts` spins an object about its own origin, so a
torn door swung round a point a metre away, and laying it flat stood it
0.8 m in the air on nothing. The BEFORE sheet showed it as a hatch planted
on edge; the flat-rest axis made it a door hovering at waist height.

`breakOff` therefore translates the geometry onto its bounding-box centre,
stands the mesh there, and sizes `rest` off the box's thinnest side — and
takes the mesh out of the bend list, because a mesh still bent every version
from its pristine copy is dragged straight back to the car. A part keeps
the folds it had when it tore off, which is what a torn panel looks like.

The other half of the same pass: the crumple is a FIELD over rest position
(`car-crumple.ts`), never anything hashed on the vertex index. The shell is
non-indexed and flat-shaded, so a corner shared by six triangles is six
vertices, and per-index noise pulls them apart into the splinters the old
`WARP` made. Anything added to the fold must be a function of (x0, y0, z0),
and the face must be lit again from its new normal (`lambert` in
`car/builder.ts`) or a dent keeps the shade of the plane it left.
