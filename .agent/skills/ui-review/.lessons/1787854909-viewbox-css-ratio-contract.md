---
title: Re-aiming an SVG crest means three numbers, not one — the viewBox origin, the CSS aspect-ratio, and the width caps that silently shrink it
date: 2026-08-27
scope: pwa/src/game/finish-flag.ts, pwa/src/styles.css
concepts: [svg, splash, responsive, css]
---

`pwa/src/game/finish-flag.ts` draws the attract screen's crossed flags into a
fixed `VIEW_BOX`, and `.splash-flags` in `styles.css` restates that ratio to
reserve the space. Tilting the cloths UP off their staffs pushed the drawn
content above y=0, where `overflow: visible` hid the problem on desktop and
nothing looked wrong until the box was measured.

The loop that works: port the cloth math into a throwaway `.mjs`, sample the
node positions across one full flap period (`FLAP_HZ`), and take the union
bounds — that is the viewBox, negative `min-y` and all. Then re-derive BOTH
CSS numbers from it, because the box is width-driven (`width: min(82vw, …vh,
…rem)`) and the height falls out of the ratio: a taller ratio at the same caps
means the crest gets NARROWER on every height-capped viewport. The first
render after the change looked correct and was a third smaller than the
original on desktop; only comparing against the previous shot caught it.

Landscape phone (844x390) is the binding viewport — check it before believing
a bigger crest fits.
