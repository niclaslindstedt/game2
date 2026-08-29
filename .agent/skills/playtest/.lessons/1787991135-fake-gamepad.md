---
title: A controller is verified in the real app by injecting a fake navigator.getGamepads with addInitScript — capture() gives no hook for it
date: 2026-08-29
scope: scripts/screenshot.mjs, pwa/src/game/gamepad.ts, pwa/src/game/input.ts
concepts: [harness, playwright, input, screenshots, verification]
---

Playwright cannot press a real gamepad, and `capture()` in `scripts/screenshot.mjs`
goes straight from `browser.newPage()` to `page.goto()` — there is nowhere to
call `page.addInitScript()`, which must run BEFORE any page script. So a pad
scene is a one-off script beside the harness, not a scene inside it.

The stub is small: a mutable `window.__pad = { buttons, axes }`, and a
`navigator.getGamepads` that returns one object with `connected: true`,
`mapping: "standard"` and `buttons` mapped to `{ value, pressed }`. Drive it
from the test with `page.evaluate("window.__pad.buttons[7] = 1")`. Copy the
harness's server + `racing()` wait; a one-off script under the scratchpad must
import playwright-core by absolute path (`/…/node_modules/playwright-core/index.mjs`)
or Node will not resolve it from outside the repo.

The trap that cost a run: the rebind rows take their BASELINE when the row
starts listening, so pressing the fake button in the same tick as the click on
the row makes the press part of the baseline and it never binds. Wait ~500 ms
between clicking a bind row and moving the fake control — which is also what a
human hand costs.
