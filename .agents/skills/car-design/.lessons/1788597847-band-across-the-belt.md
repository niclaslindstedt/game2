---
title: A band laid above the belt line vanishes into the body unless it has a vertex row ON the belt — the flank folds there
date: 2026-09-05
scope: pwa/src/game/car/shell.ts
concepts: [livery, decals, belt-line, sampling, sideband]
---

The flank is not a plane up its height: it runs out from the sill to the
BELT and back in over the shoulder to the deck, so `flankX(z, y)` is
piecewise. A band quad run straight from `yFrom` under the belt to a `yTo`
above it is a chord across that fold, and the paint sits INSIDE the body
across the middle of its height — the edges show as thin red slivers and the
middle is bare white loft. It looks like a culled-face or winding bug, and
it is neither: `bandStrip` now lays any band that crosses `spec.beltY` as
two rows with a vertex row on the belt. The same rule as the z ladder
(sample every fold), turned vertical.

While there: the band ceiling (`beltY + 0.04`) was written for bands pushed
UP by `overArch: "ride"`; a `yTo` the spec itself states above the belt is
allowed through, so a door-height colour block can reach the door top.
