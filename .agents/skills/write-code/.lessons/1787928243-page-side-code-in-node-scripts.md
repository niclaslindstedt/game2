---
title: Page-side code in a scripts/*.mjs Playwright pass is a SOURCE STRING — and a predicate over a maybe-absent node must not be satisfied by ABSENCE
date: 2026-08-27
scope: scripts/, pwa/src/tools/
concepts: [harness, tooling, lint-coverage, screenshots, preview]
---

Two rules for anything a Node script runs inside the browser.

**Write it as a string, not as a function.** `eslint.config.js` gives
`scripts/**/*.mjs` Node globals only, so `page.evaluate(() =>
document.querySelector(…))` fails `no-undef` on `document` even though it never
runs in Node. The repo's convention is a template literal passed as a string —
`READ_CLOCK` in `scripts/screenshot.mjs`, `READ_FACTS` in
`scripts/debug-shot.mjs`; Playwright evaluates a string identically. Reach for
that rather than an eslint-disable, which would also switch off the checking
that catches a genuine Node-side typo two lines down.

**Assert presence before comparing.** A "not yet the target value" test over a
node that has not mounted is satisfied by the node being missing:
`document.querySelector('.hud-timer')?.textContent !== '0:00.0'` yields
`undefined !== '0:00.0'`, true on the first poll, so `racing()` returned with
the page still on the loading screen and every driving scene pressed keys at
nothing. Either default the missing read to the initial value
(`(… ?? '0:00.0') !== '0:00.0'`) or make the predicate answer null/false when
the element is absent, which is what `READ_CLOCK` does today.
