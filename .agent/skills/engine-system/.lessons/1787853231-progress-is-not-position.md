---
title: Progress along the centerline says nothing about WHERE the car is — a rule written as "progress reached X" fires for a car a hundred metres off the road
date: 2026-08-27
scope: engine/game/track.ts, engine/game/step.ts
concepts: [progress, finish, off-road, sampling]
---

`locate()` picks the nearest centerline sample inside a bounded window around
the last one, with no lateral limit at all, and `state.progressIndex` is the
monotonic max of that. So progress keeps climbing for a car driving up the
mountain BESIDE the road, and any gameplay rule phrased as "progress reached
sample N" fires out there too. That is how the finish used to end a run for a
car that never went near the finish line.

Anything positional needs a positional test. The finish is the worked example
(`crossedFinish` in `engine/game/track.ts`): the plane across the road at the
gate, crossed forwards, with the crossing point inside the gate's half-width —
a segment test over the pre-move and post-move positions, which also counts a
car airborne over the line and costs nothing at 120 Hz. Ask it right after the
move, before `respawn()` can teleport the car across the line.

The other half of the same rule: a respawn target derived from progress must be
clamped to the same gate, or the reset button drops the car on the far side of
a line it still has to cross and the run can never end.
