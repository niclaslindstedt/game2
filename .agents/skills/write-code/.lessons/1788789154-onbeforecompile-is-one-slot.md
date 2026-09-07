---
title: `onBeforeCompile` is ONE slot and a car is meshes SHARING materials — chain the grafts, and make the chain idempotent
date: 2026-09-07
scope: pwa/src/game/
concepts: [rendering, three, shader, materials, car-design]
---

Two modules that both want a word in the same material's shader silently
overwrite each other: `material.onBeforeCompile = fn` is a single slot, and
whichever ran last wins. The loser does nothing at all — no error, no missing
symbol, its `.replace` simply never matches. This bit when a per-vertex gloss
graft (`car-surface.ts`) and the lamps' wash (`car-glow.ts`) landed on the
same body.

Chaining is the fix, and it has two conditions that are easy to miss:

- **It must be IDEMPOTENT.** Panels, parts and wheels deliberately share one
  material, so a `group.traverse` that grafts "each material it finds" reaches
  the same material a dozen times. Assigning made that harmless by accident;
  chaining emits the declarations a dozen times and the vertex shader dies
  with `'vCarGlow' : redefinition`. The car then draws NOTHING — a
  body-shaped hole with its glass and lamps still floating in it, which reads
  as a geometry bug rather than a shader one. Keep the applied keys on
  `material.userData` and return early on a repeat.
- **It needs `customProgramCacheKey`.** Three's default key is
  `onBeforeCompile.toString()`, and every chained wrapper has identical
  source text — so a material carrying one graft can be handed the compiled
  program of a material carrying two.

To DIAGNOSE this class of bug, forward the page console. `scripts/debug-shot.mjs`
only forwards `pageerror`, and a GLSL compile failure arrives as a
`console.error` from three — so the picture comes back wrong with nothing in
the terminal. A throwaway Playwright script with `page.on("console", …)`
prints the exact `ERROR: 0:153:` line. It must live inside the repo:
`playwright-core` will not resolve from the scratchpad.
