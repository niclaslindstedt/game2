---
title: The pace strip holds only TWO calls in road order, so a scene must wait on the call's own class — and the strip is too unstable for captureElement
date: 2026-09-04
scope: scripts/screenshot.mjs, pwa/src/game/snapshot.ts
concepts: [harness, screenshots, hud, playwright, pacenotes]
---

Two traps, both hit photographing a jump call, both cheap to avoid.

`upcomingPacenotes` puts at most two things on the strip and breaks there, in
ARC order. So a lip that follows a corner combination is simply not drawn
until those corners are driven through, and a scene that waits on
`.hud-pace-call` gets whatever call happens to be up — usually the wrong one.
Wait on the class of the thing being photographed
(`.hud-pace-jump-big`, `.hud-pace-hard`), never on the generic call.

`captureElement` cannot shoot `.hud-pace` at all: the distance readout inside
it re-renders every HUD tick, Playwright's "waiting for element to be stable"
never settles, and the call fails after its retries rather than timing out
somewhere legible. Use the full-frame `capture()` for anything on the strip.

Reaching a feature is `at=racing&s=` (engine's `place.ts`) plus `bot=1`, placed
a few hundred metres short — a placement closer than the call's lead is a race
against the world build, which takes tens of seconds under software rendering
and lets the car drive past the feature before the first frame is grabbed.
