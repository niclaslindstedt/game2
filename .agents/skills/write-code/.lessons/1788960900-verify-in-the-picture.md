---
title: A renderer feature is not done until a picture proves it; instrument the draw before shooting more frames
date: 2026-09-09
scope: pwa/src/game/
concepts: [measurement, debug-tools, harness]
---

A visual feature can be structurally correct, typechecked, tested and
completely invisible. Chasing that with more screenshots is the slow way:
in this container the app runs at ~10 fps under software rasterization, so
one drive-and-capture is four minutes, and a frame that shows nothing does
not say WHY.

Put a `console.log` in the draw call and pipe the page console into the
capture script (`page.on("console", …)`) BEFORE taking another shot. One
run then answers all of it at once: is it being called, with what surface,
at what values. That is what found two separate bugs here — the trail was
being laid every stamp, but every number sizing it was read at the car's
CENTRELINE, which is the crown a car straddles and never touches, so the
answer was structurally always zero.

The general shape of it: when a per-car effect is sized off the ground,
sample it where the WHEELS are, never at the car's middle.
