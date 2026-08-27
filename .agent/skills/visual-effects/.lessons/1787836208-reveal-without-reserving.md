---
title: Reserving layout space for a not-yet-revealed block buys stillness with a hole
date: 2026-08-27
scope: pwa/src/styles.css, pwa/src/game/
concepts: [css, hud, menus, review]
---

On a progressive reveal (a card whose second beat arrives when the game
finishes loading), the instinct is to mount the later block invisible so its
arrival does not shove the rest of the screen around. Screenshot the FIRST
beat before believing that: the reserved box is dead space, and a centred
layout puts the earlier content at the top of the viewport and whatever sits
below the reserve at the bottom, with nothing between. It reads as a broken
screen, which is a worse cost than a shift nobody was looking at.

Mount the block when it arrives and let the layout settle — with an entrance
animation on it, the move reads as the screen opening up rather than as jank.
Judge it by capturing both beats, not just the finished one.
