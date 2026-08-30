---
title: A picture that does not exist yet still has to claim the clipboard INSIDE the press — hand ClipboardItem a promise
date: 2026-08-30
scope: pwa/src/lib/share-image.ts, pwa/src/App.tsx, pwa/src/game/screenshots.ts
concepts: [screenshots, harness, ui, verification]
---

The game's shutter cannot hand the clipboard a blob: the drawing buffer is
only readable inside the animation callback that filled it, so the PNG is
several frames and an encode away from the keypress — and `navigator.clipboard.write`
wants the gesture's transient activation, which that outlives. Awaiting the
encode and writing afterwards is a copy Safari refuses outright.

What works is `new ClipboardItem({ "image/png": <promise of the blob> })`,
issued inside the press. `beginImageCopy` in `pwa/src/lib/share-image.ts` is
that: it returns a `settle` the frame loop calls with the finished picture
(or null, which must REJECT the promise — resolving with nothing puts an
empty item on the clipboard, worse than leaving what was there) and a `done`
that says whether the clipboard took it. The same shape works for any
deferred write: read the facts at the press, deliver them later.

Verifying it headlessly is easy and worth doing — grant the page
`["clipboard-read", "clipboard-write"]`, press the shutter key, then
`navigator.clipboard.read()` and check the item's types are `image/png`. The
in-game roll is readable the same way: open the `scanflick-shots` IndexedDB,
`getAll` the `shots` store, and `FileReader` the newest blob out as a data
URL. That is how you LOOK at what the shutter actually filed, which is the
only way to see that a painted caption came out right — no `make screenshots`
scene presses the in-game shutter, and Playwright's own `page.screenshot`
photographs the DOM overlay instead of the picture the game took.
