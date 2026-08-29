---
title: The contact sheet cannot judge a FACE — its orbit views aim at the car's centre, and a lit part is only honest in a night screenshot
date: 2026-08-29
scope: pwa/src/tools/car-preview.ts, scripts/car-preview.mjs
concepts: [contact-sheet, lamps, verification, screenshots]
---

Two blind spots in the `make cars` loop, both of which cost a wasted
iteration on a lamp pass.

The orbit views target `(0, 0.62, 0)` — the middle of the car. Cutting the
view list down to one row and pulling `dist` in does NOT give a close-up of a
nose or a tail: it walks the camera inside the car with the cap at the edge of
frame. To judge a face, the scratch view needs its TARGET moved to the cap
(`z = ±length * 0.44`) as well as its distance pulled in. Do that as a
temporary edit to `pwa/src/tools/car-preview.ts` and `git checkout` the file
afterward — the harness has no per-view target field, and adding one widens
every sheet forever.

And the sheet is lit for daylight with the body material at its default white,
so it says nothing about a part whose whole point is being LIT. The acceptance
test for a lamp is `node scripts/screenshot.mjs shot-night shot-dusk shot-speed`:
lit and burning at night, plain coloured plastic by day. A lamp that looks
right on the sheet can still be invisible at night, and vice versa.
