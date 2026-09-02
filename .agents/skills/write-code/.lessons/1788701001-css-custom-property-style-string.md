---
title: A CSS custom property on an element is written as a `style` STRING in this app — Preact's CSSProperties rejects `--name` keys
date: 2026-09-02
scope: pwa/src/game/
concepts: [css, preact, typescript, ui]
---

A row that paints its own fill (`background: linear-gradient(... var(--fill))`
on a range input) needs the element to carry `--fill`. Under `preact/compat`
the JSX `style` prop is typed `string | CSSProperties`, and `CSSProperties`
has no index signature, so `style={{ "--fill": "70%" }}` is a type error.
Pass the declaration as a string instead — a template literal building
`--fill: 70%` — which typechecks and which Preact applies as `cssText`. That
is what you want for a property the stylesheet owns and the component only
feeds. Do not reach for `setProperty` in an effect for this — it is one line
of markup, not a lifecycle.
