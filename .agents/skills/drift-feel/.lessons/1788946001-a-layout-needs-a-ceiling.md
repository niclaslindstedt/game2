---
title: A layout needs a CEILING as well as a depth, or every car is the same car the moment it is provoked
date: 2026-09-03
scope: engine/game/limits.ts, engine/game/defs/tuning.ts
concepts: [drift, drivetrain, provocation, handbrake, layouts, depth]
---

`askedSlide` used to lift a provoked layout toward **1** — the reference
slide — so the flick, the trailed brake and the lever all ended at the same
angle whatever car they were pulled in. The layout with the LEAST of its own
got the biggest lift, which is why the front-driver, the car the moves exist
for, came out of a hairpin on the lever as sideways as the rear-driver that
never needed one. `drivetrain[].depth` said how the three cars differ on the
wheel and nothing said how they differ when asked, so the roster's whole
spread lived in the one situation a rally driver spends least time in.

Give each layout a `cap` and lift toward that instead. Then `depth` is what
the wheel finds, `cap` is what the car can ever do, and the gap between them
is what a move is worth — three numbers that say three different things.
Sized 0.5 / 0.65 / 1 against the reference, that is the roster the player
actually meets: a hatch that has to be provoked and still tops out at half a
saloon's angle.

Watch two things when the caps land. `sat` gates the deepening forces off
`askedSlip`, which scales with the CAPPED `asked`, so a capped car also stops
being pushed sooner — the cap costs a little line as well as angle. And
anything ungated by `sat` ignores the cap entirely: `grip.handbrakeYaw` was,
and a held lever walked every layout in the roster to 87° and a spin no
matter what its own ceiling said.
