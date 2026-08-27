---
title: `el?.textContent !== 'x'` in a Playwright waitForFunction resolves instantly when the element does not exist yet
date: 2026-08-27
scope: scripts/, pwa/src/tools/
concepts: [harness, tooling, preview, screenshotting]
---

`scripts/screenshot.mjs`'s `racing()` waited on
`document.querySelector('.hud-timer')?.textContent !== '0:00.0'`. The HUD is
not mounted at all while the world builds, so the optional chain yields
`undefined`, `undefined !== '0:00.0'` is true, and the wait returned on the
first poll — handing every driving scene a page still on the loading screen
and letting its script press keys at nothing. `atStageTime` in the same file
was already written correctly (`if (!t) return false`), which is why the
breakage was intermittent rather than total.

Default the read instead of chaining off it:
`(document.querySelector('.hud-timer')?.textContent ?? '0:00.0') !== '0:00.0'`.

The general shape: in a `waitForFunction` predicate, a "not yet the target
value" test over a maybe-absent node is satisfied by ABSENCE. Either default
the missing value to the initial one, or make the predicate assert presence
first.
