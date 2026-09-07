---
title: Verifying the in-game shutter means waiting for the ROLL to grow — the encode is seconds, and reading IndexedDB early hands you the previous picture
date: 2026-09-06
scope: pwa/src/game/screenshots.ts, pwa/src/game/shot-hud.ts, scripts/
concepts: [screenshots, harness, measurement, verification, indexeddb]
---

A picture the player takes goes into an IndexedDB roll (`<short-name>-shots`,
store `shots`, newest last by key), and that is the only place a Playwright
pass can read it back from. Three things bite, in the order they bit:

- **The encode is SECONDS under software rasterization** — around 4 s for a
  1280x720 PNG. A fixed `waitForTimeout` after the shutter reads the roll
  before the picture lands, and `getAll()` then returns the PREVIOUS shot,
  which looks exactly like a fix that did not work. Wait on the roll's
  LENGTH, not on a clock.
- **Opening the database yourself first is a trap.** `indexedDB.open(name)`
  from the probe creates an empty v1 with no object store, and the app's own
  open then sees no upgrade and never creates one. Only read after the app
  has written at least once.
- **The receipt flash needs `copyShots` off.** `beginImageCopy` claims the
  clipboard inside the press and the PICTURE SAVED flash waits on that write,
  which never resolves headless. Seed
  `localStorage["scandi-flick-options"] = '{"copyShots":false}'` in an
  `addInitScript` and the flash appears.

Serve `pwa/dist` with the content type read off the RESOLVED file path — the
URL `/` has no extension, and index.html served as `application/octet-stream`
is a navigation that never fires `load`.

And do not fake HUD state by injecting nodes into a Preact-managed container:
Preact re-inserts them on its next render, which RESTARTS their CSS
animations, so the element measures as `opacity: 0` at moments it looks fine
on screen. Drive the game to the state, or press the shutter twice and
photograph the first shot's own PICTURE SAVED line.
