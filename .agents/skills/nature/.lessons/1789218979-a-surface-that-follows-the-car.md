---
title: A surface that FOLLOWS THE CAR must be shaded by the same rules as the country past it — its rim is a straight line that walks outwards, and nothing else in a frame moves like that
date: 2026-09-12
scope: pwa/src/game/snow-mantle.ts, pwa/src/game/terrain.ts, pwa/src/game/snow-shader.ts
concepts: [snow, materials, terrain, seam, streaming, review]
---

The snow coat is a 2.5 m sheet over a square 200 m across, re-anchored as the
car drives (`snow-mantle.ts`). Everything past it is the ground TILES on their
14 m lattice. Both were "snow", and both were wrong about each other: the coat
was a flat white with wrap lighting and glitter and no detail map; the tiles
were a noise-varied white with the detail map and plain Lambert. The rim drew a
hard diagonal across every hillside, and because it is anchored to the car it
WALKS — which is what a player notices and reports, long before they can say
what the line is.

Three things had to match, and matching only one or two leaves the line:

- **the albedo**, as a FIELD and not a constant (`snowAlbedo`, off the stage's
  paint seed) — two flat whites of equal value still show their boundary;
- **the detail map**, on the same world uv (metres / 16) — it is the finest
  grain either surface has, so a coat without it is the smooth patch in the
  middle of a grainy country however well the whites match;
- **the surface terms** (wrap, glitter), weighted on the tiles by the cover the
  paint laid, so a hillside's meadow and bedrock are untouched.

The reach is affordable because **a material is not a mesh**: the tiles are
already drawn to 640 m, so the shading costs a hash and a `pow` per ground
fragment and not one triangle. The sheet is the expensive half, and it is the
only half that needs to follow anything.

And a term capped by DISTANCE must fade, never stop. The glitter is hashed per
1/7 m: past ~160 m a crystal is under a pixel and it becomes crawling noise, so
it fades over a band every snow surface shares — a cap per surface would just
be a new edge.
