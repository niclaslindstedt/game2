---
title: What lands on the glass must be read off the GROUND, never off how filthy the car already is
date: 2026-09-01
scope: pwa/src/game/car-dirt.ts, pwa/src/game/car/wipers.ts
concepts: [dirt, glass, wipers, surfaces, rates]
---

The screens' road soiling is a coat per METRE (`SOIL.*.road` in
`car/wipers.ts`), and it used to be scaled by `dirt.level()` — the car's own
accumulated filth. That reads as sensible and is wrong in a way nobody sees
until they drive a long sealed section: a level only ever goes UP, so once a
car has picked up a coat anywhere, every metre it drives thereafter keeps
caking the windows, tarmac and grass included. `dirtRate` already returns
`{dust: 0, mud: 0}` for asphalt, so the PAINT stopped and the glass did not,
and the two disagreeing is what the bug looked like.

The rule: anything metered per metre must be multiplied by what the ground is
throwing RIGHT NOW, which is a fresh reading of the surface under
`state.progressIndex` (plus `state.offRoad`) — never by an accumulator.
`glassSpray` is that reading for the screens.

The other half is that the glass and the paint want DIFFERENT answers from the
same surface. The verge makes the paint muddier than gravel does and puts
nothing at all on the windows: what a wheel lifts off turf is flung low and
wet at the sills, where a screen is filmed by a raised cloud that only a loose
dry surface makes. So `glassSpray` is a second function beside `dirtRate`
rather than a scale on it — expect any new surface to need a row in both.

When re-basing a rate that used to ride an accumulator, keep the surface it
was tuned against at 1: the accumulator sits at 1 for most of a stage, so a
gravel metre is the calibration point and the numbers in `SOIL` need no
retuning.
