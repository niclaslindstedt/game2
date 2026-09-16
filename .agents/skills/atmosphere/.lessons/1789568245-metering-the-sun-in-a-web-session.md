---
title: The sun's clock is unreachable in a web session — enter the stage near the transition with `?hour=`, and know that `?start=1` never warms
date: 2026-09-16
scope: pwa/src/game/, scripts/
concepts: [harness, measurement, rendering, light, verification]
---

Two things make "meter what happens when the sun crosses X" fail here, and
both cost a long time to find.

**The stage clock is ~15x slower than wall time.** Software rasterization gives
about 0.6 drawn frames a second and the step is clamped, so 90 s of waiting
buys ~6 s of race. An hour of sun is a minute of racing, so First Light's lamp
transitions (race t ~= 37 s and ~= 117 s) are simply not reachable inside a
metering window. Do not wait them out: compute the hour the transition happens
at (walk `sunHourAt` + `sunAt` + `lampsAt` in Node) and enter the stage a few
sun-minutes before it with `?hour=`. Beware that the pre-race sequence also
burns wall time, so the sun can cross during the countdown — read the actual
state off the debug overlay (`?debug=1`, then `[data-k="lamps"] .debug-row-v`)
rather than assuming the start hour still holds.

**`?start=1` does not run the loading card.** It never calls `beginLoad`, so
none of its steps run — including `warm`, which is where every shader is
compiled. Every deep-link harness (`screenshot.mjs`, `profile-render.mjs`)
therefore meters an UNWARMED scene, and a load-time fix cannot be verified
through that door at all. Verify such a fix with a vitest file instead: three.js
and `pwa/src/game/` modules both import fine under Node (see
`tests/car_shadow_test.ts`), so a scene, a lamp rig and a visible-light count
are all available there.

Useful probe either way: patch `WebGLRenderingContext.prototype.shaderSource`
and read the substituted counts — `#if ( N > 0 ) && defined( RE_Direct )` above
`SpotLight spotLight;`. The declaration `spotLights[ N ]` is guarded by
`#if NUM_SPOT_LIGHTS > 0`, so it cannot see the zero case.
