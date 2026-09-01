---
title: A canvas bug that reads as "half the screen is blank" is the drawing BUFFER disagreeing with the viewport — and an iOS PWA changes the box without a resize event
date: 2026-08-28
scope: pwa/src/game/renderer.ts, pwa/src/game/car-turntable.ts
concepts: [renderer, canvas, resize, ios, pwa, three, bug-classification]
---

The picture that arrives is the whole game squeezed into a band down one
side with flat `#3fa9f5` through the rest — and the HUD, which is DOM, laid
out correctly over all of it. That page colour is the tell: three always
asks its context for `alpha: true` and uses the renderer's own `alpha` flag
only to pick a clear alpha, so any part of the buffer a frame never touches
composites transparent and shows the body through it. A stretched or
squashed picture is a buffer SMALLER than the box; a blank band is a buffer
BIGGER than the region drawn into it.

`renderer.ts` cuts the buffer in `resize()` — window `resize` and
`orientationchange` — and sets the viewport in `drawScene()` off
`canvas.clientWidth/Height`, fresh every frame. Two measurements, two
different moments: whenever the box changes with no event, the viewport
follows and the buffer does not. An installed iOS PWA does exactly that
coming back from the background, which is why rotating the phone and back
"fixes" it — a rotation is the one size change iOS does announce.

Reproduced without a phone: serve `pwa/dist`, then in the page either set
`canvas.width` directly (a backing store reclaimed while the app was away)
or restyle `.app-root`'s width (a box that changed with nothing announced),
and read `clientWidth` against `canvas.width` a few frames later. Before the
fix the buffer stayed 830 against a 390 box — a 47% band, the screenshot
exactly. Anything that measures per frame must also CHECK per frame:
compare against `renderer.getSize()` AND against
`canvas.width === Math.floor(w * renderer.getPixelRatio())`, since a
backing store resized from outside still reads back the size three last
asked for.
