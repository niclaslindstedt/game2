---
title: Only `asphalt` and `elevation` change what the bot drives — `width` and the seed pool barely differ, so surface is the one strong balance axis
date: 2026-08-27
scope: scripts/simulate-run.mjs, engine/mapgen/
concepts: [simulation, balance, stage-dials, cars, generator]
---

Balancing cars "across level types" runs into a fact about the generator that
is not written down anywhere: **a seed fixes the centerline, and no dial moves
it.** Compiling seed 3 at `width` 0 and `width` 1 gives byte-identical length,
turn count, mean and max curvature; the same is true of `elevation`. Only
`asphalt` (the share of samples paved) and `elevation` (vertical amplitude)
change what the car actually drives, and `width` — which does change the road
from a 9 m lane to a 22 m boulevard — is invisible to a bot that hugs the
centerline (measured: pace within 1 km/h at both extremes).

The seed pool is narrow too. Over seeds 1–24 the mean |curvature| spans only
11.7–16.7 (×1.4) and hard corners are 3–9% of samples, so there is no
genuinely tight stage to pick out and a "twisty vs flowing" archetype
separates the cars by tenths of a percent.

The consequence for tuning: **surface share is the one axis worth 4–8% of
pace; everything else is worth under 1%.** Build the archetypes as positions
along it (fully sealed → half and half → fully loose, with elevation and water
as secondary), give each car a decisive home surface, and let the all-rounder
take the compromises. Chasing a tight-vs-open split through `width` or seed
selection is several tuning rounds spent on noise — that is exactly how this
session lost them.
