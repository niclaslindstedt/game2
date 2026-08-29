---
title: A detail laid on a nose or tail cap must be built OUTWARD from it — the cap is a solid face that draws over anything sunk behind it
date: 2026-08-29
scope: pwa/src/game/car/lamps.ts, pwa/src/game/car/fascia.ts
concepts: [lamps, fascia, depth, recess, loft]
---

The first lamp bowls were modelled the way a real lamp is fitted: rim flush
with the cap, reflector sloping back INTO the panel. On screen every one came
out as a ring of reflector around a rectangle of body paint — because the
shell's loft caps both ends with a real face, and that face is opaque and
nearer the camera than anything you put behind it. Half the bowl was simply
occluded, and the contact sheet reads it as a flat sticker, which is the exact
failure the geometry was added to fix. It is not a winding bug and not a
z-fight; nothing looks broken, it just looks flat.

So a hollow laid on a cap is built the other way round: put the deepest
surface a few millimetres PROUD of the cap (`PROUD`), and measure everything
else outward from there. A lamp then stands off the panel the way a period one
actually does, and the housing around it makes that read as deliberate rather
than as a part floating.

`buildGrille` in `fascia.ts` is the same lesson already learned once, stated
differently: it draws its surround as four bars because "a filled plate at
this depth sits in front of the mouth and hides it". Anything that wants to be
a hole in a cap needs one of these two answers.
