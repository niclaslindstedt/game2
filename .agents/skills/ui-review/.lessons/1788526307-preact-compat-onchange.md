---
title: preact/compat is in this bundle, so `onChange` on an input IS `oninput`
date: 2026-09-04
scope: pwa/src/game/*.tsx — any form control, and any control that must commit on release
concepts: [preact, compat, input, range, slider, events, onChange, settle]
---

The app renders with plain Preact, but `react` / `react-dom` are aliased onto
`@preact/compat` (root `package.json`, `@preact/preset-vite`), and compat
installs its hooks GLOBALLY as soon as it is in the bundle — it is, via the
framework package. One of them rewrites `onchange` on an `input` or a
`textarea` to `oninput` for every type but file, checkbox and radio.

So a row that wants to commit only when a slider is LET GO cannot read the
native change event through `onChange`: it fires on every position the thumb
passes, and the row settles nothing. Native `change` on `<input type=range>`
is otherwise exactly right — a probe in Chromium gives
`input × n … pointerup, change, lostpointercapture` for a drag and
`input, change, keyup` for an arrow key — it is just not reachable by that
name here.

Spell the release out in pointer events instead: `onPointerUp` +
`onLostPointerCapture` (a range captures the pointer, so this is what catches
a finger lifted off the track or outside the window), with `onBlur` and
`onKeyUp` for the keyboard. Two of them can fire before the row renders
again, so hold the pending value in a REF as well as in state and clear the
ref on commit — otherwise the second handler reads a stale value and hands it
over twice, which is the second rebuild the whole exercise was avoiding.
