---
title: A car part built with a FRONT and a BACK needs one geometry per side of the car — and `make cars` looks at the same flank in every view
date: 2026-09-04
scope: pwa/src/game/car/wheels.ts, pwa/src/game/car-body.ts, pwa/src/tools/car-preview.ts
concepts: [wheels, mirroring, contact-sheet, verification, car-design]
---

`buildWheel` draws the rim's face — flange, dish, spokes, hub, studs — on the
OUTBOARD end only, and leaves the inboard end a plain wall, because that end
is up inside the arch where nothing can see it. That saving is real and worth
keeping. What it means is that a wheel has a front and a back, so `car-body.ts`
needs TWO geometries per car, one per flank; a single one bolted to all four
corners puts the plain wall outward down one whole side, and those wheels
render as bare black drums with no rims at all. It shipped that way.

The reason it survived review is the review surface: every view on the `make
cars` sheet — game, game drift, front 3/4, side, rear 3/4 — looks at the car's
+x flank, the one that happened to be right. So does `make items ITEMS=car` at
0°–135°. **To judge anything one-sided, walk the whole way round**
(`make items ITEMS=car TURNTABLE=8`, then read the 225°–315° cells), and expect
to crop: at sheet scale a missing rim is a few dark pixels. There is no PIL and
no ImageMagick in a web session, but Chromium is there — a ten-line
`playwright-core` page that draws the PNG into a canvas at 2x and screenshots
it is the fastest crop tool available.

The durable guard is `tests/car_rims_test.ts`: it counts rim geometry inside
the barrel radius at each end of the axle and asserts the busier end faces away
from the car, per catalog body. Any new part with a front and a back owes the
same pair of things — a side argument, and a test that the assembly used it.
