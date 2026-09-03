// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE GROUND LATTICE — how far apart the corners of the drawn ground are,
// and how far the tiles duck under whatever is drawn over them.
//
// Two numbers, and everything that grades a piece of ground has to know
// both, which is why they live here rather than inside the terrain field
// that applies them.
//
// The lattice is COARSE on purpose: fourteen metres between corners buys a
// country's worth of ground for a stage's worth of triangles. What it costs
// is detail — nothing much narrower than a cell can be graded into the
// drawn ground at all, because the flattening falls between the corners and
// never reaches the surface anyone stands on or drives over. A road gets
// round that by drawing its own ribbon on a two-metre spacing over tiles
// that duck below it (`TILE_SINK`, and `groundAt` puts the physics back on
// the ribbon); anything else that has to be FLAT has to be flat over
// something wider than a cell, which is why R39's village grades one band
// for the whole street instead of a disc per lot (`towns.ts`).

/** The world grid the terrain field triangulates its ground tiles on, m.
 * The renderer's tiles use the same lattice, and the physics rides exactly
 * the triangles drawn — see `TerrainField.groundAt`. */
export const GROUND_CELL = 14;

/** How far under the drawn ribbon the ground TILES are pinned, m. The road
 * mesh draws the whole corridor — mat, shoulder, ditch, lip (R16) — on a
 * 2 m sample spacing the ground lattice could never hold, so the lattice
 * ducks below all of it and lets the ribbon be the surface anyone sees
 * there. Anything graded LEVEL WITH a road's verge is graded to the sunk
 * level, because that is the ground the tiles actually hold, and a thing
 * standing on the verge's own height stands a third of a metre over it. */
export const TILE_SINK = 0.35;
