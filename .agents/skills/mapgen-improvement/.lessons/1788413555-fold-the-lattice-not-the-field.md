---
title: "Sharp" is a fold on the 14 m lattice, not a property of the field — measure dihedral angles across the drawn triangles, sorted by who shaped the ground
date: 2026-09-03
scope: engine/analysis/ground.ts, engine/mapgen/geology.ts
concepts: [terrain, measurement, analysis, geology, lattice]
---

An analytic field that is C1 everywhere still reads as creased once the tiles
are built on 14 m corners, so "the landscape is sharp" has to be measured on
the lattice: sample `heightAt` at every corner over the bounds plus margin,
build the two triangles per cell along the renderer's own diagonal, and take
the dihedral angle across each shared edge. `ground.crease` does exactly that
in ~220 ms a seed.

Two things made the number honest:

- **Sort the folds by cause before scoring.** A corner where `heightAt`
  differs from `farHeightAt` was shaped by a road — cut, fill, cone, shelf,
  pad — and a cutting has an edge. `geology.sharpAt` says where the rock is
  deliberately sharp. Only the rest is the country, and only the country is
  held to a curve (20° across an edge; a healthy seed folds 0.0-0.2% of its
  edges past it).
- **The mark has to reach a cell beyond the feature.** It is the foot and the
  brow of a cliff and the top and toe of a bank that fold, and both lie one
  cell outside the face; a mark that is 1 on the face and 0 at its edge
  exempts nothing. Pad it in METRES (a pit rim's `sharpRim`) or in spans
  generous enough that a face one cell wide still gets a cell of pad.

What the probe found, in order of size: `smooth(1 - |2n - 1|)` as the
"rounded" mountain crest turns over inside one cell wherever the ridge noise
runs steep (a parabola `4n(1-n)` over the raw noise has a third of the
curvature and no crease anywhere); a smoothstep rim narrower than three cells
(the old tarn at 24 m, the pond at 23 m) folds ~27° at its top on every lake
in the country; and a kettle hole's 7 m rim cannot be a curve at all, so it
is marked sharp instead of widened.
