---
title: The ground over a bore cannot be left to the lattice — a bore is a TRENCH in the lattice with the mountain drawn back over it, and the trench runs a bench past the lip
date: 2026-09-06
scope: engine/mapgen/terrain.ts, engine/mapgen/solids.ts, pwa/src/game/tunnel-lid.ts
concepts: [r47, tunnel, lattice, ground-cell, trench, lid, portal]
---

The first tunnel left the country over the bore untouched ("the road shapes
nothing off a tunnel sample"). Read at the corners of a 14 m lattice, that
made the ONE cell straddling each mouth a tile with a corner on the cutting
(road level) and a corner on the mountain (thirty metres up) — a steep tile
drawn ACROSS the road, which the car drove into as a snow bank. No amount
of cone-gating at the mouth fixes it: the lattice cannot express a vertical
face along the road, only a ramp between the corners it has.

What works is to give the lattice what it can draw: a TRENCH at road level
under the whole bore (the corridor shelf, `cutAt` = 1 the whole way so it
is rock to every reader), and let the RENDERER draw the mountain back over
it as a lid off a field the engine states (`lidAt`: the bare land inside
the trench, the lattice itself beyond it, so it meets another arm's cutting
instead of floating over it). Two things follow. The trench must run a
BENCH past the lip (`tunnelTrench`), because the cell straddling the
trench's edge is a ramp from wherever its inner corner fell, and with the
edge at the lip that corner fell inside the vault's walls and the ramp
came up through the lining as pale wedges at the road's edge. And a bore is
only worth it under a MOUNTAIN (`tunnel.cover`): a portal rule alone
(`depth`) tunnelled shoulders whose far brow was thinner than the lining.
