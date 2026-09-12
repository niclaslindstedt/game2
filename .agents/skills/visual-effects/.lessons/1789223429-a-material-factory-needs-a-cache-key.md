---
title: A material FACTORY must give each material its own customProgramCacheKey — otherwise one surface silently draws with another's shader and still looks plausible
date: 2026-09-12
scope: pwa/src/game/snow-shader.ts, pwa/src/game/
concepts: [shaders, materials, three-js, on-before-compile, renderer-seam, debugging]
---

`graftShader` (car-surface.ts) documents this for CHAINED grafts. It is just
as true for a factory that builds materials and assigns `onBeforeCompile`
itself, and `snow-shader.ts`'s `snowLambert` is exactly that.

Three's default program cache key is `material.onBeforeCompile.toString()`.
A factory writes the SAME function source into every material it makes, so
two of its materials that also agree on every other program parameter —
material class, `vertexColors`, a `map`, `fog`, lights — get one compiled
program, whichever compiled first. The graft's BODY differs per caller and
the key cannot see it.

What that looks like: the snow coat and the country's ground tiles collided.
The coat drew with the tiles' shader, read a `snow` vertex attribute its own
geometry does not have (so `0`), took the cover weight from it, and lost its
wrap lighting, its glitter and its blanket-depth discard. Nothing threw,
nothing was missing, and the surface still looked like snow — it was just
quietly a different surface. Note `transparent`, `depthWrite` and
`polygonOffset` are render state, NOT program parameters, so they do not
separate two materials either: the coat and the TRAIL had been sharing a
program since the trail landed.

The fix is one line — `material.customProgramCacheKey = () => \`snow:${name}\``
— and every caller names its surface.

**The debugging lesson is the cheaper half.** When a shader graft appears to
do nothing, check the cache key BEFORE reading the GLSL. The tell is that
the graft is provably in the bundle and provably correct, and a screaming
colour in it reaches SOME meshes and not others. A two-colour probe settles
it in one build: tint the suspect surface's vertex colours green and make
the graft paint red — a surface that comes back green is running somebody
else's program.
