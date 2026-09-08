---
title: A menu interaction's cost cannot be read off `longtask` in this container — the backdrop is stepping the game at 1 fps, so measure the MECHANISM on a blank page
date: 2026-09-08
scope: pwa/src/game/menu-gallery.tsx, pwa/src/lib/shot-thumbs.ts
concepts: [menus, performance, harness, review, screenshots]
---

`App.tsx` steps the engine under the drone camera while a menu page is up, and
under software rasterization that alone is ~13 s of long tasks in a 15 s
window and about one frame per second. Any `PerformanceObserver({entryTypes:
["longtask"]})` reading of "what did pressing this row cost" is therefore
mostly the game, and the difference against an idle-menu baseline does not
rescue it: `page.click()` on a 1 fps page spends its own actionability checks
inside the measurement window, so the totals come back LONGER than the window
and the numbers are nonsense.

**Measure the mechanism instead.** Open `data:text/html,<body>`, build the
inputs in-page, run the before and after strategies back to back, and take the
worst `requestAnimationFrame` gap as the stall — that is the number the player
actually feels, and on a blank page nothing else is competing for it. The
gallery's filmstrip came back 1111 ms worst gap for full-resolution `<img>`
tiles against 54 ms for `createImageBitmap`-shrunk ones; in the real app the
same change was invisible to `longtask` entirely.

Keep the real-app run anyway, but ask it a QUESTION ABOUT THE DOM rather than
about time: is the card in the DOM on the press, do the tile boxes exist
before the pictures (nothing reflows later), and does `img.naturalWidth` come
back at the thumbnail's size rather than the capture's. Those answers are
exact at any frame rate.

**The trap this was hiding.** Any menu surface that shows a roll of stored
pictures — the gallery, and anything like it — must never hand a capture to an
`<img>` to be drawn small. The browser decodes the full two megapixels and
holds the bitmap regardless of the CSS box, so the cost is per PICTURE, not
per pixel drawn. `createImageBitmap(blob, {resizeWidth, resizeHeight,
resizeQuality})` is the only decode path that does the resize off the main
thread; one at a time, and gated on an `IntersectionObserver` so only the
tiles on screen ever ask.
