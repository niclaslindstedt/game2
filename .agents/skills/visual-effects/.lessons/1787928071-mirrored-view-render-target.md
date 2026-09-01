---
title: A left-for-right mirrored view needs a render target — negating the projection's x reverses every triangle's winding
date: 2026-08-28
scope: pwa/src/game/
concepts: [rendering, three, camera, render-target, mirror]
---

The cheap-looking way to draw a mirrored view (a rear-view mirror, a reflection)
is to scale the camera's projection matrix by -1 in x and render into a
scissored viewport. It does not work in three.js: the flip reverses the winding
of every triangle on screen, and three decides front-vs-back facing from the
OBJECT's `matrixWorld` determinant, never the camera's — so front faces get
culled and the world renders inside out. Scaling the camera itself has the same
effect; `renderer.state` is not a supported place to force `gl.frontFace`.

Draw the scene upright into a `WebGLRenderTarget` and flip the TEXTURE instead:
`texture.wrapS = RepeatWrapping; texture.repeat.x = -1; texture.offset.x = 1`,
sampled by a `MeshBasicMaterial` on a full-viewport quad in an orthographic
pass. Using a stock material rather than a custom shader is what keeps the
colours right — three renders to a target in working (linear) space and applies
the output colour-space conversion and tone mapping only on the blit to the
canvas, which is exactly one conversion, the same as the main pass gets. Set
`autoClear = false` around the blit and `depthTest: false` on the quads. See
`pwa/src/game/mirror.ts`.
