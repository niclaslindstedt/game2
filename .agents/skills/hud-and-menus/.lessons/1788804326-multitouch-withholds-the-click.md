---
title: A browser synthesizes a touch's `click` only from a tap that had the glass to itself, so with a thumb on the gas every HUD button is dead
date: 2026-09-07
scope: pwa/src/game/second-finger.ts, pwa/src/game/hud.tsx
concepts: [touch, input, hud, menus, ios]
---

`click` is not reported on a touchscreen, it is SYNTHESIZED from a tap the
browser's gesture recognizer accepted — and that recognizer wants the press to
have been the only touch on the screen for the whole of its life. A press that
overlapped another finger at any point, in either order, gets `pointerdown`,
`pointerup` and `:active` but no click and no `onClick`. Which is every press a
driver makes, because a thumb is on the pedal zone.

`second-finger.ts` now fires those presses itself, globally, from `App.tsx`.
Two consequences for anything new here:

- **A new HUD or menu press needs nothing.** Keep it a `<button>` with an
  `onClick`; the relay calls the element's own `click()`. Do NOT hand-roll
  `onPointerUp` on a button to "fix" a dead press — the relay is already firing
  it and you would get two.
- The relay rescues ONLY shared presses. A solitary tap still gets the
  browser's click, so the two paths never both fire.

**The methodological half, which cost the most time here:** the obvious suspect
was `text-interaction.ts`, whose loupe guard calls `preventDefault()` on the
thumb zone's `touchstart` — and a prevented `touchstart` really does cancel a
click. It was innocent. A four-way probe (guard on/off × pointer capture
on/off, driving CDP `Input.dispatchTouchEvent` with two touch points) showed
the click missing in all four. Do not reason about which listener ate a touch:
a throwaway page plus `Input.dispatchTouchEvent` settles it in a minute, and
CDP's `touchEnd` takes the points being RELEASED, so lifting the wrong finger
silently looks like the bug you are hunting.
