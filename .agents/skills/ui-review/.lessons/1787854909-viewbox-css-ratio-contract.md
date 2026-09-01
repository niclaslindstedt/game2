---
title: Re-aiming an SVG crest means three numbers, not one — the viewBox, the CSS aspect-ratio, and the width caps that silently shrink it
date: 2026-08-27
scope: pwa/src/game/finish-flag.ts, pwa/src/styles.css
concepts: [svg, splash, responsive, css]
---

`pwa/src/game/finish-flag.ts` draws the attract screen's crossed flags into a
fixed `VIEW_BOX`, and `.splash-flags` in `styles.css` restates that ratio to
reserve the space before a flag is hung. Re-aiming the cloths moves the drawn
extent, and neither number follows on its own: tilt them up off their staffs
and the content climbs above y=0, where `overflow: visible` hides the overflow
and nothing looks wrong until the box is measured.

The loop that works: port the cloth math into a throwaway `.mjs`, sample the
node positions across one full flap period (`FLAP_HZ`), take the union bounds,
and cut the viewBox to them — symmetrically, since the pair mirrors about
x=150. Then re-derive BOTH CSS numbers, because the box is width-driven
(`width: min(82vw, …vh, …rem)`) and its height falls out of the ratio: a
taller ratio at the same caps makes the crest NARROWER on every height-capped
viewport. One pass rendered correctly and a third smaller than the original on
desktop; only comparing against the previous shot caught it. Landscape phone
(844x390) is the binding viewport — check it before believing a bigger crest
fits.

On the flag itself: a cloth carries its staff's angle ONWARD, falling away at
the same degrees the pole leans. Hanging it level under a leaned pole makes
the join the first thing the eye finds, and flying it square to the staff
(rising) reads as a windsock rather than a crest.
