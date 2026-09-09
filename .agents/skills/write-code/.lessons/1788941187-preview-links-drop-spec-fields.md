---
title: The `?start=1` boot spec in App.tsx is a hand-written StageSpec — a field added to the menu path is silently missing from every tooling link
date: 2026-09-09
scope: pwa/src/App.tsx, scripts/
concepts: [harness, tooling, screenshots, preview, debug-tools]
---

`?temp=-4` was read correctly into `race.temperature` and then thrown away: the
`?start=1` boot path builds its own `StageSpec` literal (the non-campaign
branch near the end of App.tsx) and that literal listed `hour`, `weather` and
`season` but not `temperature`. The Roam path a few hundred lines up carries it
with a comment explaining why it matters. So the menu was right and every
`make debug-shot` / `make screenshots` link was quietly getting the season's
default instead.

This is invisible from the outside whenever the value you pass happens to equal
the default — a taiga winter defaults to -8, so `?temp=-8` "worked" and proved
nothing. **Verify a URL knob with a value the default cannot produce** (here,
`season=winter&temp=12`: the surface came back `snow`, which no +12 stage can
be) and read the answer off the debug overlay's own rows rather than off the
picture.

Anything spec-shaped in App.tsx has several literals that must agree — the boot
link, Roam's `startStage`, `demoStage`, the backdrop, the ghost stage and the
run tape. Adding a field to `StageSpec` means grepping the field next to it
(`season:` is the reliable anchor) and checking every hit, not just the one the
feature was written against. `sandstorms` is inconsistent across the same set
today.
