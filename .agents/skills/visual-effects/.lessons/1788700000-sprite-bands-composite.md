---
title: A line of overlapping sprites COMPOSITES — dilute a spreading band's per-puff alpha by its width to the power 1.5, and judge it by what the stack adds up to
date: 2026-09-06
scope: pwa/src/game/sky-traffic.ts, pwa/src/game/ambient-life.ts
concepts: [particles, contrails, sky, alpha, compositing, contact-sheet]
---

A contrail is the same ice at every age: hair-thin and white behind the
aeroplane, six times as wide and faint two minutes later. Laying it as a
close-packed line of point sprites whose WIDTH grows with age gets the
shape right and the brightness wrong twice over, and both mistakes look
plausible in the code.

**Not diluting** — the same material opacity at every width — composites
the old band solid white: with puffs every 2.5 m and a 24 m sprite, twenty
of them overlap one pixel, and `1 - (1 - 0.3)^20` is 1. The old band then
OUTSHINES the fresh line, which is the one thing that reads as wrong.

**Diluting by the square** of the spread (once for the ice being shared
out, once for the overlap) makes the same band a ghost, because the sprite
is a soft disc that fills about half its box: the pixel under the middle of
the band sees half as many effective puffs as the geometry says.

The power that works is 1.5 (`puffFade`), and the number to TUNE AND TEST
is not one puff's alpha but the band's: `trailRead(age)` composites
`alpha × puffFade` over `2 × width / step × 0.5` overlapping puffs, and the
test holds the fresh line above 0.85, the minute-old band between 0.2 and
0.6, and the whole curve monotone so no age ever outshines a younger one.
Print that table (`npx tsx -e`) before rendering the sheet — it predicts
the picture, and the sheet costs two minutes a look.

Two more things the same pass settled. The trail stays STRAIGHT: a wave
across its track, however slow, reads as smoke and not as ice — brightness
lumps along its length are how an old one comes apart. And the harness
cell (300 px, 64°) has under half the game's pixels per degree, so a
3 m core at 400 m is 1 px there and reads fainter than it will; 4 m is the
floor a hair-line can be judged at on that sheet.
