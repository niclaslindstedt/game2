---
title: A `--hud-*` custom property is scoped to `.hud` — read it from a sibling and the whole declaration becomes `unset`, silently
date: 2026-09-08
scope: pwa/src/styles.css, pwa/src/game/
concepts: [css, hud, layout, silent-failure, ui]
---

`--hud-map`, `--hud-tach`, `--hud-stage` and `--hud-health-top` are declared on
`.hud`, not on `:root`. Anything App renders as a SIBLING of `<Hud>` — the
replay strip, the news column when the HUD is hidden, any future overlay that
has to stand while the rest of the chrome comes down — is outside that scope.

The failure is silent and looks like a placement bug three files away. An
unresolvable `var()` is "invalid at computed-value time": the property does not
fall back to its previous value, it becomes `unset`. So

    bottom: calc(max(1rem, env(safe-area-inset-bottom)) + var(--hud-tach) + 0.4rem);

resolves to `bottom: auto` and the element jumps to its static position at the
TOP of the screen. Nothing warns, and the rule looks correct in the stylesheet.

Two fixes, and only one of them is right:

- **Wrap the overlay in its own `.hud` layer** —
  `<div className="hud pointer-events-none absolute inset-0 select-none">` —
  which is what App already does for `HudFlashes` under ALT. The variables come
  back and the night dressing (`data-night`) comes with them.
- Restating the number is the wrong fix. `--hud-tach` is the panel's height
  stated once precisely so the news column and anything else standing on the
  panel cannot drift from it.

The first sign is always the same: an absolutely-positioned overlay that lands
top-left instead of where its `bottom`/`right` says.
