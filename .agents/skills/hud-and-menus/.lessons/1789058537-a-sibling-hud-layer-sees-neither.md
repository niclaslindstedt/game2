---
title: A sibling `.hud` layer inherits neither the HUD's variables nor its `data-*` flags — the first fails loudly-looking and silently, the second matches nothing at all
date: 2026-09-08
scope: pwa/src/styles.css, pwa/src/game/, pwa/src/App.tsx
concepts: [css, hud, layout, silent-failure, ui, replay]
---

`--hud-map`, `--hud-tach`, `--hud-stage`, `--hud-top` and `--hud-health-top` are
declared on `.hud`, not on `:root`; so are the flags the placement rules key on
(`data-glass`, `data-seated`, `data-night`). Anything App renders as a SIBLING
of `<Hud>` — the replay strip, the news column while the HUD is hidden, any
overlay that must stand when the chrome comes down — is outside BOTH.

**The variables fail silently and look like a bug three files away.** An
unresolvable `var()` is "invalid at computed-value time": the property becomes
`unset` rather than falling back, so

    bottom: calc(max(1rem, env(safe-area-inset-bottom)) + var(--hud-tach) + 0.4rem);

resolves to `bottom: auto` and the element jumps to the TOP of the screen. The
fix is to wrap the overlay in its own `.hud` layer, never to restate the number
— `--hud-tach` is stated once precisely so nothing standing on the panel can
drift from it.

**The flags fail the other way: the rule simply never matches, on a layer that
otherwise looks right.** `.hud[data-glass] .thing` written for an overlay in its
own layer is dead CSS, because that layer's `.hud` carries no `data-glass`. The
wrapper gets the variables and nothing else, so a placement that has to know
what the rest of the HUD is doing has to be handed the flag: compute the fact
ONCE where it is decided (`glassSlot` in `hud-mirror.tsx`) and stamp it on both
layers. A second copy of that condition is a bug the day one of its terms moves.

The first sign of the first is an absolutely-positioned overlay landing top-left
instead of where its `bottom`/`right` says. The first sign of the second is a
rule that works in dev-tools when you add the attribute by hand.
