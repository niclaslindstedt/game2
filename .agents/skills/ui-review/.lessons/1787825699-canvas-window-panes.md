---
title: A DOM pane that frames the game canvas must paint nothing across it — no background, no backdrop-filter
date: 2026-08-27
scope: pwa/src/game/menu-roam.tsx, pwa/src/styles.css, pwa/src/game/renderer.ts
concepts: [ui, menus, renderer, css]
---

The Roam page shows the stage map inside a card by scissoring the renderer to
that element's rect (`GameRenderer.setMapRect`, measured by a ResizeObserver on
`.roam-map`). The pane is a HOLE, not a picture: the canvas is behind the whole
DOM layer and only shows through where nothing paints over it.

So the pane's own styling is the trap. A translucent card background
(`rgb(18 48 105 / 55%)`) over the hole drains every colour out of the
landscape — it reads as a dim, muddy map and looks like a lighting bug in the
renderer rather than a CSS one. `backdrop-filter: blur()` is worse: it frosts
the exact thing the pane is a window onto. Both were the first thing tried,
because every other pane in the menu wants them.

The rule: the framing element carries a border and nothing else, and any text
it holds sits on whatever the renderer leaves around the map (flat sky), so it
needs the HUD's own `text-shadow` to stay legible. Verify by screenshotting
the page — the failure is perfectly invisible in the DOM and obvious in a
capture.
