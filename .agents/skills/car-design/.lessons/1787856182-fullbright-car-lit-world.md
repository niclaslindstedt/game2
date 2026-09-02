---
title: The world is LIT and the car is not — a fullbright body needs the environment's tint, and the lamps need exempting from it
date: 2026-08-27
scope: pwa/src/game/
concepts: [car-design, rendering, lighting, environment]
---

The car body is `MeshBasicMaterial` with its shading baked into vertex colors
(`car/builder.ts`), while the terrain, road, flora and props are
`MeshLambertMaterial` lit by the environment's hemisphere and sun. So nothing
in the scene can reach the car: at dusk the world drops to roughly a third of
its noon brightness and the car alone stays at noon, sitting on the landscape
like a sticker. `docs/architecture.md` claiming "everything is fullbright" is
what hides this — the world stopped being fullbright, the car did not.

`environment.carTint()` is the only thing that puts the light back, and a
hand-authored tint per time-of-day preset drifts from the lighting the moment
anyone retunes a preset (dusk's was 0xf2d8c4 — 95% of daylight, against a world
at ~30%). Derive it instead: the preset's own `hemiSky · hemiIntensity + sun ·
sunIntensity · sin(sunElevation)`, over the day preset's, with a floor so the
car stays readable. That is linear light, which is the space three.js
multiplies material colors in, so a 0.35 tint displays at about 0.6 — much less
dark than the number reads.

Two traps in `tintCar` (car-mesh.ts), which traverses the car and writes
`mat.color` on every basic material it finds: the TAIL LAMP bloom is one of
them, and tinting it bleaches the red out of exactly the thing the dark is
supposed to make brighter (exempt it by `material.name`). And anything BLACK
put inside the car group comes out of the traversal as a pale disc — the tint
multiplies a black material's colour up to the tint itself. Nothing dark
belongs in the group; the car's shadow is not geometry at all but the sun's
shadow map (car-shadow.ts), which the tint never reaches.
