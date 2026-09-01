---
title: A touch control that trusts only its own pointerup will eventually stick — on iOS the end of a touch is not guaranteed to be delivered anywhere
date: 2026-08-28
scope: pwa/src/game/hud.tsx, pwa/src/game/thumb-guard.ts
concepts: [input, touch, ios, hud, bug-classification]
---

The report reads like physics ("stuck turning right, a restart does not
clear it") and is entirely in the app layer: the HUD's wheel writes
`touch.steer` into the input manager, that axis OVERRIDES the keyboard, and
nothing else in the app ever writes it. So a pointerup that never arrives
leaves a lock the engine keeps being handed, across restarts — the run is
reloaded, the input manager is not.

iOS ends a touch without saying so more or less routinely: a drag off the
bottom edge of the screen (in portrait, where the thumb lives) can deliver
neither pointerup nor pointercancel to anyone. Nothing that WAITS for an
event can recover from that, and a zone that also refuses a second finger
while it believes it is owned is then wedged forever.

Classify it by asking who last wrote the value, not by what it feels like,
then arm the release every way it can be reached: the element's own
up/cancel, the same events on the window, `lostpointercapture`, focus and
visibility loss, unmount, and a POLL — `hasPointerCapture` is true for
exactly as long as the browser thinks the finger is down, so it is the one
question that needs no event. Let a new claim take a zone whose pointer is
demonstrably gone, and the control heals itself on the next touch.
