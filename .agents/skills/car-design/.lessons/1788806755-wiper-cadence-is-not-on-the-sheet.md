---
title: A wiper's CADENCE is invisible on the contact sheet — drive `update()` a frame at a time and count strokes
date: 2026-09-07
scope: pwa/src/game/car/wipers.ts, pwa/src/tools/car-preview.ts
concepts: [wipers, glass, dirt, measurement, verification, test-conventions]
---

`make cars`'s "dirty rear" cell stages half a kilometre of gravel in ONE
step and then ten parked seconds of wiping, so it always photographs a
screen just after a stroke. That is the right picture for the fan's SHAPE
and it is blind to everything about the arm's clock: change the threshold
that starts it or the rate that crosses it and the sheet comes back
pixel-identical. Rendering it is still worth the two minutes — it is what
says the fan and the parked arm did not regress — but it cannot be the
evidence for a timing change.

What can: `buildWipers()` is DOM-free and GL-free, so a plain vitest file
can build one, call `update(wet, spray, speed * dt, dt)` sixty times a
second for a minute of gravel, and read each arm's angle off its mount —
the only Groups on `wipers.group` are the arm mounts, in film order
(windscreen, backlight), each with the blade as its first child. Count the
runs of frames where the angle moves and you have stroke length, stroke
count and the metres before the first one; the film's own alpha comes off
the `color` attribute, front block then rear, `(cols + 1) * (rows + 1)`
vertices each. Take the swept fan's MEDIAN alpha rather than the mean — the
corners no blade reaches cake to the ceiling in every version, and averaging
them in hides the whole change.

The same probe is the test. Assert what the two screens are FOR (the
backlight strokes inside 30 m, the windscreen waits past 150 m, neither
moves on a surface throwing nothing) rather than the constants, and check
it goes red against the old numbers before believing it.
