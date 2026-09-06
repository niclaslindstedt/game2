---
title: The seal band round every window is drawn facing OUT — from the seat it is a clear gap between the film and the pillar unless the lining is cut to the glass
date: 2026-09-06
scope: pwa/src/game/car/greenhouse.ts, pwa/src/game/car/interior.ts
concepts: [greenhouse, glass, dirt, cockpit, lining]
---

Every opening in a cabin panel is two rectangles: the hole, and the glass
inset from it by `spec.cabin.seal`. The band between them is the rubber
seal, drawn outward-facing with the panel (`frameOf` in greenhouse.ts), and
the grime film covers the GLASS rect only. So from outside the window reads
as glass in a rubber frame — and from inside, where the seal is a culled
back face, there is a two-centimetre strip round every window with nothing
in it: the landscape, sharp, between the caked film and the pillar. From
the seat that is a windscreen with a clean border it never earned.

`buildLining` closes it by cutting its strips to `glassRect(hole, seal,
span)` rather than to the hole, so the lining stands over the seal band on
the inside. Anything else laid on a pane from inside (a decal, a crack)
should be laid on the glass rect the same way, never on the opening.
