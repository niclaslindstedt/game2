---
title: A screenshot cannot race a CSS animation or a load-time beat — freeze the one, throttle into the other
date: 2026-08-27
scope: scripts/screenshot.mjs, pwa/src/styles.css
concepts: [harness, css, hud, preview, tooling]
---

Two ways a scene of a CSS-layer effect lies, both found capturing the attract
card:

**A blinking element.** Waiting for its lit half
(`waitForFunction` on computed `opacity`) still loses: the shutter fires
after the predicate resolves, and by then the blink has flipped. Kill the
animation for the shot instead —
`page.evaluate("document.querySelector('.x').style.animation = 'none'")` —
which parks it on its base style. A still cannot show a blink either way, so
nothing is lost.

**A beat that only exists while something is loading.** `waitForSelector`
plus a timeout captures whichever beat won, and on this machine the world
builds fast enough that a "loading" scene reliably caught the READY card. Reach
the beat by holding its dependency back rather than by timing —
`page.route("**/renderer-*.js", …)` with a delay before `route.continue()`
parks the app on it for as long as you like. If a scene cannot be made
deterministic that way, do not ship it: a scene that names one state and
captures another is worse than no scene.
