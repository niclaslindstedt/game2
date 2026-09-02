---
title: Do not judge a new country's circuits off `npm run sim -- --shape circuit --car compact` — it DNFs the taiga's own campaign circuit on main
date: 2026-09-02
scope: scripts/simulate-run.mjs, engine/mapgen/circuit.ts
concepts: [circuit, seeds, measurement, simulation, campaign]
---

Picking campaign circuits by bot sim, every desert circuit came back with
thirty seconds off the road, spins and a hundred per cent wear, which read
as the sand or the dunes breaking R22's closure. It was neither: the same
invocation on `origin/main` runs the taiga's own shipped medium circuit
(seed 3) to a DNF with 66 s off-road and two respawns, while the campaign
comment beside it records a 179 s finish.

Whatever that invocation is measuring, it is not the circuit's difficulty,
and it is not this branch's doing. Check a circuit change against the
baseline in a worktree (`git worktree add ../base origin/main`, symlink
`node_modules`) before reading a DNF as a regression, and pick circuit seeds
by the scoring pass (hairpins, jumps, curvature) rather than by which ones
the bot happens to survive.
