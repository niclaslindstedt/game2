---
title: Rain does not layer over a surface — it replaces it, so every surface needs a wet twin
date: 2026-08-28
scope: pwa/src/game/audio/road-grain.ts, pwa/src/game/audio/drive-bed.ts
concepts: [beds, surfaces, weather, mixing, tuning]
---

The first instinct is to add a rain layer on top of the tyre bed and leave
the tyres alone. It sounds wrong immediately, because a soaked gravel road
is not a gravel road with a hiss over it: the stones stop rattling and
start squelching. `WET_SURFACES` mirrors `SURFACES` row for row and
`surfaceUnder(surface, wet)` mixes the two, so drizzle genuinely lands
between them instead of flipping at a threshold. (`color` is the one field
that cannot be mixed — take whichever side dominates; it is inaudible at
the crossover, which is exactly where the two spectra overlap most.)

Two numbers move OPPOSITE ways on every wet row and getting that backwards
is what makes wet weather sound like a filter:

- `grain` goes to nearly nothing — a wet stone does not rattle.
- `level` goes UP, because the loudest thing about a wet road is the water
  being squeezed out from under the tread. So `corner` comes DOWN to pay
  for it: a wet surface is loud whichever way the car is pointing, which
  leaves it less to say when the car turns.

Wet tarmac is the one surface rain makes BRIGHTER, and the wet tyre stops
SINGING: the squeal is rubber gripping and releasing against the road, and
a film of water is precisely what stops that happening.

The rain itself is a bed and the only one with nothing to do with the car —
it plays over a parked car and one in mid-air, past every early return in
the grain. Two layers (the sheet high and broad, the patter on the panels
narrow and low), both lifting with speed, because a car at 140 km/h is
driving INTO the rain rather than being rained on.
