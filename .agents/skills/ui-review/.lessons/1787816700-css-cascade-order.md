---
title: A responsive override in styles.css loses silently — to source order, and to a more specific base rule
date: 2026-08-27
scope: pwa/src/styles.css
concepts: [css, cascade, portrait, responsive]
---

`pwa/src/styles.css` is one long file in section order, and a `@media` block
adds NO specificity. So a portrait override for `.hud-gears` written up in the
damage-instrument section loses to the plain `.hud-gears` rule 180 lines below
it in the touch-controls section — the declaration is in the stylesheet, the
devtools show it struck through, and nothing about the source hints at it.

Not hypothetical: the manual car's gear taps overlapped the instrument stack
in every portrait width, the override read exactly right, and two rounds of
build-and-measure returned byte-identical numbers before the cause turned up.

**Put a responsive override immediately AFTER the base rule it overrides**, in
that component's own section, even when it means a second `@media` block with
the same condition as one already in the file. Two blocks that work beat one
that reads better and does nothing.

**A `@media` block holding SEVERAL selectors has to clear the last of them.**
Grouping the overrides for `.opt-keys`, `.opt-key` and `.opt-key-bind` in one
block placed after `.opt-keys` looks right and is half dead: the other two are
declared below it, so the grid override applied and the padding and min-width
did nothing. It measured as a partial improvement, which is the worst outcome
— an obvious no-op gets investigated, a partial one gets accepted. Split the
block, or put it after the LAST base rule it touches.

**SPECIFICITY is the other half of the same trap, and order will not save you
from it.** A `@media` block adds none, so a landscape override written as
`.car-pick-stage` cannot beat a `.car-setup .car-pick-stage` sizing rule
however far below it sits — the override has to name the same two classes. Any
time a component restyles a shared element through a parent class, its
responsive overrides have to carry that parent too.

And when a CSS fix produces no change in a measurement, suspect the cascade
before suspecting the measurement — an override that never applied and a fix
that did not help look identical from the outside.
