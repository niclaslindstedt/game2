---
title: What `make cars` cannot see — one flank, the car's centre, and daylight; a one-sided part, a face or a lamp needs its own view
date: 2026-08-29
scope: pwa/src/tools/car-preview.ts, scripts/car-preview.mjs, pwa/src/game/car/wheels.ts, pwa/src/game/car-body.ts
concepts: [contact-sheet, verification, lamps, wheels, mirroring, screenshots]
---

Every view on the sheet — game, game drift, front 3/4, side, rear 3/4 —
looks at the +x flank, and so does `make items ITEMS=car` at 0°–135°. A
wheel builds its rim face on the OUTBOARD end only (`buildWheel`'s
`outboard`; the saving is worth keeping), so `car-body.ts` needs one
geometry PER SIDE — bolted from one, a whole flank shows bare black drums
and no cell says so. Any part with a front and a back owes a side argument
and a test that the assembly used it (`tests/car_rims_test.ts`). To judge
anything one-sided, walk the whole way round (`make items ITEMS=car
TURNTABLE=8`, read the 225°–315° cells) and crop: a missing rim is a few
dark pixels at sheet scale. There is no PIL and no ImageMagick in a web
session — a ten-line `playwright-core` page that draws the PNG into a
canvas at 2x and screenshots it is the crop tool.

The orbit views target the car's middle, so pulling `dist` in walks the
camera INSIDE the car rather than up to a nose or a tail. A close-up of a
FACE needs the target moved to the cap (`z = ±length · 0.44`) — a temporary
edit to `car-preview.ts`, reverted after; a one-off target does not earn a
field on every sheet. The cabin has a mode of its own (`--crew`, `make
crew`), aimed at a seat, with `bare` to take the glass off.

The sheet is lit for daylight with the body at its default, so it says
nothing about a part whose whole point is being LIT. A lamp's acceptance
test is `node scripts/screenshot.mjs shot-night shot-dusk shot-speed`:
burning at night, plain coloured plastic by day. Right on the sheet and
invisible at night is a real outcome, and so is the reverse.
