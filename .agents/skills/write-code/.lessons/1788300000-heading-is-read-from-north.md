---
title: The engine's heading is read from +z — travel is (sin h, cos h), the driver's LEFT is (cos h, -sin h), and a north-up east-right map mirrors every call
date: 2026-09-01
scope: scripts/, engine/mapgen/
concepts: [heading, coordinates, map, preview, tooling]
---

A sample's `heading` is not the usual angle from +x. `search.ts` walks the
route with `x += sin(heading) * step; z += cos(heading) * step`, so travel is
`(sin h, cos h)` and the heading grows from north toward east. The side the
nose moves to as `h` grows — the driver's LEFT, the side `search.ts` puts a
left turn's centre — is therefore `(cos h, -sin h)`, not the `(-sin h, cos h)`
a quarter-turn on the conventional angle would give. Anything that measures
"how far left of the road" with the conventional formula reads every distance
wrong and only shows it as nonsense numbers (solids at zero metres from a road
they stand twenty metres off).

The same fact decides a top-down picture's handedness. With north up and east
to the RIGHT, a growing heading turns clockwise on screen: a `dir: 1` pacenote,
which the HUD reads out as LEFT (`snapshot.ts`), draws as a right-hander. The
level map (`scripts/lib/level-map-render.mjs`) draws north up with east on the
LEFT so its `L`/`R` labels bend the way the driver finds them; the older
`track-preview.mjs` schematic and `stage-render.mjs` are east-right, so a
corner's hand in those pictures is the driver's mirrored. Never read left or
right off one of them without saying which frame it is in.
