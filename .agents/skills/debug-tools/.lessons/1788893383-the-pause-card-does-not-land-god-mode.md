---
title: The PAUSE CARD does not land god mode — only a menu PAGE does, and the two are different states
date: 2026-09-08
scope: pwa/src/App.tsx, pwa/src/game/input.ts
concepts: [god-mode, harness, verification, hud]
---

`godActive = options.dev.god && menu === null`, and the mid-run pause card is
NOT `menu` — it is its own `paused` state beside it. So Escape freezes the run
and puts a card up while the camera keeps flying: `setFreeFly` is never called,
and anything that hangs off entering or leaving a flight (the fly keys, god
mode's HUD toggle, the rig's velocities) carries straight through the card.

That matters for any headless check of "what happens when the camera lands".
Pressing Escape looks like landing and is not — and while a card of any kind is
up the HUD is not rendered either (`snap && !menu && !hudHidden && !bench`), so
a probe for `.hud` comes back empty and reads as the state under test. The
honest way down is the pause card's own GOD MODE row (`.hud-pause-dev`), or a
real page: M for the main menu.

Reading the HUD's own visibility headlessly wants both facts at once — is the
chrome gone, and is a card up (`.hud-pause`) — or the answer is unreadable.
