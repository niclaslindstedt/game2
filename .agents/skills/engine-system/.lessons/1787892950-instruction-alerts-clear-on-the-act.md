---
title: An alert that gives an INSTRUCTION clears when the instruction is carried out, not when its trigger thresholds reverse
date: 2026-08-28
scope: engine/game/track.ts, engine/game/defs/tuning.ts
concepts: [hud, guidance, hysteresis, off-road]
---

Symmetric hysteresis is the right shape for a READOUT — a drift flag, a
surface, anything the player only watches. It is the wrong shape for an
alert that tells the player to DO something. `trackLost` carried clear-side
thresholds (`nearClear`, `awayClear`) beside its on-side ones, so RETURN TO
TRACK went dark as soon as the car got within 15 m of the way home or nosed
under 90° toward it: the guidance quit with the last stretch of scrub still
to pick through, and came back on the first steer that wandered.

The honest clear condition is the ACT itself — here `!state.offRoad`, the
track actually back under the wheels. It is also strictly better
hysteresis than a pair of numbers, because the only thing that can turn the
sign off is an event the player cannot half-do, so there is nothing left to
chatter across. When a guidance flag needs a threshold on only one side,
say so in the tuning comment and delete the other pair rather than leaving
them unused.
