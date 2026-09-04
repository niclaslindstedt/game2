---
title: Stage a crash claim on a COMMITTED trip, never on a body balanced at the basin — and do not expect a brake to brake
date: 2026-09-04
scope: engine/game/roll.ts, tests/
concepts: [roll, measurement, scenarios, test-conventions, probes]
---

Two fixtures for "what can the driver do in a roll" look equally reasonable
and only one of them can carry a claim.

**A body stood at `WHEEL_BASIN` with `rollRate` 0 is a knife edge.** It is
exactly at its own tipping point, so the outcome is decided by whatever is
smallest — the same fixture rocked back through level and out to −77° with
NO input at all, and every input then read as "changes everything". Claims
made there are noise. Stand a committed trip instead: a lean inside the
basin, a real roll rate (~2.2 rad/s) and real sideways speed (~8 m/s), which
is how a rally car actually goes over. Outcomes there are stable and the
inputs separate cleanly.

**And do not measure a brake as retardation.** A body already sliding has the
ground dragging at the WHOLE of the patch's budget in the direction it is
travelling, and no pedal can ask for more friction than the patch has — so
over a half second the brake and a coasting crash shed the same speed, and a
test written on that reads a working feature as broken. What a brake actually
buys is measurable and worth asserting: the roll ENDS SOONER (0.4 s on one
trip) and ends with the car on its wheels instead of overturned. Read the
crash's own length and where it finished, not its speed at an arbitrary
instant.

Two timing traps in the same fixtures: a run longer than
`roll.lieFor` past the roll's end has RESPAWNED, so anything asserted about a
wrecked car's state after ~2.5 s is being asserted about a fresh car on the
road; and `car.rolling` going false is not the car being level — the hand-back
happens at whatever angle the tyres came down at.
