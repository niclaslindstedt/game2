// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// R42 — THE COUNTRY MAP the car parks are planned on: a coarse lattice of
// cells over the stage's box, each one asked whether a road may be driven
// through it and whether a person may walk across it, and the two searches
// that read it — where the crowd could walk to from a stand, and which way
// a road could leave the map from a pad.
//
// Coarse on purpose. A cell is a place a road or a path may pass THROUGH,
// and the walk that lays either one (carparks.ts) reads the real ground
// under every step; the map only has to say which pockets of the country
// connect to which. Cells answer lazily and are remembered, so a search
// pays for the cells it visits and nothing else.

import { roadClearance, ROAD_CROSS } from "./road.ts";
import { STAGE_RULES as R } from "./rules.ts";
import { SPUR } from "./spurs.ts";

const P = R.carPark;

/** The map's cell, m. Under R23's clearance, so a lane between two arms of
 * the stage still finds the cells between them. */
export const CELL = 24;

/** How far out from the box the map reaches, m: past where a road counts
 * as having left (`SPUR.escape`), with a cell to spare. */
const EDGE = SPUR.escape + CELL;

/** How many cells the search for a way out may settle before it gives up:
 * a medium stage's box is some ten thousand cells, and a road that has not
 * found the edge after this many has been walking round a closed pocket. */
const SEARCH_CAP = 6000;

/** What the edge of the map costs a way out, m, against a road it could
 * have run into instead — the detour a lane is worth to end on tarmac
 * rather than past the fog (`wayOut`).
 *
 * A kilometre, which is a long way for a car park's lane and is meant to
 * be: the rim is always within a few hundred metres of a pad and the
 * country's one public road is typically several hundred to a couple of
 * thousand away, so anything smaller never changes an answer. At this it
 * changes most of them, and what it buys is a lane a player can drive from
 * the tarmac to the cars instead of one that vanishes into the fog. */
const RIM_PENALTY = 1200;

export type Box = { minX: number; maxX: number; minZ: number; maxZ: number };

/** What the map asks the world. The same three questions the placer asks,
 * handed in so a test can drive the map off a flat rig. */
export type CountryProbe = {
  routeDistance: (x: number, z: number) => number;
  builtClearance: (x: number, z: number) => number;
  blocked: (x: number, z: number) => boolean;
  flooded: (x: number, z: number, margin?: number) => boolean;
  /** The stage's nominal half width plus its verge: the route's corridor. */
  corridor: number;
};

export type CountryMap = {
  cols: number;
  rows: number;
  bounds: Box;
  /** Cell index of a point, or -1 off the map. */
  at: (x: number, z: number) => number;
  centre: (cell: number) => { x: number; z: number };
  /** Whether a road may be driven through the cell: R23's clearance from
   * the route and every other road, and dry ground. */
  drivable: (cell: number) => boolean;
  /** Whether a person may walk across it: off the route's corridor, out of
   * the water and the streams, off a guard's mound. */
  walkable: (cell: number) => boolean;
  /** True where a road standing here has left the map. */
  out: (cell: number) => boolean;
};

/** The map over `bounds` — the country the stage occupies, which is what a
 * road LEAVES (`out`) and what the rim of the search is measured from.
 *
 * `reach` is how far past that box the LATTICE goes, and the two are not the
 * same number. The default is just enough to hold the escape; a caller with
 * a public road standing off the stage passes more, because a lane can only
 * run to a road the lattice actually covers and the country's one road can
 * lie the better part of a kilometre outside the box the rally folds into.
 * Growing the escape box instead would make every lane that runs off the map
 * run that much further before it had left.
 *
 * Rebuilt for every car park, because the built things a road keeps off
 * change as each one is committed. */
