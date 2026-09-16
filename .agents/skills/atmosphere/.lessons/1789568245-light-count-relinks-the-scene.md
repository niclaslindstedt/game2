---
title: The car's light SWITCH is the only thing that moves the scene's light count — and moving it relinks every lit material
date: 2026-09-16
scope: pwa/src/game/car-lamps.ts, pwa/src/game/renderer-frame.ts, pwa/src/game/environment.ts
concepts: [light, performance, rendering, measurement]
---

three.js compiles a material against however many lights are VISIBLE:
`numSpotLights` is `lights.spot.length` (visible lights only — `projectObject`
early-returns on `visible === false`), it goes into the program cache key, and
it is SUBSTITUTED TEXTUALLY into the shader source. So the frame on which that
number changes is the frame every lit material in the scene is compiled and
linked again — half a second of nothing, and this repo has ~84
`MeshLambertMaterial` sites.

`car-lamps.ts` already avoids two ways of moving it, and says so: the beams are
standing lights switched on and off rather than lights built per car, and the
brake lamps are driven to zero intensity rather than hidden. The third way is
the NIGHT SWITCH itself, and the sky throws it on its own clock — at a sunrise,
or when a deck heavy enough for `lampsAt` comes over at noon. That is a stall
in the middle of a corner, and it is not the palette update it looks like.

Measure the claim in Node, not the browser: walk `mainOf`/`dippedOf` against
each car's `headLampSources(bodySpecFor(car))` under each `LAMP_BEAMS` row and
count. `dipped -> off` moves on every car and every row; `main -> dipped` moves
on `full`, where dipping puts the driving lamps out — so the old doc claim that
"the two LIT stops cost the same" was false.

The fix is not to lock the time of day. It is `warmStages`, walked from
`renderer-frame.ts`'s `warm()`: stand the beams at every distinct count and let
the loading card pay for the programs. Anything added later that hides or shows
a light mid-run owes the same warm.
