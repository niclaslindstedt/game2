---
title: "`user-select: none` does not disarm iOS's loupe — only a non-passive `touchstart` preventDefault does, and it costs the click"
date: 2026-09-07
scope: pwa/src/game/text-interaction.ts, pwa/src/styles.css
concepts: [touch, ios, input, css, hud]
---

`user-select: none`, `-webkit-touch-callout: none` and `touch-action: none` are
each a rule about what may be DONE with a touch — a selection made, a callout
offered, the page panned. WebKit arms its text-interaction recognizer from the
touch itself, before any of them is consulted, so a stylesheet that says all
three still lets the magnifier come up over the road. The only thing that
disarms it is a `touchstart` whose default is prevented, and a `touchstart`
listener is passive by default — so this can never be fixed in `styles.css`.

Two traps in doing it:

- **`touch-action` is not inherited.** `html, body { touch-action: none }`
  reaches neither `.hud-zone` nor `.game-canvas`; each says it for itself.
- **A prevented `touchstart` cancels the synthesized `click`**, the caret in a
  field and the scroll of a scroller. So the guard cannot be blanket. What
  makes it safe here is that every tap in this game that arrives as a `click`
  lands on a `<button>` — the thumb zones, the fly pads, the splash, the map
  and the canvas are all driven from `pointerdown`, which a prevented
  `touchstart` does not touch. Check that before widening it: one `onClick` on
  a `<div>` and iOS taps silently stop working there.

Ask the computed style for the exemptions rather than listing class names, so
`styles.css` stays the single source of which surfaces take text and the two
cannot drift apart.

Verifying it needs the built app in a touch context, not a screenshot: dispatch
a synthetic `touchstart` per surface and read `defaultPrevented` back in the
BUBBLE phase, which is what the capture-phase guard has already decided.
