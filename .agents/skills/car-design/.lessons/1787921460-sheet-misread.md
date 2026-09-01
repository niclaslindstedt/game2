---
title: Check a suspected mirroring on an ASYMMETRIC glyph before touching the direction code
date: 2026-08-28
scope: pwa/src/game/car/trim.ts
concepts: [door-numbers, mirroring, contact-sheet, debugging]
---

A door number rendered at contact-sheet resolution reads as mirrored when it
is not. `3` on the flank looks like `Ǝ` because the notches between its bars
are the panel colour and the eye picks the light shape, not the dark one —
and a symmetric pair (`33`) gives the eye nothing to correct against.

Before reasoning about `dir`, `zStart` or the winding in `buildRaceNumber`,
crop a car whose number contains an asymmetric digit — `17` settles it in
one look, because a mirrored render would put the `7` first. The digits in
that function are correct; a session that "fixes" them will break both
flanks.

More generally on this sheet: the turntable columns all orbit to POSITIVE x,
so every view shows the same flank. Comparing the two sides needs a variant
with the body yawed, not another column.
