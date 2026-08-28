---
title: Per-particle size, spin and fade come from grafting onto PointsMaterial, not from a new shader
date: 2026-08-28
scope: pwa/src/game/dust.ts, pwa/src/game/textures.ts
concepts: [particles, smoke, three, shaders, materials]
---

A `PointsMaterial` draws every point at one size, one opacity and one mask
angle, and those three constants are the whole reason an untreated point
cloud reads as sprites however good the sprite is. Smoke needs all three
per particle — born small and SWELLING, turning over on itself, thinning
out of existence rather than popping.

Write it as `onBeforeCompile` on a real `PointsMaterial` rather than a
`ShaderMaterial`: three's own points shader keeps the size-attenuation
maths (its `scale` uniform is the drawing-buffer height, which a hand-rolled
shader has no access to), the fog, the tint and the clipping planes. Add
`aScale`/`aFade`/`aSpin` attributes, replace `gl_PointSize = size;`,
`vec4 diffuseColor = vec4( diffuse, opacity );` and
`#include <map_particle_fragment>` (rotate `gl_PointCoord` about 0.5 —
sampling outside the square is safe against a mask with a transparent rim).
**Set `customProgramCacheKey`**: without it two puffy materials whose grafts
differ share one program and the second silently gets the first's shader.

The mask matters as much as the shader. A blob whose alpha climbs evenly
toward the middle is a radial gradient, and at two metres across that is a
lens smudge — the rim has to be built from OFFSET LOBES with no disc under
them, and the bright core has to sit off-centre so the puff has a top.
