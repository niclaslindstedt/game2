---
title: A pad beside a road is graded WITH the road — a level pad on a grade is sliced at its downhill end by R31's cone
date: 2026-09-02
scope: engine/mapgen/terrain.ts, engine/mapgen/towns.ts
concepts: [terrain, pads, r31, verge, towns, placement]
---

The terrain's R31 cut reads the road's level at the NEAREST sample, so along
a graded street the ceiling falls with the road, sample by sample. A pad
flattened to one level (the verge height at its centre sample) is then above
the cone at its downhill end and gets cut — 0.2–0.5 m over a house's width at
a 4–9% grade — and stands proud of the corridor at the uphill end.

A town lot's pad therefore carries the street's own `grade` (a vector in the
ground plane, from the elevation difference of the samples ±6 m along) and
`padAt` evaluates each pad as a PLANE, not a height. The gravel disc in the
renderer is tilted the same way. A homestead's yard keeps grade zero: it is
out in a field at the end of a drive, and nothing beside it has a grade to
agree with.

Two more things the same pass found about pads:

- Inside R31's bench the `shelfBand` is degenerate on any grade (floor over
  ceiling), so a placement inside the bench must not be judged by it — the
  ground there IS the corridor, which is what the pad is levelled to. Past
  the bench, the honest bounds are `ceiling − y` (the bank behind the lot)
  and `y − land.heightAt` (the drop behind it).
- Where two pads overlap at their rims, a weighted mean of their levels leaks
  a neighbour's height a third of the way into a lot. The pad with the
  greatest weight holds its level on itself and gives way to the others
  only through its rim.
