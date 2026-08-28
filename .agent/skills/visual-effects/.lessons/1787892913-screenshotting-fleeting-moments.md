---
title: A screenshot cannot race an animation, a load-time beat, or a sim-time one — freeze, throttle, or take the first frame that qualifies
date: 2026-08-27
scope: scripts/screenshot.mjs, pwa/src/styles.css
concepts: [harness, css, hud, preview, tooling, particles]
---

Three ways a scene of an effect lies:

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

**A beat that is over in a few tenths of SIM time** — a standing start, a
landing. `atStageTime` is the honest cursor for anything a second or more
in, but under software rendering ONE frame can carry most of a second of
sim, so it overshoots badly down there: a 0.35 s wait for the launch came
out at 0.81 s and 32 km/h, past the moment. Ask instead for the first frame
that qualifies at all (`.hud-speed-num > 0`) — the earliest frame the
predicate can see is the closest a still can get to the instant.
