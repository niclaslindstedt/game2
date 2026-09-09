---
title: Patching a SHARED material with onBeforeCompile needs a customProgramCacheKey, or three.js hands it the unpatched program
date: 2026-09-09
scope: pwa/src/game/
concepts: [three, materials, shaders, instancing, snow]
---

Adding an effect to the world's existing shared materials (`snow-cap.ts`'s
load on the flora, the wild's stone, the buildings, the fences) is far
cheaper than a second set of meshes: one uniform and a dozen instructions,
no new geometry and no new draw call — and read in WORLD space it varies per
instance for free, so two of the same instanced tree wear different snow.

Three things it needs to actually work:

- **`material.customProgramCacheKey`.** three.js keys its program cache on
  the material's PARAMETERS, so a patched `MeshLambertMaterial` and a plain
  one share a compiled program and whichever compiled first wins. Compose
  the key rather than replacing it, and compose `onBeforeCompile` the same
  way — the flora's leafy material already sways in that hook.
- **Inject at `<project_vertex>`, not `<begin_vertex>`**, to see the final
  `transformed` (the sway included), and multiply through `instanceMatrix`
  under `#ifdef USE_INSTANCING` before `modelMatrix` for the world position.
- **Take the world normal off `normal` AFTER `<normal_fragment_maps>`**, via
  `normal * viewMatrix` (the transpose is the way back from view space):
  that is the normal three.js has already flipped for a double-sided leaf,
  so a blade of grass is not snowed on its underside.

And a fade is not an effect: a lie mixed by a smooth factor reads as a wash.
Compare the amount against a threshold that WANDERS with a noise field and
the same term reads as clumps with the surface showing between them.
