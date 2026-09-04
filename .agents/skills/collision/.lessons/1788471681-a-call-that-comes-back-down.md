---
title: A damage call that can come back DOWN needs its own latch — `callDamage`'s once-per-line rule is the wrong shape for a temperature
date: 2026-09-03
scope: engine/game/cooling.ts, engine/game/collision.ts
concepts: [damage, calls, cooling, events, hud]
---

Everything else in the ledger only ever goes one way, so `callDamage` compares
the value before a bite against the value after and fires once per line
forever. A TEMPERATURE is the opposite: it is managed, so it crosses the same
line repeatedly and the driver wants to be told each time.

The shape that works is a latch of its own on the car, not in the ledger —
`CarState.heatCall` (0 nothing said / 1 warned / 2 in the red) — with each
line re-arming BELOW where it fires (`cooling.clearAt` under `redline`,
`warnAt * rearm` under `warnAt`). Without the gap, a needle sitting on a line
announces itself twice a second for the rest of the stage.

Two knock-ons worth knowing before you write one:

- **Heat belongs on `CarState`, not in `CarDamage`.** The ledger's contract is
  that nothing heals; a gauge that falls when the driver lifts breaks it.
- **Damage dealt over TIME has to bump `damage.version` itself.** Only
  `dealCrush` does it, so cooking an engine 120 times a second is invisible to
  everything watching the ledger — including `sim/trace.ts`, which writes a
  rival's whole run down and only keeps a copy of the ledger when the version
  changes. Book it on the PERCENT (`Math.floor(v * 100)` changing), not on the
  step, or a whole cook is a hundred and twenty re-bends a second.
