---
title: A season is what CHANGES — the conifers holding still is what makes the taiga's autumn read
date: 2026-08-28
scope: pwa/src/game/flora-build.ts, pwa/src/game/biome.ts, pwa/src/game/environment.ts
concepts: [seasons, flora, phenology, lighting, biome]
---

Season is applied as a colour MAP inside `GeoBuilder.add` (a
`Map<THREE.Color, THREE.Color>` from `floraPalette(season)`), so a species
recipe names the summer colour it means and nothing in the roster knows
what month it is. A colour absent from the table does not change — and
that absence is the design: every conifer green, every bark and all the
dead wood stay put, which is what holds the taiga's silhouette still
while the broadleaves, the larch, the ground layer and the bogs move.
Tint the spruces too and the picture just goes muddy.

Three mechanical consequences:

- The year is BAKED into vertex colours, so the shapes cache is keyed by
  variant + jitter + season, and changing season re-plants the world
  (`renderer.setConditions` watches `builtSeason`). Seed the jitter from
  variant+shape only, or a plant changes shape when the season changes.
- The ground palette is a per-season override merged over `biome.ground`.
- The LIGHT is derivable rather than art-directed: noon elevation is
  `90 − latitude + declination`, and scaling the preset's elevation by
  `sin(noon)` ratios plus charging the extra air mass against the three
  channels' Rayleigh optical depths gives the warm, dim, long-shadowed
  autumn for free. Winter is NOT a taiga season — snow is the arctic biome.
