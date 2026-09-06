---
title: A rig's verge is the terrain's and moves with it — a scenario that rolls a car off the road must state the ground it rolls onto
date: 2026-09-06
scope: tests/
concepts: [test-conventions, terrain, roll, crash, verge, fixtures]
---

`compileTrack` lays a rig's road at its own height over whatever seed 0's
land is, and the terrain shapes the verge beside it by R31's rules — a
fill's side, a crest, a hand-over. Four rollover cases in `jump_test.ts`
threw the car off the road and measured what the roll did next (carried
speed, sliding time, stripped glass, a folded flank) on the 1-in-2 bank the
rig happened to stand on. When the terrain rounded every fill's crest, the
car landed on forty metres of near-level shoulder instead and all four
went red, on a change that never touched the car.

State the ground: a helper in the file (`onEmbankment`) replaces
`terrain.groundAt` past the lip with the bank the scenario means —
`ground(lip) − out · verge.climb`, bounded below by `farHeightAt` the way
a fill lands on the country — applied in `game()` so the whole file rides
one stated slope. The file already did this for its flat cases
(`groundAt = () => flat`); the rolling ones had inherited theirs.

Tell: a crash suite that goes red on a `terrain.ts` change with the
assertions off by a few m/s or a few frames. Re-picking entries is the
STRIPS test's own doctrine when the MODEL moves; when the ground moved,
pin the ground.
