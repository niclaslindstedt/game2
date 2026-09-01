---
title: The run's fix cannot follow a car BACKWARDS — it hunts from progress, reaches 15 samples back, and widening that for everyone regresses the bot
date: 2026-09-01
scope: engine/game/step.ts, engine/game/track.ts
concepts: [progress, sampling, off-road, reverse, bot-tuning]
---

`locate`/`locatePoint` search `hint-15 .. hint+45`, and `step()` passes
`state.progressIndex` — the monotonic MAX. So a car that has doubled back
more than ~30 m is pinned to the far end of that window: it reads the
heading of a corner it is nowhere near, and its lateral offset against that
sample makes it `offRoad`, then `lost`. A car squarely on the road, told
RETURN TO TRACK, on "nature" grip. (Sibling of
`progress-is-not-position.md`: that one is about phrasing a RULE on
progress, this one about the SEARCH reaching from it.)

The obvious fix — a `state.fixIndex` that follows the car both ways and
becomes the hint for both calls — is measurably wrong. It is provably
identical for a forward-only run, but off-road it lets the hint walk back
and lock onto an earlier part of a road that loops near itself. Measured on
`tests/simulation_test.ts`'s endless seed 7: 1774 m driven → 1002 m, 0
respawns → 3, 2 impacts → 18. That test is the tripwire; run it before
believing any change to the hint.

What works is a SECOND cursor owned by whatever asks the backwards
question — `state.wrongWayAt`, re-located only when
`fix.index < state.progressIndex`, so a car at its own progress pays
nothing. Physics keeps the progress-anchored fix it was tuned against.
Where that honest fix contradicts the clamped one, say so explicitly rather
than letting both flags stand: `state.lost = !state.wrongWay &&
trackLost(state)`.

Any test that hand-places a car by writing `state.progressIndex` must write
the new cursor too, or it searches from 0.
