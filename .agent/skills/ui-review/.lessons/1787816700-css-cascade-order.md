---
title: A media-query override written EARLIER in styles.css than its base rule silently loses
date: 2026-08-27
scope: pwa/src/styles.css
concepts: [css, cascade, portrait, responsive]
---

`pwa/src/styles.css` is one long file in section order, and a `@media` block
adds NO specificity. So a portrait override for `.hud-gears` written up in the
damage-instrument section loses to the plain `.hud-gears` rule 180 lines below
it in the touch-controls section — the declaration is in the stylesheet, the
devtools show it struck through, and nothing about the source hints at it.

This is not hypothetical: the manual car's gear taps overlapped the upright
booster in every portrait width, the override read exactly right, and two
rounds of build-and-measure returned byte-identical numbers before the cause
turned up. (The rule it replaced had the same bug, so the previous override had
never worked either.)

**Put a responsive override immediately AFTER the base rule it overrides**, in
that component's own section, even when it means a second `@media` block with
the same condition as one already in the file. Two blocks that work beat one
that reads better and does nothing.

And when a CSS fix produces no change in a measurement, suspect the cascade
before suspecting the measurement — an override that never applied and a fix
that did not help look identical from the outside.
