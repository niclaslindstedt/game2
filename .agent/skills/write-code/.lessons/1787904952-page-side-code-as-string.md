---
title: Page-side code in a scripts/*.mjs Playwright pass must be a SOURCE STRING, not an arrow function
date: 2026-08-28
scope: scripts/
concepts: [tooling, harness, lint-coverage, screenshots]
---

`eslint.config.js` gives `scripts/**/*.mjs` Node globals only. A
`page.evaluate(() => document.querySelector(…))` written as a real function
therefore fails `no-undef` on `document`, even though it never runs in Node.

The repo's convention is to write anything that executes inside the page as a
template literal and pass the string — `READ_CLOCK` in
`scripts/screenshot.mjs`, `READ_FACTS` in `scripts/debug-shot.mjs`. Playwright
evaluates a string identically. Do that from the start rather than reaching
for an eslint-disable; the disable would also switch off the checking that
catches a genuine Node-side typo two lines later.
