---
title: A `cover`-cropped banner's SCALE is its row's height, and an `ease-in-out` pan with a per-row delay reads as two different speeds
date: 2026-09-03
scope: pwa/src/styles.css, pwa/src/game/menu-levels.tsx
concepts: [css, menus, responsive, ui, measurement]
---

Two bugs in the campaign's country rows that both looked like "the desert one
is wrong" and were neither about the desert nor about the picture.

**Scale.** `.menu-location-shot` is an 8:1 render sized `width: 170%;
height: 100%; object-fit: cover`. Cover fills that box by HEIGHT from anything
wider, so the DISPLAY SCALE of the banner is set by the ROW'S HEIGHT — and a
locked row (padlock, centred) is taller than an open one (progress line), so
the two countries were at two different zooms, showing different amounts of
ground while panning the same pixels. The fix is equal rows, and the way to
get them with no magic number is `display: grid; grid-auto-rows: 1fr` on the
list: every row takes the tallest row's height, whatever the content and the
viewport's font clamps do. Add `justify-content: center` to the row so a
shorter one gets space above AND below rather than a gap under it.

**Speed.** The rows were staggered with `animation-delay: -27s` on
`nth-of-type(even)`, to stop two strips reading as one sheet. Under
`ease-in-out … alternate` that is not a phase difference, it is a SPEED
difference: the easing is near-still at the ends of a sweep and quickest
through the middle, so at every instant one row is visibly panning and the
other is visibly not. Either share one clock or use a constant-rate timing
function — a delay plus an eased curve cannot do both.

**Prove it with three numbers, not a screenshot.** Read
`getBoundingClientRect()` off the row AND the `img` inside it, and print
`h`, `imgW` and `img.left - row.left` (the live translate) per row per
viewport. Equal heights, equal widths and an equal offset on the same frame
is the whole claim; the eye cannot check any of the three.
