---
title: The wild branch already IS an open-ground driving mode — a PLACE needs a height field and a lip flag, not new physics
date: 2026-09-03
scope: engine/game/step.ts, engine/game/car.ts, engine/mapgen/
concepts: [terrain, off-road, jumps, orchestration, physics]
---

Everything in this game is located against a road centerline, so "somewhere
that is not a ribbon" reads as an engine rewrite. It is not. `step()`'s
off-road branch (the `preFix.offRoad` half) takes its ground from a plain
`(x, z)` height field, reads the slope and the brow along the car's own
TRAVEL, and asks `terrain.spurSurfaceAt` what it is standing on. Give it a
height field and a surface map and free driving works — that is how the
training ground (`mapgen/arena.ts`) is built. What a place still needs is a
stub ribbon: the car is put on a start line, `locate` wants a hint, and
`respawn` has to have somewhere to go.

**The wrinkle that costs a day if you miss it: an off-road brow launches as
a HOP, not a jump.** `launch`'s `hop` is
`pace < crestSpeed || bodyVy < hopRate || roadPull < gravity`, and a hop
books no `stats.airTime`, no jump, no landing event and no turbulence — the
bot drives through it. A purpose-BUILT ramp out there has to say so through
`GroundContext.lip`, which the wild branch hard-coded to `false` because
until there was an authored place nothing off a road had ever been built as
a jump. Setting it turns a 0.1 s bob into a 1 s flight off the top of the
ramp at the speed the ramp was drawn around.

Two things that follow for tests: assert on air time counted YOURSELF
(airborne steps), not on `stats.airTime`, until you have proved the launch
is not a hop — a hop reads as zero and looks like a broken ramp. And stop
any jump measurement at the edge of the place: a car that runs out of
ground launches off whatever is at the boundary, and that flight will
quietly become your ramp's numbers.
