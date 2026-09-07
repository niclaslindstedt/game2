---
title: A cue raised by the button AND by the handler it calls sounds twice — and only the small cues are capped
date: 2026-09-07
scope: pwa/src/game/audio/, pwa/src/game/
concepts: [bank, route, mixing, ui]
---

`playUi` caps how fast a cue may repeat, but only for `move` and `toggle`
(`MIN_GAP_MS` in `audio/ui.ts`) — the big ones are uncapped on the reasoning
that they "cannot be raised faster than a page can change". A press that goes
through two layers can raise one twice inside the same tick anyway, and the
result is one sound at double amplitude with a comb filter on it rather than
two sounds.

Every race-start button did exactly that: `menu.tsx`'s pause card and the
three buttons in `hud-finish.tsx` each raised `start` in their own `onClick`,
and the `startStage` they then called raised it again. It reads as a cue that
is subtly wrong rather than as a duplicate, which is why it survived.

When wiring a sound to a control, grep for the cue name across the handler
chain before adding it — the funnel is one place, but the CALLERS are not.
