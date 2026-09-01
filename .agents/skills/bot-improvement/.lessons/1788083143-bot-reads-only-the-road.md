---
title: The bot plans off the road alone — anything fatal BESIDE it has to be handed to it explicitly
date: 2026-08-30
scope: engine/sim/bot.ts
concepts: [bot-tuning, corner-speed, hazards, water, terrain]
---

`botInput` reads `flatTrack` and nothing else: no `waterAt`, no
`obstaclesNear`, no `treesNear`. That is invisible while the answer to running
wide is always "a bit of grass", and it stops being invisible the moment a
generator change puts something else there. When R34 laid stages along the
country, one seed put a tarn on the outside of a fast corner and the hard
field drowned in it 319 times per run — while easy and medium, which do not
run as wide, were unaffected at 0.1.

The shape that worked: an `exposure` term read from the terrain a car's-width
off the road (18/28/42 m, both sides), cached in a `WeakMap<TerrainField,
Float32Array>` and filled lazily only at the samples the corner scan actually
reaches. The scan is the bot's whole cost and a terrain query dwarfs
everything in it, so per-race-per-corner is affordable and per-step is not.

Two calibration traps, both found by measuring:

- SCALE the hot entry by exposure, never gate it off. Switching the rally
  technique off wherever there is water costs the quick crews their whole
  pace advantage on any wet stage, and the difficulty ladder inverts.
- A field's respawn count is the diagnostic, not its finishing places. 0.05
  vs 53 respawns/run named the bug in one measurement; the place-based
  ladder test only said "38 ≤ 37 failed" and pointed nowhere.
