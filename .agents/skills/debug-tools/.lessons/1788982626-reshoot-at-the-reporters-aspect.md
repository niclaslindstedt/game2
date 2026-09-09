---
title: Re-shoot a picture repro at the REPORTER'S ASPECT — `debug-shot`'s 16:9 default crops and re-frames what they photographed
date: 2026-09-09
scope: scripts/debug-shot.mjs
concepts: [repro, screenshots, debug-shot, review, verification]
---

`make debug-shot` captures 1280x720. The REPRO line carries the seed, the
dials and the camera pose — it does NOT carry the viewport, and three's fov is
VERTICAL, so a wider screen opens the horizontal field rather than showing more
of the same lens. A frame shot on an ultrawide monitor therefore holds objects
that are simply not in the default capture, and everything that IS in both sits
at a different screen position.

Measure the reporter's picture before shooting: divide its pixel width by its
height. Then

    node scripts/debug-shot.mjs '<repro>' --viewport 2000x973 --out before

(the Make target has no pass-through for it; call the script). Check the
overlay rows it prints against the ones in the picture, as always — those match
either way, which is the trap: PLACE and CAMERA agreeing is not evidence that
you are looking at what they were.

The cost of skipping it is not a worse picture, it is a wrong subject. A
report of "things in the air" on a 2000x973 frame reproduced at 16:9 put the
actual floating props off the right-hand edge and left a clump of tall
foreground plants near the centre — which read as the complaint, were measured
at length, and turned out to be correctly planted.

To convert a position: an object `p` px from the centre of a frame `H` px tall
is `atan(p / (H/2) * tan(fov/2))` off axis, and the same angle lands at
`(H'/2) * tan(angle) / tan(fov/2)` px in a capture `H'` tall. Horizontal
offsets use the frame's own height, not its width.
