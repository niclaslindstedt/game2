---
title: A sheet of rain or snow is a twenty-metre bubble — everything the weather says past that is the FOG, and the ridge rings with it
date: 2026-09-09
scope: pwa/src/game/rain.ts, pwa/src/game/snowfall.ts, pwa/src/game/environment.ts
concepts: [weather, rain, snow, rendering, fog, horizon]
---

Rain and snow are pooled boxes that travel with the camera, and a box has a
wall: past it there is no weather at all. So a stage billed as a downpour
came back looking like a clear day with scratches on the lens — every drop
in the frame was inside twenty metres and the far three quarters of the
picture said nothing. Adding drops does not fix it either, and the reason is
arithmetic: the count inside a view frustum out to a box of half-extent R
works out proportional to `POOL * R`, so shrinking the box concentrates the
sheet and makes each drop bigger WITHOUT putting one more on screen. Density
near the lens is bought with the pool and nothing else.

What actually carries the distance is the air. `precipReach` (weather.ts)
cuts the fog's own reach live with the squall — it compounds with the
per-weather fraction `sky-looks.ts` already applied, and it is multiplied
into the PRESET rather than into the player's DISTANCE scale, so it lands
under `MIN_FOG_FAR`'s floor: that floor guards what the setting may take,
never what the weather may. Snow goes further and whitens the fog toward
`snowTone`, which rides the daylight down for free.

And the moment the fog's colour moves, THE RIDGE RINGS HAVE TO MOVE WITH IT.
`horizon.paint` reads `p.fog` and is otherwise only called on a relight, so
a white-out came back as a white middle distance under a chain of dark
peaks — the same "ceiling still showing blue over a brown middle distance"
trap `applyFogTone` already warns about for the background. Repaint the rings
from whatever the fog actually ended up being, and give the sandstorm the
same call while you are there; it had the identical gap.
