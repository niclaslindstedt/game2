---
title: A still cannot show motion — capture a burst of frames in one page and measure an edge across them
date: 2026-08-27
scope: scripts/screenshot.mjs
concepts: [screenshots, camera, verification]
---

`capture()` shoots one frame at the end of its script, which proves framing
and proves nothing about whether a camera or an effect MOVES. For that, call
`page.screenshot({ path: ... })` several times inside the script function
(6 frames, 60–70 ms apart, is enough for a landing or a vibration) and
compare them.

Compare them with numbers, not by eye: this repo has no PIL or numpy, but a
~40-line pure-`zlib` PNG unfilter is enough to walk a column of pixels and
report where a boundary sits (the bonnet's top edge, the horizon). Frame to
frame that is the amplitude, in pixels, of the thing being tuned — and it
lines up with the maths, so it also confirms which term is doing the work.
Keep the burst scene temporary and delete it before the commit; what earns a
permanent scene is a FRAMING regression, not a motion one.
