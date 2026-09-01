---
title: A contact that reads only the CAR's mass makes every pebble a wall — weigh the solid too, and derive its numbers from the shape that is drawn
date: 2026-08-28
scope: engine/mapgen/solids.ts, engine/game/collision.ts
concepts: [collision, solids, mass, trees, rocks]
---

The old `collideCar` treated every solid as infinitely heavy: the normal
component came back at `restitution` whatever it hit, so a 200 kg stone
stopped a tonne of rally car dead. The whole difference between a pebble, a
boulder and a spruce is now ONE scalar — `bite`, the share of a dead-wall
exchange the contact actually is — and everything downstream (speed lost,
tangential scrub, crush, the piece thrown) scales by it. `bite = 1` reproduces
the old model exactly, which is what let the existing tests stay honest.

Derive `mass`, `rooted` and `snap` from the shape the RENDERER draws
(`solidVolume`), never from a per-kind table of feel numbers: the sizes are
already authored, and a mass that disagrees with the silhouette is a rock that
behaves like something the player cannot see. `standSolid` owns each kind's
radius/height too, so the field, the mass and the drawing cannot drift apart.

Two calibration traps: (1) a tree's collision radius is the trunk PLUS its
lowest boughs, so using it as the bole radius overestimates a tree's mass by
5×, and every tree then snaps at walking pace — `TRUNK_OF_CANOPY` is that
correction. (2) `anchorPerMass` (the ground's hold) has to sit ABOVE the
material's `SNAP_PER_MASS`, or a rooted tree is pulled out of the ground
before its trunk breaks, and nothing wooden ever snaps.
