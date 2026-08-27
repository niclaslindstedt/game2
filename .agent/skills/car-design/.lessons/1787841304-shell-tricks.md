---
title: Two shell tricks that fail silently — the seam width test, and plates over the nose cap
date: 2026-08-27
scope: pwa/src/game/car/shell.ts, pwa/src/game/car/fascia.ts
concepts: [shut-lines, grille, loft, baked-shading]
---

**Shut lines are grooves in the loft**, not dark decals: two stations
pulled in with a chamfer either side, so the gap crumples with the panel it
belongs to. The trap is the test for "this band is inside a shut line".
`sa.seam && sc.seam` is not enough — the two stations bracketing a whole
door are BOTH seam stations, so the entire door panel comes out black. The
test needs a width check as well (`sa.z - sc.z < SEAM_WALL * 2.2`).

Paint the groove with a darkened version of the PAINT, not the wheel-well
near-black: a black slot on a white car reads as a stripe, a darkened paint
reads as shadow in a gap. `shade(color, k)` in `shell.ts` is that.

**Anything laid on the nose cap is laid IN FRONT of it.** A grille surround
drawn as one filled plate at `z + PROUD` sits ahead of the recessed mouth
and the headlights and hides both — the car renders as a solid colored
rectangle. A surround has to be FOUR BARS around the opening. Same class of
mistake: corner indicators belong on the BUMPER's front face, not the nose
cap, or they end up buried inside the bumper and never show.

Both failures render as something plausible-looking, so they survive a
glance at the contact sheet. Crop the cell and zoom.
