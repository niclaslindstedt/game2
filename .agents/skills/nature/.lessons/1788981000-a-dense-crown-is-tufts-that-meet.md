---
title: A DENSE crown is tufts that MEET — foliage only on the bough ends reads as lollipops, and only the turntable shows it
date: 2026-09-05
scope: pwa/src/game/flora-alpine.ts, pwa/src/game/flora-species.ts
concepts: [flora, geometry, crown, review]
---

A tree whose crown is a solid mass (a stone pine, an old oak, a cedar)
cannot be built the pine's way — one tuft on the end of each `limb`. At
the tuft radii that keep a Scots pine's crown OPEN, the same recipe on a
tree that should be closed comes out as a trunk with a handful of separate
balls round it: the first `arolla` was 6.4 m wide and read as a mobile.

What closes it, in order of how much it bought: a second tuft HALFWAY
along every bough (the bough is then a wedge of foliage, not a stick with
a knob); a core column of blobs up the trunk from the lowest bough, each
wide enough — about 0.55 × the crown's radius at the bottom — to overlap
the boughs' own tufts; and every tuft as two blobs, the darker one low and
inboard, so the overlaps read as shade inside a mass rather than as balls
touching. Width barely changed (7.2 m); the read changed completely.

This is invisible in `make sim`, invisible at 40 m/s, and obvious in ten
seconds on `make items ITEMS=<id> TURNTABLE=4` — which needs no `make
build` (the tool bundles its own harness and rebuilds it only when a
source changed). Render the tree BEFORE weighting it into a community.
