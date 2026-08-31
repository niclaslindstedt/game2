---
title: A per-frame rate equal to the DISPLAY's own rate delivers half of itself unless the check has slack in it
date: 2026-08-31
scope: pwa/src/game/
concepts: [rendering, frame-rate, throttling, mirror, tolerance]
---

Anything refreshed on its own clock inside the frame loop is written the
obvious way — accumulate `age += dt`, act when `age >= 1 / hz`, reset. That is
correct for every rate WELL under the display's, and quietly wrong for one
that equals it.

A sixty-hertz display does not deliver frames exactly 16.67 ms apart. A frame
arriving at 16.5 ms leaves `age` a hair under the interval, so the refresh is
skipped; the next frame carries 33 ms and refreshes. The result is a thing
asked for at sixty running at thirty, on exactly the machine the rate was
chosen for — and it looks like nothing at all in a screenshot, because half
the refreshes of a smooth thing are still smooth.

Take a tolerance off the interval (`refillGap` in `mirror-pace.ts` uses 2 ms,
the same slack `frameFloorMs` in `settings.ts` takes off the phone's frame
ceiling, for the same reason). Sized against the shortest interval on the
ladder rather than against the longest: a couple of milliseconds cannot let a
30 Hz rung creep up to meet a 60 Hz one, and it is the whole difference at the
top.

The test to write is not "does it refresh" but "how MANY times in a second, on
a display a shade fast and a shade slow" — a count, against a rate below it
that must not have moved.
