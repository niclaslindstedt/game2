---
title: Judge a low-contrast effect by SAMPLING the screenshot, not by looking at it
date: 2026-09-01
concepts: [screenshots, verification, debugging, harness]
---

A 1280x720 screenshot read inside a session is a downscaled picture, and a
soft, low-contrast effect can be completely present in it and completely
invisible to the reader. Chasing the car's drawn shadow cost several builds
and a chain of red-material diagnostics because the shadow was THERE the whole
time — a patch of ground at 36% darker than its surroundings that simply did
not survive the way the image was being looked at.

The check that ends the argument in one run: decode the PNG in the headless
Chromium already installed for the harness and average a patch of it, against
a second patch of the same surface the effect does not touch.

```js
// node <script>.mjs shot.png   — playwright-core resolves from the repo root
const page = await (
  await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" })
).newPage();
// in-page: draw the image to a canvas, getImageData(x, y, w, h), average the channels
```

Two rules fall out of it. Compare a patch the effect covers against a patch it
does not, in the SAME frame — the lighting, the fog and the ground texture are
then controlled for, which a before/after pair of files is not. And zoom
before concluding: `ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw*2, sh*2)` with
`imageSmoothingEnabled = false` crops and doubles a region, and a shadow that
was "not there" at full frame is obvious at 2x.
