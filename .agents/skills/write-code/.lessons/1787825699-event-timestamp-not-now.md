---
title: Time user input by the event's own timeStamp, never performance.now() inside the handler
date: 2026-08-27
scope: pwa/src/game/
concepts: [input, harness, ui]
---

Any app-side control that measures the INTERVAL between presses — a
multi-tap secret, a double-tap, a hold — must read `event.timeStamp`, not
`performance.now()` inside the handler.

The two agree only on an idle main thread, and this app's controls sit over a
canvas that is building stage geometry and rendering at 60 fps. Handlers are
macrotasks queued behind that work, so several presses that arrived 150 ms
apart can run back-to-back when the thread lets go, or one can run hundreds of
ms late. `performance.now()` there measures the frame budget; `timeStamp` is
when the press actually happened, on the same time origin.

Concretely: the developer menu's seven-tap chassis secret (`car-picker.tsx`,
`DEV_TAP_WINDOW_MS` in `settings.ts`) silently never fired under load with
`performance.now()`.

The same effect breaks HARNESSES in the other direction: Playwright's
per-click actionability checks can themselves outlast a 700 ms window while a
world is being built, so a scripted drum of real `click()`s never completes the
count. Dispatch the burst in one `page.evaluate` instead — and pass it as a
SOURCE STRING, because `scripts/` lints as Node and has no `document` or
`PointerEvent`.
