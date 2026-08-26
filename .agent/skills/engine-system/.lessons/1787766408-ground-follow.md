---
title: Ground follow must interpolate BETWEEN centerline samples, and takeoff must look ahead
date: 2026-08-26
scope: engine/game/
concepts: [terrain, jumps, elevation, physics]
---

`locate()` returning the nearest sample's elevation makes the road a 2 m
staircase: a jump ramp climbs in ~0.5 m steps, and any "the ground fell away"
rule comparing this frame's height to the last one fires on the stair edges,
so the car hops its way up every ramp. Interpolate elevation AND slope
between the two samples the car is between (project onto the sample's forward
axis), give the grounded car the road's own vertical speed (`vy = u·slope`,
so `vy/u` is a free, correct body pitch for the renderer), and decide takeoff
from the slope a fixed LOOKAHEAD time out (`T.air.crestLook`) rather than
frame to frame — with a margin over gravity (`crestPull`), or a brow the car
only just outruns separates by microns and lands again next frame. Exclude
jump lips from that lookahead: their drop belongs to the ramp launch, and
reading it turns the run-up into a stutter of takeoffs.
