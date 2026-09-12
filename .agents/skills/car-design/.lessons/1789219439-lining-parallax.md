---
title: Two surfaces cut to the same rectangle at different depths are a HOLE, not a step — wall the gap between them
date: 2026-09-12
scope: pwa/src/game/car/interior.ts, pwa/src/game/car/greenhouse.ts, pwa/src/game/car/builder.ts
concepts: [lining, greenhouse, winding, cockpit, parallax]
---

The cabin's lining and its glass were both cut to the same window rectangle,
the lining `LINING_LIFT` inside the panel and the pane `GLASS_LIFT` proud of
it. Coplanar surfaces would have met; surfaces two centimetres apart do not.
From the driver's seat a flank is looked at almost edge-on, so a ray grazing
the lining's edge crosses the panel `lift × (along / across)` further along
it — four to five centimetres on the compact's door — and the metal in
between is back-facing, which is to say the landscape. It read as a bright
un-beaded strip down the front of the door window in the rain, and no
amount of OVERLAP closes it, because the band widens without bound as the
view goes edge-on.

The fix is the wall itself (`patchReveal`): a ribbon standing in the rect's
own edge from one depth to the other, all the way round, facing into the
opening. It is also what a real window reveal is, so it costs nothing to
explain.

Two things worth stealing from it. Derive the facing rather than winding by
hand — every reveal face points at the middle of its own rect, which is one
sentence true of all four edges of a warped, leaning, mirrored patch at
once. And to FIND a hole like this, paint the suspect surfaces flat colours
and shoot the frame: one build and one capture said "the pane ends here and
the lining starts there" in a way no amount of reading the arithmetic did.

A related seam this did NOT close: a LEANING edge is a straight line in
(u, v), but each rect along it is drawn as a 3D chord over its own v range,
so a pane and the pillar beside it part company by a few millimetres in the
middle of a flank warped enough. Behind the driver's shoulder, so invisible
from the seat — but it is the reason a gap test cannot assert right up to a
pane's edge.
