---
title: A timed sequence that suspends driving is an early return in step() — put the clock that still costs the player ABOVE it
date: 2026-08-27
scope: engine/game/step.ts
concepts: [run-phases, respawn, events, stats, orchestration]
---

The drowning (`TUNING.crash.drown`) is the worked example: for five seconds
the car is in the water and nothing the player does reaches it. It is a
`state.drowning` field plus `if (state.drowning) { stepDrowning(...); return }`
placed immediately after `state.raceTime += T.dt` in `step()`.

The placement is the whole design. Everything below that line — `locate`,
progress, the surface edge, off-road accounting, the jump-lip check, the
wedge clock, `input.reset` — must NOT run during the sequence, or the
penalty quietly inflates `offRoadTime`, the wedge rule respawns the car out
from under the sequence, and the reset input cancels a penalty that exists
to be paid. What DOES belong above the return is anything that should keep
costing the player: the race clock, and the wind (it blows in every phase).

Two more things the pass had to get right:

- **`respawn()` is the one place that clears the field.** The sequence ends
  by calling it, so a reset, a wedge rescue and the sequence's own exit all
  leave the same clean state without a second clearing site.
- **A phase-specific event gated only on geometry fires during the entry
  transient.** `sink` ("the roof went under") fired at t≈0.15 s, because a
  fast plunge ducks the whole car under on the way in and corks it back up.
  The condition needs the PHASE in it (`gone > 0 && ...`), not just the
  height test. Probe the trajectory (a scratch `_test.ts` that dumps state
  per step to a file — vitest swallows `console.log`) before trusting an
  edge like that.
