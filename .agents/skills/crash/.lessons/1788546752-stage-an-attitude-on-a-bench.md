---
title: Measuring what an ATTITUDE is worth needs the turbulence pinned, the road left behind, and one step of flight — not a flown landing
date: 2026-09-04
scope: tests/, scripts/lib/crash-stage.mjs
concepts: [roll, measurement, scenarios, test-conventions, probes]
---

Three confounds, each big enough to invert the answer, and all three bit in
one session:

**The road's camber tilts the bed.** Every geometric question in the crash is
asked against the plane the body is on, and on the ribbon that plane is the
road's. A car staged at exactly `roll = π/2` is a couple of degrees off its
flank there, which is its own arm — several times the one under test. Move
the car 45 m to the side (as `crash-stage.mjs` does) and pin
`terrain.groundAt` to a constant.

**A second of falling is a second of turbulence.** `air.rollTurbulence` and
`pitchTurbulence` drift the attitude by a degree or two over a one-second
drop. Set `state.rng.next = () => 0.5` for anything measuring an arm; put a
real `createRng` back for anything measuring the ledger, which has to hold
with the only term that adds energy actually running.

**A flown landing varies four things at once.** A bigger throw is also a
longer flight — more air drag on the nose, more yaw authority carrying the
car off the road onto ground at a different height, and a different
`g × airTime` cap on the arrival. Measured that way a harder drop landed
SOFTER than a gentle one. Stage the car one step above the ground with the
descent and the rack position it is arriving with, step once, and read the
change across that step. `car.steer` is the rack, and setting it directly is
honest: it is where a driver who committed over the lip has the wheel.
