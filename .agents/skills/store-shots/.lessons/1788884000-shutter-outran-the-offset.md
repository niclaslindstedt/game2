---
title: The SHUTTER costs stage time too — 0.90 s of run per capture, against a 0.70 s flight, so no offset could reach the jump
date: 2026-09-08
scope: scripts/store-shots.mjs, scripts/store-shots/recipes.mjs
concepts: [timing, shutter, rasters, measurement, air]
---

`captureAtS` is honoured exactly, and then `page.screenshot()` takes its own
time — during which THE RUN KEEPS GOING. That latency is uncounted by the
offset, and on a machine with no GPU it is not small. Measured at 2868×1320 on
a four-core runner:

|                             |                  |
| --------------------------- | ---------------- |
| one full-raster capture     | **25.3 wall s**  |
| the run advanced, during it | **0.90 stage s** |
| Bajada's J1 is airborne for | **0.70 stage s** |

So the capture's own latency is LONGER THAN THE JUMP. No value of `captureAtS`
can land inside that flight on that machine — the car lands while the shutter
is open, and **zero is already too late**.

That cost two wasted iterations before anybody measured it. The frame came back
as a car on the ground at 105 km/h under a caption reading LAND IT ALREADY
TURNING; the offset was lowered 0.35 → 0.1 on the theory that it was past the
flight, which was the right diagnosis of the wrong quantity, and the second
frame was identical. **When two very different offsets produce the same frame,
stop tuning the offset — the shutter is the clock that matters.**

`shoot()` now measures it and returns `honest: stageCost <= captureAtS`; both
drivers mark the frame `!` rather than `✓`, name the arithmetic, and say that
lowering the offset cannot help. The sweep labels every late sample
`+N.NN LATE` and refuses to recommend picking a winner — a sheet of nine
samples all shot past the moment is one instant wearing nine labels, and
choosing off it is how a wrong frame becomes the chosen frame.

**A frame shot late is worse than a frame missing.** It is a plausible picture
of the wrong instant and it looks exactly like every other frame in the set.

Practical rule: a moment shorter than about a second needs a machine where a
full-raster screenshot costs about a second. Everything staged as a POSITION
(the grid, a corner, a vista) is immune, because it is still true a second
later — which is why five of the six frames were fine on the slow runner and
only the jump was not.
