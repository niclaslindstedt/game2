---
title: The shutter's receipt hangs off `clipboard.write`, which does not always answer — and ALT used to take it down with the HUD
date: 2026-09-08
scope: pwa/src/App.tsx, pwa/src/lib/share-image.ts
concepts: [screenshots, hud, harness, verification]
---

ENTER's only reply is a `flash` in the HUD's news column, and there were two
ways it said nothing at all. The column lived inside `<Hud>`, which ALT
unmounts — which is exactly the clean-frame case a developer shot uses, so
the one press most likely to want an answer was the one that got none. And
the receipt awaited `copy.done`: a window without clipboard permission
(headless, or simply unfocused) never settles that promise, and the whole
reply went with it. `copiedWithin` now bounds the wait; a press with
screenshots switched off says so instead of doing nothing.

**Verifying any of that headlessly needs patience.** This container renders
the game at about 10 fps and the PNG encode of a 1280×720 frame takes
seconds: a check that screenshots the page 2.5 s after the press finds zero
`.hud-flash` elements and "proves" a receipt that is merely late is missing.
Nine seconds is enough. The picture itself is the honest artifact — read the
newest row out of IndexedDB (`scanflick-shots`, store `shots`, newest
`takenAt`) and write the blob to a PNG; that is the only way to see what was
actually painted into a capture, since the boxes are DOM and never reach a
page screenshot.
