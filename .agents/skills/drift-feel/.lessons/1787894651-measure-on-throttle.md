---
title: A part-throttle lock sweep is blind to the drivetrain — measure the layouts on FULL throttle
date: 2026-08-28
scope: engine/game/car.ts, engine/game/defs/tuning.ts
concepts: [drift, probe, drivetrain, layouts, tuning-loop]
---

The skill's probe holds part throttle so the wheel's own authority is what
gets measured. That is right for `angleSpan`/`entryAt` work and WRONG for any
question about layouts: `powerYaw`, `pullStraight`, `pullIn` and `spin` are
all multiplied by `input.throttle`, so at 0.55 the three drivetrains are
nearly the same car and the table says nothing is wrong.

Run the sweep at both. On gravel at 32 m/s the part-throttle table had the
front- and rear-driver within a degree of each other at every lock; the
full-throttle one showed the FRONT-driver carrying more angle at every radius
and swinging 8× further past centre on the exit — the actual reported bug,
invisible at part throttle.

Sweep the SURFACE at the same time, and expect the fault to live on one of
them: the same roster was ordered correctly on asphalt (rear-driver slidiest)
and inverted on gravel, because the tyre split (`tyres.loose`) is large enough
to overwhelm the layout knobs on the surface the game mostly runs on. A
layout bug that reproduces on only one surface is still a layout bug.
