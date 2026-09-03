---
title: A run simulated AHEAD of the clock and shown AT the clock needs two states — and a recording that ended behind the clock must still be played out, or the run-out never ends
date: 2026-09-03
scope: engine/sim/field.ts, engine/sim/trace.ts
concepts: [rivals, trace, determinism, run-phases, orchestration]
---

Precomputing a rival's run while it is on screen puts two cursors on one
`GameState`: the sim writing the trace is forty seconds up the road while
the shown car is on the line. One object cannot be both. `shadowState`
gives the shown car a shallow copy of the sim's state with its OWN `car`
(and its own damage clone, board and lap books) and shares everything
read-only — track, terrain, spec, env — so the renderer, the results and a
spectator's HUD read the shape they always read. `RivalRun.sim` is stepped;
`RivalRun.state` is posed. Anything the pose does not carry reads the sim's
END state on the shown car, so keep the pose to what the road shows and say
so in the module note.

The trap that cost the first run: `owed` was read as "the clock is past
what is written", and a sealed trace whose run ENDED before the clock
reached it (car 1 is home before the shot opens on a short stage) read as
owed forever — never booked, never `done`, and `settleField(Infinity)`
spun until the tool timed out. Owed road that is still being written is a
crew in the control; owed road past a SEALED trace is a finished crew, and
it is played to its end and booked the first time the clock looks at it.
The live field's rule is the same one: a crew run home while still owing
its head start keeps the debt on the sheet and is done anyway.
