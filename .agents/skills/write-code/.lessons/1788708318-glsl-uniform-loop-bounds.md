---
title: A GLSL loop bound that is a uniform cannot unroll — emit one function per depth from TypeScript instead
date: 2026-09-06
scope: pwa/src/game/
concepts: [rendering, shaders, three, performance]
---

The pattern `for (int i = 0; i < MAX; i++) { if (i >= uOctaves) break; … }`
is the standard way to give a GLSL loop a runtime trip count, and it is
expensive in the one place these shaders run: the compiler cannot see the
count, so nothing unrolls, the amplitudes and the divisor stay live
registers, and every iteration carries a compare and a branch. On the sky
dome that is paid per screen pixel, and through the fog graft
(`height-fog.ts` replaces three's fog chunk for EVERY material) it is paid
again on every lit fragment in the frame.

The shader sources here are template strings, so the fix is to emit the
depths that are actually read rather than to pass them in:
`cloudNoiseGlsl(fields, fbms)` in `cloud-field.ts` returns one
`cloudFbm<n>` per depth with a literal bound, and `sky-shader.ts` builds
its whole fragment source from the look — the sheet loop bounded by the
stack really drawn, the sunlit sample compiled out rather than branched
past.

Two things this costs, both manageable:

- **The shader must be rebuilt when the look moves.** Assign
  `material.fragmentShader` and set `needsUpdate`, guarded by a comparison
  against what it was last built for — three rebuilds the program on every
  `needsUpdate`, and a rebuild per frame is a stall per frame.
- **Emit only the depths read.** Each function is one more for a phone to
  compile at the first frame it is needed, and GLSL wants a function
  declared before it is called, so the emission order matters.
