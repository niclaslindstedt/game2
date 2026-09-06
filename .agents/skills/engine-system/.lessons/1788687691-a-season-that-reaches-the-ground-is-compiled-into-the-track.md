---
title: A condition that reaches the WHEELS is compiled into the TRACK, never read off `env` — and it changes what the road is made of, never where it goes
date: 2026-09-06
scope: engine/mapgen/compile.ts, engine/mapgen/terrain.ts, engine/game/climate.ts, pwa/src/App.tsx
concepts: [surface, terrain, seasons, orchestration, determinism, renderer-seam]
---

`RaceEnv.season` was presentation-only, and the first instinct for a
winter was a runtime override in `step()`: "if winter, read gravel as
snow". That leaves every OTHER reader of the surface — the bot's plan, the
road mesh, the flat arrays, the analysis, the field's fourteen games —
looking at a track that still says gravel.

The engine already had the shape for this: the biome's snowline turns
samples into `surface: "snow"` at COMPILE time, and `createTerrain(track)`
is built twice (engine and renderer) from the track alone. So a climate
goes on the track (`Track.climate`), the compiler's surface pass reads it
beside the zones, and the terrain lays its blanket from the same field —
every reader agrees for free, the app keys its cached track on it, and a
test can hold the summer and the winter track sample by sample and assert
that only `surface` and `bite` moved.

Two traps that follow:

- **Keep the plan out of it.** The season must not touch `StageKnobs` or
  the zones the search reads (`geology.ts`, `paving.sealAbove` both read
  `zones.snow`): a lowered snowline there re-rolls the route. State the
  effective line as a SECOND number (`snowlineOf`, the lower of the
  country's own and the frost line) and read it only where the surface and
  the paint are decided.
- **`heightAt` cannot be redefined in place.** The terrain's analytic
  height is closed over by a dozen readers defined before the road-clearance
  functions the blanket needs (`spurClearance` sits three hundred lines
  down). Rename the bare one and define `heightAt` AFTER the last thing it
  reads — a `const` referenced in a closure is fine, a `const` CALLED before
  its line throws, and the throw is the loud failure you want.
