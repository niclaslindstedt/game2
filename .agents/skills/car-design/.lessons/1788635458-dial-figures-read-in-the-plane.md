---
title: The binnacle's half-turn lands the plane's +x on the driver's RIGHT — build dial figures and readouts the right way round, and read them off a 4x crop
date: 2026-09-05
scope: pwa/src/game/car/cockpit-dials.ts, pwa/src/game/car/segment-display.ts
concepts: [cockpit, dials, instruments, verification, screenshots]
---

Every face in the binnacle is carried onto the dash by `rotateY(π)` then the
rake (`onFace`), and the camera looks down +z with world +x on the LEFT of the
frame. The two flips cancel: a numeral laid out with +x to the right in the
dial's own plane reads correctly from the seat. Pre-mirroring the text "to
undo the half-turn" is the reasoning that LOOKS right and produces a dial of
backwards figures in a backwards order — `OSI` for 120.

The only way to catch it is to look at the figures at a size they can be
read: at 1280x720 a dial is thirty pixels across and a mirrored `2` is a
blob either way. Crop the binnacle at 3-4x (a Playwright page with the PNG
scaled up is the crop tool a web session has; PIL is not installed) before
judging anything on an instrument, and write the crop's coordinates down —
the same crop is the after-picture.

The same rule holds for the tell-tale row: left to right in the plane is
left to right in the car.
