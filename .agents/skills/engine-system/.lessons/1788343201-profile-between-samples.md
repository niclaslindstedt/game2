---
title: A road read where the car IS must be interpolated between samples in every dimension a wheel can feel — or a car running wide reads a kerb every two metres
date: 2026-09-02
scope: engine/game/track.ts, engine/mapgen/terrain.ts
concepts: [terrain, road, ground-follow, sampling, jumps]
---

`locate` interpolates the CROWN between the two nearest samples and has for
a long time. The cross-profile it added on top was the nearest sample's
alone, and the profile is not the same shape at both: the width wanders
(R33), a corner's bank ramps in, a paved mat lifts. Down the middle the two
agree to a millimetre; at the edge — the berm, the chamfer off a lifted mat,
the outside of a banked turn — they differ by a hand's width, and the moment
the nearest sample changes hands the ground under a car on the shoulder
steps by that much. Invisible while the car's height was carried forward
from the step before; the instant the ground was read where the car had
moved TO, the bot running wide at pace was thrown off a kerb nobody laid
(`make sim` showed it as jumps and spins climbing on the fast car, none of
them near a lip).

Blend the whole profile by the same `f` the crown uses — `profileOf(s) +
(profileOf(next) − profileOf(s)) · f` — and do the same in
`terrain.corridorGround`, whose `ribbonY` off the nearest sample had the same
sawtooth: the road and the country have to agree at the verge line to a
centimetre (`tests/ground_test.ts` holds them there on a graded stage), or
crossing that line is a step the car drops down.

The probe that finds this class of bug in minutes: log every `takeoff`
event from a bot run with `state.lateral` and whether a `jump` sample is
within eight samples. Takeoffs at 3–7 m of lateral with no lip near are
the profile, not the physics.
