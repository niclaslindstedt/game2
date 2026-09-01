---
title: The touch HUD is invisible to every default screenshot scene — a page needs hasTouch + isMobile to render it at all
date: 2026-08-27
scope: scripts/screenshot.mjs
concepts: [hud, touch, harness, tooling, portrait]
---

`styles.css` hides `.hud-touch` behind `@media (hover: hover) and (pointer:
fine)`, and a plain Playwright page matches that query — so every existing
scene, portrait ones included, screenshots a game with no wheel and no pedal
on it. To LOOK at a touch control, the scene has to pass
`{ hasTouch: true, isMobile: true }` to `browser.newPage` (`capture()` takes
a fifth `pageOptions` argument for exactly this).

`page.mouse.down()/move()` still drives those zones once the page is
emulating a phone — no touchscreen API needed — and `page.mouse.move(x, y,
{ steps })` is what makes a drag look like a thumb rather than a teleport.
A control with any smoothing in it also needs a `waitForTimeout` after the
drag: a shot taken mid-chase measures the harness's timing, not the control.

`.hud-wheel` itself is a 0×0 anchor div with the artwork positioned around
it, so `locator.screenshot()` cannot frame it — use a clipped
`page.screenshot({ clip })` around the anchor point when you want it close
up.
