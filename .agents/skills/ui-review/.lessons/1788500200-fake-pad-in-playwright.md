---
title: Drive the CONTROLLER from Playwright by replacing navigator.getGamepads — it is the only way to see what a pad actually lands on
date: 2026-08-30
scope: pwa/src/game/menu-nav.ts, pwa/src/game/gamepad.ts, scripts/screenshot.mjs
concepts: harness, controller, menu-nav, ui, verification
---

Menu-cursor work cannot be judged by reading the code: where a cursor LANDS
is a query over the boxes that happen to be on screen, and every wrong answer
looks plausible in the source. Fake the pad instead — `input.ts`'s
`readPadFrames` only ever reads `navigator.getGamepads()`, so one
`page.addInitScript` is a whole controller:

    window.__pad = { buttons: new Array(17).fill(0), axes: [0,0,0,0] };
    navigator.getGamepads = () => [{
      id: "Fake Pad (STANDARD GAMEPAD)", index: 0, connected: true,
      mapping: "standard", axes: window.__pad.axes,
      buttons: window.__pad.buttons.map((v) => ({ value: v, pressed: v >= 0.5 })),
    }];

A press is `__pad.buttons[9] = 1`, a wait of ~160 ms (the poll is once a
frame and the reader's edge needs to see it), then back to 0. Read back the
surface and the cursor with one evaluate over `.nav-cursor` and the card
selectors, and a whole walk prints as a table.

Two things it caught that no amount of re-reading would have. Skipping
`[data-nav-back]` when choosing where the cursor starts is right on a page
whose way back is a chevron in the head and WRONG on the pause card, where
the way back is RESUME and the row under it throws the stage away — the walk
printed `cursor: "RESTART STAGE"`. And B does not back out of a RUN, so a
script that walks into a race cannot walk back out: reload the page for the
next leg instead.

Keep the script in `scripts/` while using it (`scripts/` is where
playwright-core resolves from) and delete it after — it is a probe, not a
harness scene. What is worth keeping goes into `screenshot.mjs` as a
capture.
