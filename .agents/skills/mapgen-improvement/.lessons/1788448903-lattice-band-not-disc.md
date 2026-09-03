---
title: Nothing narrower than the ground lattice can be graded into the world — grade a BAND, not a disc
date: 2026-09-03
scope: engine/mapgen/terrain.ts, engine/mapgen/towns.ts, engine/mapgen/homesteads.ts
concepts: [terrain, lattice, placement, towns, plausibility, measurement]
---

The drawn ground is a lattice of corners `GROUND_CELL` (14 m) apart, and both
the picture and the physics are the triangles between them (`groundAt`). So a
graded pad about that size — R39's village lots were ~10 m discs — does nothing
at all: the flattening falls BETWEEN the corners, never reaches the surface, and
the thing standing on the pad stands on the country's own slope instead. Four
town buildings in five were over half a metre off the ground under them (worst
7.5 m) while every other number about them read clean.

Whenever ground has to be FLAT for something to stand on it, the flat thing has
to be bigger than a cell in both directions, with a cell of margin past whatever
stands on it. R39's fix is one band per village — the street's verge level held
out past the back gardens, hundreds of metres long — with the lots' pads
demoted to paint on it. Two traps in building one:

- **Pick the nearest piece of the spine by DISTANCE, not by weight.** A band
  tens of metres wide is at full weight against a hundred metres of its own
  spine at once, so "strongest claim wins" silently takes the level from
  whichever segment the loop reached first.
- **A road always wins its own corridor.** A band laid across a road that is
  not its own street walls that road's edge in at over a metre per metre
  (`rollers.edge`), and the placer cannot see it: a town is stood the moment its
  tarmac closes, and the route it is graded beside may be built hundreds of
  metres later. Clamp at placement AND yield in the terrain field.
