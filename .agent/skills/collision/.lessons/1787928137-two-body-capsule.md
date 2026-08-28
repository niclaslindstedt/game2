---
title: Car-against-car needs its own solver — the solid model's closing speed is ABSOLUTE, so two cars at pace read as no contact at all
date: 2026-08-28
scope: engine/game/collision.ts
concepts: [collision, physics, rivals, damage]
---

`collideCar` resolves the car against `WildObstacle` circles, and its whole
model assumes the other side is ANCHORED: `closing` is read straight off
`car.u`/`car.w`, and `meetSolid` decides how much of a wall the thing is from
its own mass and rooting. Point it at another car and both halves are wrong —
two cars nose to tail at 30 m/s have a closing speed of 30 in that reading and
would fold each other flat, while a genuine 3 m/s rear-ender would be scored
as a 30 m/s wall.

`collideCars` is the second solver, in the same file: RELATIVE velocity read
AT the contact point (`v + yawRate × r`, where the engine's right axis is
`(cos h, −sin h)`, so a point `r` ahead of centre moves at `yawRate·r` along
it), a two-body impulse over `1/mA + 1/mB`, separation shared by inverse mass,
and both damage ledgers written. Three details worth keeping:

- **Capsules, not boxes.** Two OBBs need a SAT solve, and the normal it yields
  SNAPS between faces as one car slides down another's flank — exactly the
  contact that has to feel smooth. A spine of `halfLength − halfWidth` with the
  half-width as its radius gives one continuous normal.
- **Read the penetration BEFORE any fallback normal.** Two cars on one line
  (the whole field spawns on `track.samples[0]`) give a segment distance of
  exactly 0; if the fallback rewrites `d` to the centre distance and
  `penetration` is computed after it, the correction pushes them TOGETHER.
- **Crush is shared, not doubled.** A tree does not deform and a car does, so
  each side folds `cars.crushShare` (~0.45) of what the same closing speed into
  a trunk would fold. Using `crushPerSpeed` raw on both makes a tap between two
  cars cost twice a tree.
