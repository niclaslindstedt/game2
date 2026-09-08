---
title: Every colour of the AIR is a colour daylight makes, and a mix toward one is done in LINEAR light — so an unfaded cast is four times too bright at midnight
date: 2026-09-08
scope: pwa/src/game/sky.ts, pwa/src/game/sky-looks.ts, pwa/src/game/horizon.ts
concepts: [sky, night, weather, rendering, seasons]
---

The weather's grey lid, the lit strip under a gust front, the season's cast
over the clear sky — none is a property of the air, all are statements about
SUNLIGHT in it. Anything authored as `mixHex(colour, <bright thing>, t)` in
`weathered`/`seasoned` therefore has to fade with the sun, and leaving one at
full strength is not a small error: `mixHex` mixes in LINEAR light, where a
midnight sky sits orders under a bright authored grey, so `t = 0.18` toward a
cream lands two thirds of the way up the sRGB ramp. That one line turned a
`0x101c38` midnight fog into `#6c645c`, and the horizon rings — which read the
fog and the zenith — into a mid-grey chain in front of a ceiling drawn black.

Fade it on the SUN'S ELEVATION (`daytime`), never on how much light there is.
Neither light number can tell night from weather: `dayLight` is the KEY light
and therefore the moon after dark (0.10 at a clear midnight against 0.09 under
a storm at noon), and `weathered`'s own `light` is how lit the deck's
underside is, which a real morning has barely started to do at five degrees.

The same trap in the other direction is a MULTIPLY over one, which clips: the
snow caps were the rock at 1.7x, so at sunset the red channel overflowed, took
the hue with it and the peaks came back chalk-white against an orange sky. A
lift toward a bright colour is a `lerp`, never a `multiplyScalar`.

Both were invisible at noon and in every daylight column of `make sky`. Crop
the night cells.
