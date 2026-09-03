---
title: A responsive override in styles.css loses silently — to source order, to a more specific base rule, and (for a modifier) to any rule that rewrites the same longhand
date: 2026-08-27
scope: pwa/src/styles.css
concepts: [css, cascade, portrait, responsive, hud]
---

`pwa/src/styles.css` is one long file in section order, and a `@media` block
adds NO specificity. Three ways an override that reads exactly right does
nothing, and none of them looks wrong in the source:

**Order.** A portrait override for `.hud-gears` written in the
damage-instrument section loses to the plain `.hud-gears` rule 180 lines below
in the touch-controls section. Put a responsive override immediately AFTER the
base rule it overrides, in that component's own section, even when it means a
second `@media` block with a condition already in the file. And a block
holding SEVERAL selectors has to clear the LAST of them — grouping
`.opt-keys`, `.opt-key` and `.opt-key-bind` after `.opt-keys` applies the grid
and drops the padding, which measures as a partial improvement, the worst
outcome: an obvious no-op gets investigated, a partial one gets accepted.

**Specificity.** A landscape override written `.car-pick-stage` cannot beat a
`.car-setup .car-pick-stage` sizing rule however far below it sits. Any time a
component restyles a shared element through a parent class, its responsive
overrides carry that parent too.

**A MODIFIER, where neither rule is the other's parent.** `.hud-pace-to-left`
needs room for the plate's point; `.hud-pace-glyphs .hud-pace-call` rewrites
the whole `padding` shorthand. Restating the selector means a combinatorial
set beside every future variant. Invert it: the modifier sets a CUSTOM
PROPERTY and every rule that writes the longhand consumes it
(`padding: 0.3rem calc(0.45rem + var(--pace-lead))`, with
`.hud-pace-to-left { --pace-lead: var(--pace-point) }`). Custom properties
cascade on their own name, so the modifier competes only with the base rule
that also sets it. The tell: a variant and a modifier both want the same
longhand and neither contains the other.

When a CSS fix produces no change in a measurement, suspect the cascade before
the measurement — an override that never applied and a fix that did not help
look identical from outside.
