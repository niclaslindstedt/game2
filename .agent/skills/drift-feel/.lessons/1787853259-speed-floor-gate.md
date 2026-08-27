---
title: A speed floor on the slide has to gate every lever, and it costs the sim table three-quarters of its drift time
date: 2026-08-27
scope: engine/game/car.ts, engine/game/defs/tuning.ts, tests/simulation_test.ts
concepts: [drift, speed-floor, handbrake, sim-table, readout]
---

Gating `slideFactor`'s output alone leaves three holes. `handbrakeYaw` adds
yaw straight into the model without passing through `sliding`, and
`handbrakeGrip` cuts the lateral recovery rate in the redirect further down —
so the lever still produced 11° of slip at 45 km/h under a floor that was
supposed to make drifting impossible there. And `car.drifting` was read off
`car.u > drift.minSpeed`, which called that understeer a drift and lit the
dust and the counter for it. Return the gate from `slideFactor` (`open`) and
multiply all three by it; drop `minSpeed` and read `drifting` off `sliding > 0`
instead — the slide's own gate is the only speed test that can no longer
disagree with itself.

Two numbers to expect. The ramp width matters more than it looks: 10 km/h
(`slideSpan` 2.78) quietly moves the rule to ~80 km/h and cost the sweep 60% of
its remaining drift time versus 5 km/h (1.39). And a 70 km/h floor is
expensive at this bot's pace — `make sim` went from 9.5 s to 3.9 s average
drift time and 93 → 92 km/h, because the bot brakes most corners below the
floor. `tests/simulation_test.ts` asserting every hard-corner stage gets
drifted is the tripwire, and it passes at 5 km/h and fails at 10.
