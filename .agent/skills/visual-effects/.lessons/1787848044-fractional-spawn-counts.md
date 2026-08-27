---
title: A per-spawn particle count that gets scaled then rounded silently becomes zero — carry the remainder instead
date: 2026-08-27
scope: pwa/src/game/dust.ts, pwa/src/game/renderer.ts, pwa/src/game/fumes.ts
concepts: [particles, dust, spawn-rate, tuning]
---

Continuous clouds spawn a handful of grains many times a second, so the
per-spawn count is small to begin with (4 off each rear wheel, every
0.03 s). Multiply that by anything — an effects-budget scale, a pace
factor, a surface factor — and `Math.round` per spawn turns a thin trickle
into silence: 0.14 grains rounds to 0 forever, and the effect does not fade
out, it switches off. Rounding also costs a fifth of the cloud at 1.2.

Carry a fractional debt across spawns instead (one `let` in the renderer's
closure, `Math.floor` and subtract). A tenth of a grain per spawn then
comes out as one grain every ten spawns, which is what "thinner" should
mean.

Two things follow from the same arithmetic. A branch with no speed gate
(`state.offRoad` had none) keeps a stationary car spewing forever, so gate
every continuous cloud on speed as well as state. And scale SPREAD with the
same factor you scale count by: a thinned count inside an unchanged spread
is the same wide skirt with holes in it, where the two together read as a
smaller cloud.