export function createCountryMap(
  bounds: Box,
  probe: CountryProbe,
  reach: number = EDGE + CELL,
): CountryMap {
  const keepOut = roadClearance(P.road.width);
  const pad = Math.max(EDGE + CELL, reach);
  const minX = bounds.minX - pad;
  const minZ = bounds.minZ - pad;
  const cols = Math.ceil((bounds.maxX - bounds.minX + 2 * pad) / CELL);
  const rows = Math.ceil((bounds.maxZ - bounds.minZ + 2 * pad) / CELL);
  /** 0 unasked, 1 yes, 2 no — one byte a question. */
  const drive = new Uint8Array(cols * rows);
  const walk = new Uint8Array(cols * rows);
  const at = (x: number, z: number): number => {
    const i = Math.floor((x - minX) / CELL);
    const j = Math.floor((z - minZ) / CELL);
    if (i < 0 || j < 0 || i >= cols || j >= rows) return -1;
    return j * cols + i;
  };
  const centre = (cell: number): { x: number; z: number } => ({
    x: minX + ((cell % cols) + 0.5) * CELL,
    z: minZ + (Math.floor(cell / cols) + 0.5) * CELL,
  });
  const drivable = (cell: number): boolean => {
    if (drive[cell] === 0) {
      const c = centre(cell);
      // A cell's centre stands a half-diagonal from its corners, and the
      // lane laid through it cuts a corner or two on the way: the room a
      // cell has to offer is the room at its centre less that.
      const ok =
        probe.routeDistance(c.x, c.z) >= keepOut + CELL * 0.7 &&
        probe.builtClearance(c.x, c.z) >= P.road.clear + CELL * 0.7 &&
        !probe.flooded(c.x, c.z, SPUR.shoreFreeboard);
      drive[cell] = ok ? 1 : 2;
    }
    return drive[cell] === 1;
  };
  const walkable = (cell: number): boolean => {
    if (walk[cell] === 0) {
      const c = centre(cell);
      // No slack for the cell's own size: a path hugs the route's verge
      // where a road cannot, and a cell whose centre is a metre clear is a
      // cell the walk can get through, reading the real ground as it goes.
      const ok =
        probe.routeDistance(c.x, c.z) >= probe.corridor + P.trail.clear &&
        !probe.blocked(c.x, c.z) &&
        !probe.flooded(c.x, c.z, 0.4);
      walk[cell] = ok ? 1 : 2;
    }
    return walk[cell] === 1;
  };
  const out = (cell: number): boolean => {
    const c = centre(cell);
    return (
      c.x < bounds.minX - SPUR.escape ||
      c.x > bounds.maxX + SPUR.escape ||
      c.z < bounds.minZ - SPUR.escape ||
      c.z > bounds.maxZ + SPUR.escape
    );
  };
  return { cols, rows, bounds, at, centre, drivable, walkable, out };
}

/** The eight neighbours of a cell, with the step's length in cells. */
function neighbours(map: CountryMap, cell: number): { cell: number; cost: number }[] {
  const i = cell % map.cols;
  const j = Math.floor(cell / map.cols);
  const out: { cell: number; cost: number }[] = [];
  for (let dj = -1; dj <= 1; dj++) {
    for (let di = -1; di <= 1; di++) {
      if (di === 0 && dj === 0) continue;
      const ni = i + di;
      const nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= map.cols || nj >= map.rows) continue;
      out.push({ cell: nj * map.cols + ni, cost: di !== 0 && dj !== 0 ? Math.SQRT2 : 1 });
    }
  }
  return out;
}

/** Dijkstra over the walkable cells from `from`, out to `reach` metres of
 * path: the distance to every cell a person could reach, in cells, and the
 * cell each was reached from. What a pad is looked for with, and what a
 * trail is threaded along. */
