---
title: The schematic hides everything the world gets wrong — render the PLACE, not just the plan
date: 2026-08-27
scope: engine/mapgen/, scripts/lib/stage-render.mjs
concepts: [preview, tooling, terrain, water, rendering, review]
---

A top-down schematic answers "are the rules satisfied" and nothing else. The
moment `make track` also rendered the shaded landscape — heights, water,
forest, the road at full width — four bugs that had been shipping for months
were visible in the first image: stream meanders flung a kilometer off the
map (an unclamped `smooth()`), a landscape that was more lake than land, a
hairline seam ruled across the country where the corridor's blend outran the
sample grid's search reach, and roads that stopped dead in a field. None of
them broke a rule, so no test and no schematic could have caught them.

Render the world at more than one seed, and zoom in on any feature the
whole-stage frame cannot resolve (junctions, bridges, guarded hairpins) —
at a few meters per pixel the flaws are obvious and at 2 m per pixel they
are invisible. Send the images; the judgement is visual.
