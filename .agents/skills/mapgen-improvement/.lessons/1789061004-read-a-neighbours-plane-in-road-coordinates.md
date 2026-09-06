---
title: A neighbouring sample's plane is a model of ITS strip — read it anywhere else in road coordinates, never in its own frame; the tell is a finding at `half + reach` on every seed
date: 2026-09-05
scope: engine/mapgen/terrain.ts
concepts: [r31, verge, bank, lattice, rollers, corridor, own-floor]
---

`rollers.bump` / `rollers.edge` / `rollers.cross` at 13–16 m off the
centreline on EVERY seed (taiga, desert and alpine alike) was not the check:
it was the corridor's own floor (`Near.own`), a min over each neighbouring
sample's plane within a `rawD + 8` m window, read AT the point in the
neighbour's own frame. Beside a bend that is wrong three ways at once — the
neighbour carries its own bank (which winds off over the run-out, so an
unbanked entry's plane stands a metre under the banked verge at the outer
lip), it tilts the point's lateral in ITS frame (foreshortened by the bend),
and it runs its grade out along a chord that is longer than the arc on the
outside of the bend. The min took the lowest: a trench under the ribbon's
outer band and a ridge past the lip where the falling fill crossed it, and
a lattice corner on each reads back as a 2.6 m second difference.

The fix keeps `own` a min (it is what holds tiles under the lower side of a
jump's step and the fan of strips in a tight bend — a single interpolated
plane put a tile through a landing on seed 11), but a same-stretch
neighbour that does not COVER the point is read in road coordinates:
`top_k + slope_k·(s_near − s_k) − bank_here·lateral_here`. Halved the edge
faces on both old countries with no seed re-rolled. The class that remains
at 14–16 m is the fill's CREST at the lip drawn on a 14 m lattice, and that
is a cross-section change (`shelfBeyond`, `fillBeyond`, `runout`), not a
reading error.
