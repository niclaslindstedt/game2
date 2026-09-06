---
title: A spotlight is paid for on every lit pixel and `make profile` cannot see it — judge a lighting change by light count and shadow map, and photograph it at night
date: 2026-09-06
scope: pwa/src/game/environment.ts, pwa/src/game/car-shadow.ts, scripts/profile-render.mjs
concepts: [lighting, lamps, profiling, measurement, shadows, settings]
---

The world is `MeshLambertMaterial` under real lights, and three.js compiles
every lit material against the number of VISIBLE lights of each kind. So each
`SpotLight` the car's lamps hang (environment.ts) is evaluated by every lit
fragment in the frame — the whole terrain, every tree — whether the beam
reaches it or not, and the sun's shadow map is a depth pass plus a filtered
lookup on every pixel of ground. Neither cost is a draw call, a triangle or a
bind, so `make profile`'s table does not move when a beam is added or taken
away, and its only scene with the lamps lit at all is `storm` (every other row
is a clear day: `preset.headlights` is off and the spotlights are hidden, which
takes them out of the shader too).

So a lighting change is judged STRUCTURALLY — how many spotlights are visible,
which shadow map is allocated, how many slots the dust register runs — and
LOOKED at under `?tod=night`, at each DETAIL stop, with the preset written
into `localStorage` by an `addInitScript` (the harnesses have no URL param
for a video option). The `LIGHTING` lever of the DETAIL row (`LAMP_BEAMS`,
`SHADOW_MAP_SIZE`, `DUST_LAMP_CARS` in settings.ts) is where those counts
live; a hidden light leaves the picture and the shader together, so the
cheapest stop is always "fewer lights visible", never "the same lights,
dimmer".
