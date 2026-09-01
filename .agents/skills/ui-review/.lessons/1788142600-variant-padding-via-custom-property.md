---
title: When a VARIANT has to change a property a more specific rule also writes, route it through a custom property instead of restating the selector
date: 2026-08-31
scope: pwa/src/styles.css
concepts: [css, cascade, hud, responsive]
---

The cascade lesson's advice — carry the parent class into the override — does
not work when the differing value comes from a MODIFIER rather than a parent.
The co-driver plate is the case: `.hud-pace-to-left` has to add room for the
plate's point, and `.hud-pace-glyphs .hud-pace-call` (two classes, words-off
variant) rewrites the whole `padding` shorthand. Restating the selector means
`.hud-pace-glyphs .hud-pace-to-left` AND `.hud-pace-glyphs .hud-pace-to-right`
beside every future padding variant — a combinatorial set nobody keeps in step.

Invert it. Let the modifier set a CUSTOM PROPERTY and have every rule that
writes the property consume it:

```css
.hud-pace-call {
  --pace-lead: 0rem;
  padding: 0.3rem 0.8rem 0.3rem calc(0.45rem + var(--pace-lead));
}
.hud-pace-glyphs .hud-pace-call {
  padding: 0.25rem calc(0.45rem + var(--pace-lead));
}
.hud-pace-to-left {
  --pace-lead: var(--pace-point);
}
```

Custom properties cascade on their own name, so the modifier only competes
with the ONE rule that also sets `--pace-lead` — the base — and wins on source
order at equal specificity. The variant that rewrites `padding` never has to
know the modifier exists.

The tell that you need this: a variant rule and a modifier rule both want the
same longhand, and neither is a parent of the other.
