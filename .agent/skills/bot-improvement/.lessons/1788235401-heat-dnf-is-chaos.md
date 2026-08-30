---
title: A DNF delta in `make heat` is chaos, not signal — any change to how the field leaves the line re-rolls a pre-existing respawn-loop trap
date: 2026-08-30
scope: engine/sim/
concepts: [simulation, heat, bot-tuning, reading-the-table, respawn]
---

`make heat` is three seeds x three difficulties, seven cars in contact. Any
change that alters how the grid leaves the line reshuffles every downstream
corner, and the retirement column swings wildly for it: across one change's
variants the same 210-run sweep gave 4, 5, 1, 3, 0 and 5 DNFs. Reading a
1 -> 4 move there as a regression sends you tuning a knob that had nothing to
do with it.

What makes it swing is an absorbing state that already exists: the bot
cannot reliably drive itself back onto the road (see the "reset button IS
the bot's recovery" lesson), so a crew that goes off at one particular spot
respawns at the last checkpoint, drives the identical line, goes off at the
identical spot, and loops until the clock runs out — 15-20 respawns and no
finish. Confirm the shape by logging `respawn` events with
`state.progressS`: the same metre every ~21 s is the loop, not a new bug.

So judge a start-line or temper change on a WIDER sweep — 25 seeds x three
difficulties, ~525 runs — and on **avg finish time and total respawns
excluding the looped runs**, which are stable, rather than on the DNF count.
Isolate cause from chaos by re-running with the behaviour kept and the
consequence neutralised (here: the ritual left in, every crew given the same
launch rev); if the DNF count still scrambles, it was never the change.
