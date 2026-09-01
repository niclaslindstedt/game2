---
title: A deterministic engine only replays if the tape holds exactly what it RECEIVED — quantize at the input source, and watch for -0
date: 2026-08-27
scope: pwa/src/game/ghost.ts, pwa/src/game/input.ts
concepts: [determinism, input, replay, harness]
---

The engine replays a run perfectly from a list of `CarInput`s — same seed,
same car, same 120 Hz steps, same road. What breaks that is recording an
input the engine did not get: round a float to fit a byte AFTER the step and
the replay drives a slightly different corner, then a very different one.

So the quantization goes at the SOURCE. `input.ts` snaps `steer`, `throttle`
and `brake` onto the tape's grid (`snapSteer`/`snapPedal` in `ghost.ts`)
before building the `CarInput`, so the number driven is the number written
down and the replay is bit-exact rather than merely close. 1/127 of full
lock is far below what a key ramp or a thumb resolves.

**`Math.round` returns `-0` for anything in `(-0.5, 0]`.** A byte tape cannot
carry that sign, so a live run steering a hair left of centre and its replay
would differ by `-0` vs `+0` — equal under `===`, different under
`Object.is`, and JS propagates the sign through `Math.sign`, `Math.atan2` and
`1/x`. The snap returns positive zero explicitly. A test comparing recorded
inputs with `toEqual` is what catches it; comparing car positions would not,
until much later.

Verify a replay by asserting the SAMPLED LINE, not only the finish time:
push `car.x/z/heading` every 120 steps in both runs and `toEqual` the arrays
— that says WHERE a divergence began instead of only that one happened.
