---
title: A token spelt as `var(--other)` is resolved where it is DECLARED, so an alias on `:root` never follows a deeper redefinition
date: 2026-09-07
scope: pwa/src/styles.css
concepts: [css, hud, palette, theming]
---

`:root` declares two of the condition colours as aliases —
`--hud-hp-ok: var(--hud-green)` and `--hud-hp-hurt: var(--hud-good)`. A
`var()` inside a custom property is substituted at computed-value time on
the element the declaration applies to, which for these is `html`. The
substituted colour is then what every descendant inherits.

So a variant palette scoped further down (`.hud[data-night="1"]`, a theme
class, a media query on a component) that redefines `--hud-green` changes
nothing about `--hud-hp-ok`: the alias was already resolved against the
default palette and inherits down as a literal. The schematic keeps the
day green while everything around it dims, and it looks like the rule
failed to apply rather than like a substitution that happened too early.

Any scoped palette must restate the aliases alongside the tokens they
point at:

```css
.hud[data-night="1"] {
  --hud-green: #3ba54c;
  --hud-hp-ok: var(--hud-green); /* re-resolved HERE, not on :root */
}
```

The same trap waits for any future variant of this palette — and it is
silent, because nothing in CSS reports a token that resolved earlier than
you meant.
