---
title: The weather is decided twice — `fallsAsSnow` draws it and `wetnessOf` wets the world, and only the first one knew about the cold
date: 2026-09-11
scope: pwa/src/game/weather.ts, pwa/src/game/environment.ts
concepts: [weather, rain, snow, temperature, winter, parity]
---

`Weather` is only ever `clear | rain | storm`; the cold is a separate field
(`RaceEnv.temperature`). Two readers turn that pair into what the player
gets, and they were asking different questions:

- **what FALLS** — `fallsAsSnow` at the camera's own air, cross-faded in
  `environment.ts`, which correctly drew flakes under 0 °C; and
- **what is WET** — `wetnessOf` (`weather.ts`), which read the weather
  against the COUNTRY (`rainsIn`) and never the temperature at all.

So a frozen stage set to rain snowed on screen while the road bed played the
rain sheet and patter over a wet surface twin, `wetGround` swapped the snow
plume for mud clods, and `field.paint` tinted every rival streaming wet
beside a player's car under a coat of snow. Each half was right about its
own question and the stage was incoherent.

`wetnessOf` now returns 0 under `fallsAsSnow(env.temperature)`. The general
rule: **anything new that asks "what is this weather doing" must read the
COLD as well as the row** — the country decides whether water falls here at
all, and the temperature decides whether it is water. And check the FIELD
while you are there: `tintCar` took a `snowing` share the player's car and
the ghost were given and the rivals were not, which is the kind of gap a
single frame with one rival in it shows instantly.
