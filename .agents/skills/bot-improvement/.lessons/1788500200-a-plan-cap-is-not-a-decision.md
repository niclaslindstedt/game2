---
title: A cap added to the corner plan does nothing while the car is sideways — the drift branch and the flick overrule the pedals
date: 2026-08-30
scope: engine/sim/bot.ts
concepts: [bot-tuning, drift, corner-speed, respawn, handbrake]
---

`botInput` computes `targetSpeed` and turns it into a throttle and a brake —
and then three later branches throw that away. The drift branch sets the
throttle from the SLIP ANGLE alone (`1 - (1 - DRIFT_FLOOR) * deep`) and the
brake to zero, the flick pulls the handbrake off `hardCap`, and the trail
holds `TRAIL_BRAKE`. So a new cap wired only into the plan is honoured on a
gripped approach and ignored on exactly the approach that needed it.

Measured while making the respawn scars bite (`scars.ts`): the scar asked for
14.2 m/s through the stretch that had just ended the run, and the car came
through it at 33.9 — sideways from the previous corner the whole way, pedal
buried by the drift branch, never once looking at the plan. Wiring the same
cap into the two branches that overrule it (no flick into a place that has
already had you; drive off and let the slide shut when carrying one into
one) took the 25-seed heat sweep from 6 looped runs and 2 DNFs to 1 and 0.

So when adding any new reason for the bot to slow down, ask which of the
overrides can be live at that moment, and give each one the same rule. The
lift-mid-drift prohibition in the comments is about holding an angle open;
where the slide itself is the danger, shutting it is the correct move and
`throttle = 0` is how a driver does it.
