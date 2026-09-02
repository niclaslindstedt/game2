---
title: A module-level constant computed from a default (`biomeFor()` at import) is a hidden branch — make it a memoized function of the id
date: 2026-09-02
scope: pwa/src/game/
concepts: [biome, renderer, module-scope, defaults]
---

`ground-tint.ts` built `WILD_DUST` and `STONE_DUST` at import from
`biomeFor().ground`, which was fine while there was one biome and silently
wrong the day there were two: every desert verge threw taiga-green turf.
Nothing typechecked differently, nothing threw, and the only tell was a
green cloud on sand in a screenshot.

The shape to look for is a top-level `const X = f(defaultThing())`. Replace
it with `xFor(id)` over a `Map` cache (`groundTints(biome)`) and pass the id
from the state that knows it (`state.track.knobs.biome`). The same trap sat
in `stage-render.mjs`'s hand-copied palette and in `item-catalog.ts`; grep
for `biomeFor()` with no argument after any change to what a biome is.
