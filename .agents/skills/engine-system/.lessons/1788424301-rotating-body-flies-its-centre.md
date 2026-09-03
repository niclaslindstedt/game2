---
title: A body that is ROTATING must fly its centre of mass — handing it to the ordinary airborne step makes the ground rise and fall with its attitude
date: 2026-09-03
scope: engine/game/
concepts: [physics, airborne, roll, collision]
---

`stepAirborne` flies `car.y`, the wheel contact plane. That is right for a car
whose attitude barely moves, and wrong for one going over: the height at which
a rolling body meets the ground is a function of its ROLL, so as it turns in
the air the "ground" it is tested against rises and falls with it. The car then
chatters in and out of contact several times per face — 15–25 contacts in a
roll that should have four — and if each contact charges an impact, the roll is
dead before it has turned once.

The fix is to give the roll both halves of itself: track the CENTRE's height,
integrate it ballistically, and compare it against the centre-height curve of
the hull's own outline (`engine/game/roll.ts`). `car.y` is then derived on the
way out, for the rest of the game to read.

Two traps inside that:

- **The release cannot be re-derived from the height.** A body letting go of
  its pivot separates from the curve by ½g·dt² — a third of a millimetre —
  so any tolerance coarse enough not to chatter glues it back down for the
  first several steps of every flight. It needs a real state bit; `car.airborne`
  is the honest one, which means step.ts must dispatch on `car.rolling` FIRST
  and let the roll own its own air.
- **A pivot-exchange model must know what is SPRUNG.** Charging the wheels the
  rigid corner-swap impulse takes nine tenths of the roll the first time the
  body is levered up through level — no landing, however crossed up, can then
  roll a car at all. The springs hand that blow back (`roll.sprung`).
