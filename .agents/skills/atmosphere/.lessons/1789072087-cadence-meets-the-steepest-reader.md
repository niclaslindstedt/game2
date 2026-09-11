---
title: A cadence is only as coarse as the STEEPEST thing reading it — the sun moves ten degrees a minute of racing
date: 2026-09-10
scope: pwa/src/game/environment.ts, pwa/src/game/environment-face.ts, pwa/src/game/mountain-shadow.ts
concepts: [sky, light, mist, performance, measurement, rendering]
---

`RELIGHT_EVERY` (a quarter second of racing) was chosen against COLOUR, and
against colour it is right: the palette moves at most two of 255 in a step.
But the same clock fed everything else, and half of it is a STEEP function
of the elevation — `litAt` is a ramp 0.6° wide (a whole cloud sea going
from shade to lit), the ridge cut is `(sunUp - ridge) / 0.02`, and the
shadow march's interval slides a ceiling further than the shader's ±4 m
penumbra. An hour of sun a minute is TEN DEGREES A MINUTE at a spring
sunrise, so those arrived in tenths, four times a second, over the whole
screen. The fix is a split: `advance` (the palette, the air, the mist, the
dome's uniforms — a `skyAt` at 31 µs and some uniform writes) every frame,
`repaint` (ridge rings, dome vertices, stars, car tint) at the cadence.

Two traps in doing it. `shell.apply` rewrites every layer's lit share as a
flat 1, so **every** call to it must be followed by `litLayers` — otherwise
the sheets flash white on repaint frames. And anything too dear for a frame
(the 3 ms march) is not fixed by a finer cadence but by BRACKETING: hold
the answer at two moments of the sun and read between them.

Measure it in Node, never by eye: walk `sunHourAt` at 1/60 s and print the
per-frame delta of what the shader actually reads, once holding the value
at the old cadence and once not. First Light (alpine, spring, 4:00, seed
30) is the worst case in the game and the stage to measure on.
