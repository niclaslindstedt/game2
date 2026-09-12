---
title: To photograph a REPLAY state, forge a tape and seed it into IndexedDB — and shrink the viewport, because headless plays a recording at about an eighth of real time
date: 2026-09-12
scope: pwa/src/game/replay-store.ts, scripts/screenshot.mjs
concepts: [screenshots, replay, harness, review, hud]
---

No `?` knob reaches a replay, and a PLACED run (`at=retire`, `at=finish`)
arms no tape (`run-loop.ts`), so WATCH REPLAY is null on its card. The way in
is the roll:

1. **Forge the tape in Node.** `createTapeRecorder` + `createGame` +
   `step` over `aliasEngine`. Full throttle and about 0.6 of lock from three
   seconds in puts the car in the trees and kills the engine in ~10 s of game
   time on seed 42 short/sprint — the retirement card, for one command. The
   header's `damageScale` is `0..1` (how much of a hit is KEPT), so it cannot
   be used to make a crash fatal faster.
2. **Seed it.** IndexedDB `scanflick-replays`, store `replays`, keyPath
   `meta.id`, record `{ meta, tape }` (`replay-store.ts`). Write it in a
   `page.evaluate` after first load, then reload — the store's read cache is
   per-session. Then REPLAYS on the main menu, click the row.
3. **Shrink the window for the drive.** Headless renders this game at roughly
   an eighth of real time, so a 77 s bot lap does not reach the line inside a
   600 s `waitForSelector`. Open the page at ~480x280, wait for
   `.hud-finish`, then `setViewportSize` to the raster you want and shoot.

`meta.savedAt > 0` makes the bar read SAVED rather than SAVE, which is the
state a replay off the roll is actually in.
