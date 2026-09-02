---
title: A new SURFACE reaches thirty readers — turn every `=== "gravel"` that means "bladed road" into `isLoose`, and append to the surface tables rather than reordering them
date: 2026-09-02
scope: engine/mapgen/compile.ts, engine/game/defs/tuning.ts, engine/mapgen/flat.ts
concepts: [surface, physics, road, renderer-seam, audio]
---

Adding `sand` to `Surface` typechecked in four places and was wrong in
twenty more, because most readers compare against the literal `"gravel"` to
mean "a road that was bladed rather than laid" — the width wander and the
bumps in `compile.ts`, a junction's mouth, the marker posts in `kerbs.ts`,
the homestead drives, the terrain's pads, three analysis checks, the road
paint's seam logic, the spill, the dirt on the paint and the glass, the
preview's plan. `grep -rn '"gravel"'` is the list; `isLoose(surface)` in
`compile.ts` is what each of them meant.

The tables keyed by surface are the other half and they do typecheck:
`TUNING.surfaces` (drag, grip, breakaway, power), the in-car grain in
`camera-eye.ts`, the tyre voices in `audio/road-voice.ts` (dry AND wet),
`flat.ts`'s `SURFACES` and `CODE_OF` — append the new code at the end there,
the bot indexes its grip array by it. Which loose surface a country blades
is the biome's (`BiomeRules.loose`) and the compiler reads it once per
stage; `step.ts` seeds the car's first surface from the first sample so the
countdown does not say gravel on a sand road.
