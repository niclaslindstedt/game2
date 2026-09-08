---
title: '`?hud=0` is the only honest clean frame — and it takes away every cursor the screenshot harness steers by; `?debug=1`''s `data-k` rows are the way back'
date: 2026-09-08
scope: scripts/screenshot.mjs, scripts/store-shots/
concepts: [screenshots, harness, tooling, hud, debug-overlay]
---

Three things sit over a driving frame, and only one switch removes all three.
The instrument panel is DOM and a style rule hides it. The rear-view glass is a
second RENDER of the world, and the name plates over the other crews are drawn
IN the world (`name-tag.ts`) — nothing laid on the page afterwards touches
either. `hudShow` maps `hud.on` onto both (`nameTags: on`), so `?hud=0` is the
whole answer and a style rule is half of one.

The cost is that `racing()`, `atStageTime`, `atOpenRoad` and the drift flag are
all read off the panel that just went out, so a scene with `?hud=0` has no way
to know where the car has got to. `?debug=1` is the replacement: every row of
the developer overlay carries `data-k` precisely so a headless pass can read one
(`debug-hud.tsx` says so), `run` quotes `t <seconds> s` and `slip` quotes the
angle in degrees, and the overlay is DOM — so it comes off at the shutter with
`.debug-hud { display: none }` while the HUD stays off from the URL.

Slip is the better drift cursor of the two anyway: `TUNING.drift.enterSlip` is
0.18 rad, so the HUD's flag lights at about 10° and a picture wants nearer 22°.
