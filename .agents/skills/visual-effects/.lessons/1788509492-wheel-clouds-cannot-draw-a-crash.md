---
title: Every ground cloud in the game spawns at an AXLE — so a car that is off its wheels disturbs nothing, and its landing bursts appear in mid-air
date: 2026-09-04
scope: pwa/src/game/renderer.ts, pwa/src/game/crash-throw.ts, pwa/src/game/dust.ts
concepts: [particles, dust, roll, crash, spawn-position, readability]
---

`dust.ts`, `plume.ts` and `drift-spray.ts` all spawn at `AXLE.front` /
`-AXLE.rear` / `AXLE.side`, because on a normal stage everything that moves
ground is a tyre. Two things follow the moment a car goes over, and neither
is visible from reading the FX code:

- **The continuous cloud stops.** The whole ground-FX block is gated on
  `!car.airborne` and reads wheel positions, so a body grinding along on its
  roof at 60 km/h — the single most violent thing that happens in a run —
  throws nothing at all.
- **The bursts appear in mid-air.** A `landing` fires for every shell contact
  of a roll, and `atWheels` obligingly puts four bursts at the wheels. On its
  roof those are the two HIGHEST points on the car: the dust comes off a
  metre and a half above the ground with nothing under it, while the corner
  actually ploughing throws none.

The fix is a contact point, not a bigger number: `crashContact(tilt)` walks
the same hull `engine/game/roll.ts` stands on the ground and returns the
lowest corner as an offset from the car's origin, so the burst leaves from
whatever is down — sill on a flank, roof when inverted, wheels while upright.

Two things worth keeping from doing it:

- **Split the arithmetic out DOM-free** (`crash-throw.ts`, the pattern
  `drift-throw.ts` set). The interesting claim — that a body on its roof
  throws from its roof — is a unit test, and no screenshot of a thousand
  stones in the air can check it.
- **The grind is a RATE and the burst is a COUNT**, and they are different
  functions for that reason. Carry the grind's fraction across frames, and
  drop the debt while the body is airborne between contacts or a long flight
  lands as one enormous puff.
