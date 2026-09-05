---
title: Measure a reference photo against its AXLES with a ruled crop — an eyeballed side elevation is off by twenty centimetres
date: 2026-09-05
scope: pwa/src/game/car-styles.ts
concepts: [proportions, reference, measurement, contact-sheet, car-design]
---

A spec "measured off a period elevation" by reading the picture at a glance
put the roof's end sixteen centimetres ahead of the rear axle when it is five
behind it, and a cowl nine centimetres off. Two eyeball reads of the same
photo disagreed by twenty centimetres, so neither was a measurement.

What works: crop the reference into thirds with a gridded canvas — a
Playwright page that draws the image scaled and rules a labelled line every
twenty source pixels at three times zoom (a fifty-pixel grid at twice zoom
read a rounded nose ten centimetres high, and the miss survived a first
overlay) (a twenty-line `.mjs` in the scratchpad; PIL and
ImageMagick are not installed in a web session) — then read every landmark
as a pixel coordinate and convert against the two things nothing can argue
with: the wheel centres. Scale from the wheelbase, place z from the axles,
place y from the ground under the tyre. Do the door, the pillars, the roof's
ends, the tailgate's foot, the lamp corners and the bumper edges all in one
sitting and write the metres into the spec's comment, not the fractions of
length — the axles are where the loft already puts its wheels.

Two things a Golf-shaped hatch gets wrong by eye every time: the B-pillar on
a warped flank patch LEANS at a fixed `split` (state it in metres with
`splitZ` and it stands plumb), and a rim of 0.86 of the tyre is a modern
wheel — a period gravel wheel is 0.66 (`rimShare`).
