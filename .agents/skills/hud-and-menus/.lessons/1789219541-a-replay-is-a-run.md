---
title: A REPLAY IS A RUN, so every word on a run-end surface is also spoken to somebody who is only watching
date: 2026-09-12
scope: pwa/src/game/hud-finish.tsx, pwa/src/game/hud-replay.tsx, pwa/src/App.tsx
concepts: [hud, menus, replay, ui, review]
---

`startReplay` stands the stage up with `mode: "replay"` and nothing else
changes, so a recording reaches every surface a driven run does — the results
card included. The card came up over a replay offering **RETIRE** and
**RESTART STAGE**: there is no run to retire from, and `restart`
(`run-events.ts`) rewinds the recording to step 0 rather than putting anybody
on a grid. Both presses did the right thing under the wrong name.

The rule to check any new run-end copy against: **would a watcher read this as
being about THEIR race?** A verdict about the recorded run is fine
(`ENGINE DEAD` is the news the recording stops on); an instruction to the
player is not (`TOP 3 TO GO ON — RUN IT AGAIN`), and a press named for a
driver is the worst of the three because it also lies about what it does.
`FinishCard` now takes `replaying` and swaps the two words —
`EXIT` / `WATCH AGAIN` — while the handlers stay exactly as they were.

The layout half of the same trap: `.hud-replay` stands across the head of the
frame and the comment over it claims "the card's title and sheet clear it".
They do on the results card, which leads with a head ROW; they do not on
`.hud-finish-retired`, which is the headline itself at `top: 7%`. Do not try
to nudge that card down by `--replay-height` — that token is a reserve, not a
measurement (3.9rem against a bar measuring 79px at 1280x720). Centring the
notice in the frame over a replay is what actually clears it at every size.
