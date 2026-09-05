---
title: The loft is a CLOSED body — a hollow in a cap is built proud of it, and a hollow under the deck needs the deck cut away
date: 2026-08-29
scope: pwa/src/game/car/lamps.ts, pwa/src/game/car/fascia.ts, pwa/src/game/car/engine-bay.ts, pwa/src/game/car/shell.ts
concepts: [lamps, fascia, depth, recess, loft, engine-bay, deck]
---

The shell's loft caps both ends with a real, opaque face, nearer the camera
than anything put behind it. A lamp bowl modelled the way a real one is
fitted — rim flush, reflector sloping back INTO the panel — therefore
renders as a ring of reflector around a rectangle of body paint: half the
bowl is occluded, and the sheet reads a flat sticker. It is not a winding
bug and not a z-fight; nothing looks broken, it just looks flat.

So a hollow laid on a cap is built the other way round: put the DEEPEST
surface a few millimetres proud of the cap (`PROUD`) and measure everything
else outward from there. A lamp then stands off the panel the way a period
one does, and the housing round it makes that read as deliberate.
`buildGrille` in `fascia.ts` is the same lesson stated differently: its
surround is four bars because a filled plate at that depth sits in front of
the mouth and hides it. Anything that wants to be a hole in a cap needs one
of those two answers.

**The TOP DECK is the same face, and there the answer is different.** The
loft runs one opaque deck the length of the car — bonnet, roof panel and
boot lid are one surface — so a well under it is occluded from every camera
above the car, and standing it proud is not available: the deck IS the panel
you are trying to look under. So the deck is CUT: `DeckOpening` +
`deckCuts` in `shell.ts` drop its middle between two z stations, and
whatever cut it closes the hole again from inside (`car/cockpit.ts`'s hull
for the cabin, `car/engine-bay.ts`'s well for the bonnet). Two things bite
only here: the cut snaps OUT to the stations either side of the opening, so
anything closing it must read the same `deckCuts` rather than the metres it
asked for; and the deck is not flat, so a bulkhead built to the LOWEST point
over the hole leaves a slot through the car at the end where the deck is
higher.