export function walkFrom(
  map: CountryMap,
  from: number,
  reach: number,
): { dist: Float64Array; via: Int32Array } {
  const dist = new Float64Array(map.cols * map.rows).fill(Infinity);
  const via = new Int32Array(map.cols * map.rows).fill(-1);
  const limit = reach / CELL;
  dist[from] = 0;
  // A binary heap would be the textbook; the frontier here is a few
  // hundred cells and a sorted scan of it is cheaper than the bookkeeping.
  const open: number[] = [from];
  while (open.length > 0) {
    let best = 0;
    for (let k = 1; k < open.length; k++) if (dist[open[k]] < dist[open[best]]) best = k;
    const cell = open[best];
    open[best] = open[open.length - 1];
    open.pop();
    const here = dist[cell];
    if (here > limit) continue;
    for (const n of neighbours(map, cell)) {
      if (!map.walkable(n.cell)) continue;
      const d = here + n.cost;
      if (d >= dist[n.cell]) continue;
      if (dist[n.cell] === Infinity) open.push(n.cell);
      dist[n.cell] = d;
      via[n.cell] = cell;
    }
  }
  return { dist, via };
}

/** A* over the drivable cells from `from` to a road already there that the
 * new one may run into (`join`), or failing that off the map. The cells of
 * the way, `from` first, or null where the country is a pocket the stage
 * has closed.
 *
 * A JOIN IS PREFERRED, and `RIM_PENALTY` is how the preference is expressed:
 * a lane exists because cars drove up it, and a lane onto a road is a lane
 * they plainly drove up. The rim is the honest second answer rather than a
 * failure — a rally route folded into its own box partitions the country it
 * occupies, and on most seeds the pocket a corner sits in has no road in it
 * at all, so a search that insisted on tarmac left two thirds of the stages
 * measured with no crowd anywhere on them. Charging the rim a few hundred
 * metres in the heuristic makes the search spend a detour to reach a road
 * and take the rim only when there is none to reach. */
export function wayOut(
  map: CountryMap,
  from: number,
  join: { at: (cell: number) => boolean; distance: (x: number, z: number) => number },
): number[] | null {
  const b = map.bounds;
  const h = (cell: number): number => {
    const c = map.centre(cell);
    const edge =
      Math.min(
        c.x - (b.minX - SPUR.escape),
        b.maxX + SPUR.escape - c.x,
        c.z - (b.minZ - SPUR.escape),
        b.maxZ + SPUR.escape - c.z,
      ) + RIM_PENALTY;
    return Math.max(0, Math.min(edge, join.distance(c.x, c.z))) / CELL;
  };
  const g = new Float64Array(map.cols * map.rows).fill(Infinity);
  const via = new Int32Array(map.cols * map.rows).fill(-1);
  const closed = new Uint8Array(map.cols * map.rows);
  // The heuristic once per cell: the open list is scanned for its best
  // entry on every pop, and a heuristic that asks the world each time is
  // the whole cost of the search.
  const hs = new Float64Array(map.cols * map.rows).fill(NaN);
  const hOf = (cell: number): number => {
    if (Number.isNaN(hs[cell])) hs[cell] = h(cell);
    return hs[cell];
  };
  g[from] = 0;
  const open: number[] = [from];
  const f = (cell: number): number => g[cell] + hOf(cell);
  let visited = 0;
  while (open.length > 0) {
    let best = 0;
    for (let k = 1; k < open.length; k++) if (f(open[k]) < f(open[best])) best = k;
    const cell = open[best];
    open[best] = open[open.length - 1];
    open.pop();
    if (closed[cell]) continue;
    closed[cell] = 1;
    if (map.out(cell) || (cell !== from && join.at(cell))) {
      const path: number[] = [];
      for (let c = cell; c >= 0; c = via[c]) path.push(c);
      return path.reverse();
    }
    if (++visited > SEARCH_CAP) return null;
    for (const n of neighbours(map, cell)) {
      if (closed[n.cell] || !map.drivable(n.cell)) continue;
      const d = g[cell] + n.cost;
      if (d >= g[n.cell]) continue;
      if (g[n.cell] === Infinity) open.push(n.cell);
      g[n.cell] = d;
      via[n.cell] = cell;
    }
  }
  return null;
}

/** The route's corridor for a stage of `width`: mat, shoulder and verge. */
export function routeCorridor(width: number): number {
  return width / 2 + ROAD_CROSS.reach;
}
