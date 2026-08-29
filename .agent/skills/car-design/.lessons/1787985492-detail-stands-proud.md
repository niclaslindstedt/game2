---
title: The loft is a CLOSED body — a hollow in a cap is built proud of it, and a hollow under the deck needs the deck cut away
date: 2026-08-29
scope: pwa/src/game/car/lamps.ts, pwa/src/game/car/fascia.ts, pwa/src/game/car/engine-bay.ts, pwa/src/game/car/shell.ts
concepts: [lamps, fascia, depth, recess, loft, engine-bay, deck]
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

**The TOP DECK is the same face, and there the answer is different.** The
loft runs an opaque deck the length of the car at about the belt line — the
bonnet, the roof panel and the boot lid are all one surface — so a well
modelled under it is occluded from every camera above the car, and standing
it proud is not available: the deck is the panel you are trying to look
under. So the deck is CUT: `DeckOpening` + `deckCuts` in `shell.ts` drop the
middle of it between two z stations, and whatever cut it closes the hole
again from the inside (`car/cockpit.ts`'s hull for the cabin,
`car/engine-bay.ts`'s well for the bonnet). Two things that only bite here:
the cut snaps OUT to the stations either side of the opening, so anything
closing it has to read the same `deckCuts` rather than the metres it asked
for; and the deck is not flat, so a bulkhead built to the LOWEST point over
the hole leaves a slot through the car at the end where the deck is higher.
