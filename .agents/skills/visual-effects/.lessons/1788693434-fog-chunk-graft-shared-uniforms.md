---
title: To reach every material at once, replace three's fog ShaderChunk and share uniforms as PLAIN objects — a Vector is cloned per material, a literal is not
date: 2026-09-06
scope: pwa/src/game/height-fog.ts, pwa/src/game/sky-shader.ts
concepts: [rendering, shaders, fog, uniforms, three]
---

Anything that has to happen on every fragment of the world — height fog,
a shadow read off a map, a cloud shadow — cannot be done material by
material: chunks and instanced flora are hundreds of materials made in
many modules. The one seam every built-in material passes through is the
fog chunk, and `THREE.ShaderChunk.fog_*` is a plain object three reads at
COMPILE time, so replacing the four strings once before the first render
(height-fog.ts's `installHeightFog`, called at module load) reaches all of
them. `transformed` and `modelMatrix` are in every vertex shader, so the
graft can carry a world position down; `cameraPosition` is in every
fragment shader.

Uniforms are the trap. three clones a material's uniforms per material
(`UniformsUtils.clone`) and refreshes only fogColor/near/far/density, so a
value added beside them is a frozen copy — UNLESS it is a plain
`{x, y, z, w}` literal: the cloner copies Vectors and Colours and keeps
anything else by reference, and `setValueV4f` accepts any object with
`.x`. Add the entries to `UniformsLib.fog` AND to every
`ShaderLib.*.uniforms` that has `fogColor` (ShaderLib was built at load
time), mutate the literals in place each frame, and every material reads
them. Textures clone the wrapper but share the `source`, so rewrite the
data and set `needsUpdate`, never assign a new texture.

The reverse trap on a ShaderMaterial of your own: an ARRAY of vec4
(`uniform vec4 u[4]`) is uploaded through each element's `toArray`, so it
must be real `THREE.Vector4`s — a plain object there dies at first render
with `r.toArray is not a function` and no shader error.
