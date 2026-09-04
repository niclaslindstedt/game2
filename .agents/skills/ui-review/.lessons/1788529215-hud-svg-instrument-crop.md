---
title: An instrument drawn INSIDE the dial is judged from a crop, not from the dial — at dial scale a working mechanism reads as a bug
date: 2026-09-04
scope: pwa/src/game/hud-dial.tsx, pwa/src/styles.css
concepts: [svg, hud, screenshots, playwright, instruments]
---

The tachometer's odometer is six digit drums in a 40x10 window inside a
100x100 viewBox — about a tenth of the dial. Shot the way the HUD is normally
shot (the `.hud-tach` element, or the whole frame), a drum caught mid-roll —
the bottom of one figure at the top of the window, the top of the next at the
bottom — looks exactly like content spilling past an unclipped viewport. Two
rebuild-and-re-shoot cycles went into "fixing" clipping that was working.

What settles it in one shot: clip the PAGE screenshot to the instrument's own
rect and nothing else.

```js
const r = await page.evaluate(() => {
  const b = document.querySelector(".hud-odo").getBoundingClientRect();
  return { x: b.x - 14, y: b.y - 14, width: b.width + 28, height: b.height + 28 };
});
await page.screenshot({ path: "previews/window.png", clip: r });
```

Two mechanics that go with it. `locator.screenshot()` fails on anything on
this HUD that animates — the tach shakes in the red, the needle tweens — with
"waiting for element to be stable"; `page.screenshot({ clip })` off a
bounding box has no stability check and always works. And
`getBoundingClientRect()` on an SVG container returns the union of its
CHILDREN, not its viewport, so a drum hanging below the window makes the box
taller than the window and the rect is not evidence about clipping either
way — only the picture is.

A nested `<svg>` with `width`/`height` DOES clip its content in Chromium; the
one thing worth stating explicitly is `overflow: hidden` on it, because the
dial around it sets `overflow: visible` and a reader has no way to know the
inner viewport is not inheriting that.
