// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHERE THE BRANCHES RUN, as a lookup. Every height query the terrain field
// makes asks it for the branch nearest the point, so it answers out of a
// spatial hash in a fixed few cell probes rather than a walk down every
// branch ever built.

import { blockOffsets, cellKey } from "../lib/math.ts";
import type { SpurLine, SpurSample } from "./spurs.ts";

/** Where the branches run, as a lookup: the terrain field asks it for the
 * nearest branch under every height query, so it has to answer in a fixed
 * few cell probes rather than a walk down every spur it has ever built.
 *
 * `sample` is the branch AT THE FOOT OF THE PERPENDICULAR — interpolated
 * between the two samples either side of the point, never the nearest
 * sample as laid — and `d` is the distance to that foot. The distinction is
 * the whole ride: a branch's samples are `SPUR.step` apart, and on an 8%
 * grade the nearest one is up to 0.32 m off the road's real height half the
 * time, so a shelf hung off it is a staircase with a tread every four metres
 * and a crown that wanders as the nearest vertex changes hands. The
 * returned sample is a scratch record owned by the index: read it before
 * the next query, never keep it. */
export type SpurHit = { spur: SpurLine; sample: SpurSample; d: number };

export type SpurIndex = {
  spurs: SpurLine[];
  add: (spur: SpurLine) => void;
  nearest: (x: number, z: number) => SpurHit | null;
  /** The branch whose FILL stands highest here: over every branch in reach,
   * the one whose road, run out from its own edge (`edgeOf`) at `climb`
   * metres per metre, is the highest at this point. The ground between
   * two branches, or a branch and the route, has to carry the taller
   * fill whichever is nearer (terrain.ts) — and `nearest` cannot say
   * which: where a branch on a twenty-metre fill hands over to a lower
   * one its fill was simply dropped, a step the height of the fill along
   * the midline. Its own scratch record, so a `nearest` read stays good
   * beside it. */
  highest: (
    x: number,
    z: number,
    climb: number,
    edgeOf: (spur: SpurLine) => number,
  ) => SpurHit | null;
  /** The branch whose CONE stands lowest here: over every branch in reach,
   * the one whose road, with a bench `bench` wide and the country rising
   * off it at `climb`, holds the country lowest at this point — R31's
   * ceiling is a min over every road, and the nearest branch alone is not
   * that. Where a branch cut thirty metres under the country hands over
   * to a higher one, the nearest changes hands and the lower one's cone
   * simply stops: a twenty metre step ruled along the midline (seed 22).
   * Its own scratch record, like `highest`. */
  lowest: (x: number, z: number, climb: number, bench: number) => SpurHit | null;
  /** Endless: forget the branches the run has left far behind. */
  pruneBefore: (atS: number) => void;
};

/** Cell edge of the branch lookup, m — ten samples or so per cell. Coarse
 * on purpose: the reach below is three rings of it, and the same reach
 * out of five rings of 24 m cells costs every height query a fifth more
 * (the block is 121 lookups instead of 49, and twice the non-empty cells
 * to box-test), where a cell's own box throws away the extra samples. */
const INDEX_CELL = 40;

/** How far from a point `nearest` is GUARANTEED to find a branch, m: the
 * three rings of the block below. Anything shaped off a branch's distance
 * — its verge cone above all — has to be finished by here, because past
 * it the branch is found or not depending on which index cell the point
 * fell in, and a cone that is still cutting when its road stops being
 * found ends in a wall ruled along the cell boundary. A hundred and
 * twenty metres so a branch's cone has a run past the bench before it
 * lets go (R31, `verge.fade`): at seventy-two the cone let go straight off
 * the bench, and every hillside beside a branch was the fade's face. */
const INDEX_RINGS = 3;
export const SPUR_INDEX_REACH = INDEX_CELL * INDEX_RINGS;

/** One cell of the branch index: the samples in it, and the box they
 * occupy. A branch crosses a cell as a ribbon, so its box is a fraction of
 * the 24 m square — which is what makes it worth testing before the
 * samples. Splicing a spent branch out only ever shrinks what the box
 * holds, so a box left as it was stays a superset and costs work rather
 * than correctness. */
type SpurCell = {
  entries: { spur: SpurLine; sample: SpurSample; index: number }[];
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  /** The highest and the lowest road in the cell — what bounds `highest`'s
   * and `lowest`'s answers from a cell before its samples are read, the way
   * the box bounds `nearest`'s. */
  maxY: number;
  minY: number;
};

/** The rings out, comfortably past the corridor AND the shelf blend beyond
 * it. Cutting the search off inside the blend is what leaves fans of
 * shading radiating from a branch: the ground stops being flattened at the
 * cell boundary instead of at the blend's end. */
const NEAR_BLOCK = blockOffsets(INDEX_RINGS);

export function createSpurIndex(): SpurIndex {
  const spurs: SpurLine[] = [];
  const grid = new Map<number, SpurCell>();
  const key = (x: number, z: number): number =>
    cellKey(Math.floor(x / INDEX_CELL), Math.floor(z / INDEX_CELL));

  /** The block the last query looked at, held for the next one. Every height
   * query asks this index, and they arrive in clusters a few metres apart —
   * the lattice corners under a wheel, the probes around a ground reading —
   * so the forty-nine map lookups are paid once per cell rather than once
   * per query. Dropped whenever the grid changes shape. */
  let nearCx = NaN;
  let nearCz = NaN;
  const nearCells: SpurCell[] = [];

  /** The interpolated sample every hit hands back — one record, rewritten
   * per query, because this runs under every height reading the terrain
   * answers and an allocation per call there is the cost of the lattice. */
  const foot: SpurSample = {
    x: 0,
    z: 0,
    heading: 0,
    elevation: 0,
    s: 0,
    surface: "gravel",
    lift: 0,
    flat: 0,
  };

  const add = (spur: SpurLine): void => {
    spurs.push(spur);
    for (let index = 0; index < spur.samples.length; index++) {
      const sample = spur.samples[index];
      const k = key(sample.x, sample.z);
      let cell = grid.get(k);
      if (!cell) {
        grid.set(
          k,
          (cell = {
            entries: [],
            minX: Infinity,
            maxX: -Infinity,
            minZ: Infinity,
            maxZ: -Infinity,
            maxY: -Infinity,
            minY: Infinity,
          }),
        );
      }
      cell.entries.push({ spur, sample, index });
      if (sample.x < cell.minX) cell.minX = sample.x;
      if (sample.x > cell.maxX) cell.maxX = sample.x;
      if (sample.z < cell.minZ) cell.minZ = sample.z;
      if (sample.z > cell.maxZ) cell.maxZ = sample.z;
      if (sample.elevation > cell.maxY) cell.maxY = sample.elevation;
      if (sample.elevation < cell.minY) cell.minY = sample.elevation;
    }
    nearCx = NaN;
  };

  /** The cells the block around (`x`, `z`) reaches, held from the last
   * query (see `nearCells`). */
  const blockAt = (x: number, z: number): SpurCell[] => {
    const cx = Math.floor(x / INDEX_CELL);
    const cz = Math.floor(z / INDEX_CELL);
    if (cx !== nearCx || cz !== nearCz) {
      nearCx = cx;
      nearCz = cz;
      nearCells.length = 0;
      for (let i = 0; i < NEAR_BLOCK.length; i += 2) {
        const cell = grid.get(cellKey(cx + NEAR_BLOCK[i], cz + NEAR_BLOCK[i + 1]));
        if (cell) nearCells.push(cell);
      }
    }
    return nearCells;
  };

  /** How far the point is from a cell's box, squared — zero inside it. */
  const boxD2 = (cell: SpurCell, x: number, z: number): number => {
    const bx = x < cell.minX ? cell.minX - x : x > cell.maxX ? x - cell.maxX : 0;
    const bz = z < cell.minZ ? cell.minZ - z : z > cell.maxZ ? z - cell.maxZ : 0;
    return bx * bx + bz * bz;
  };

  /** The hit for the vertex `index` of `spur`, read at the foot of the
   * perpendicular (see `SpurHit`) into `out`. The nearest VERTEX is in
   * hand; the nearest point on the road is on one of the two segments it
   * ends, and the foot of the perpendicular onto that segment is where the
   * road's height is read. Between two samples the road is a straight
   * ramp — which is also exactly what the renderer's ribbon draws between
   * them. */
  const footOf = (
    spur: SpurLine,
    index: number,
    vertexD2: number,
    x: number,
    z: number,
    out: SpurSample,
  ): SpurHit => {
    const line = spur.samples;
    const at = line[index];
    let from = at;
    let to = at;
    let t = 0;
    let d2 = vertexD2;
    for (const k of [index - 1, index + 1]) {
      if (k < 0 || k >= line.length) continue;
      const other = line[k];
      const ex = other.x - at.x;
      const ez = other.z - at.z;
      const len2 = ex * ex + ez * ez;
      if (len2 < 1e-6) continue;
      const u = Math.max(0, Math.min(1, ((x - at.x) * ex + (z - at.z) * ez) / len2));
      const px = at.x + ex * u - x;
      const pz = at.z + ez * u - z;
      const pd2 = px * px + pz * pz;
      if (pd2 >= d2) continue;
      d2 = pd2;
      from = at;
      to = other;
      t = u;
    }
    out.x = from.x + (to.x - from.x) * t;
    out.z = from.z + (to.z - from.z) * t;
    out.elevation = from.elevation + (to.elevation - from.elevation) * t;
    out.s = from.s + (to.s - from.s) * t;
    out.lift = from.lift + (to.lift - from.lift) * t;
    out.flat = from.flat + (to.flat - from.flat) * t;
    // Two consecutive headings are a few degrees apart at most, so the
    // short way round is the difference itself.
    let turn = to.heading - from.heading;
    while (turn > Math.PI) turn -= 2 * Math.PI;
    while (turn < -Math.PI) turn += 2 * Math.PI;
    out.heading = from.heading + turn * t;
    out.surface = t < 0.5 ? from.surface : to.surface;
    return { spur, sample: out, d: Math.sqrt(d2) };
  };

  const nearest = (x: number, z: number): SpurHit | null => {
    if (spurs.length === 0) return null;
    const cells = blockAt(x, z);
    let bestSpur: SpurLine | null = null;
    let bestIndex = -1;
    let bestD2 = Infinity;
    // Squared throughout, and the winner built once at the end: this runs
    // under every height query the terrain answers, and a root per candidate
    // and an object per improvement are both pure waste there.
    for (let c = 0; c < cells.length; c++) {
      const cell = cells[c];
      // The block reaches `SPUR_INDEX_REACH` and the branch the point is
      // beside is normally in the middle cell, so most of these boxes are already
      // further off than the answer in hand — see `blockOffsets` for why
      // the ring order is what makes that true this early.
      if (boxD2(cell, x, z) >= bestD2) continue;
      const entries = cell.entries;
      for (let i = 0; i < entries.length; i++) {
        const sample = entries[i].sample;
        const dx = sample.x - x;
        const dz = sample.z - z;
        const d2 = dx * dx + dz * dz;
        if (d2 >= bestD2) continue;
        bestD2 = d2;
        bestSpur = entries[i].spur;
        bestIndex = entries[i].index;
      }
    }
    if (!bestSpur) return null;
    return footOf(bestSpur, bestIndex, bestD2, x, z, foot);
  };

  /** `highest`'s own scratch record — see `foot`. */
  const crest: SpurSample = { ...foot };

  const highest = (
    x: number,
    z: number,
    climb: number,
    edgeOf: (spur: SpurLine) => number,
  ): SpurHit | null => {
    if (spurs.length === 0) return null;
    const cells = blockAt(x, z);
    let bestSpur: SpurLine | null = null;
    let bestIndex = -1;
    let bestD2 = Infinity;
    let best = -Infinity;
    for (let c = 0; c < cells.length; c++) {
      const cell = cells[c];
      // What the cell's highest road could stand at from its box's edge
      // bounds everything in it. `edgeOf` is a branch's own, so the bound
      // is read as if the edge were at the box — a little generous, and
      // only ever reads a cell it need not have.
      if (cell.maxY - Math.sqrt(boxD2(cell, x, z)) * climb <= best) continue;
      const entries = cell.entries;
      for (let i = 0; i < entries.length; i++) {
        const sample = entries[i].sample;
        // A road stands no higher than its own elevation, so a sample under
        // the answer in hand is out before its distance is taken.
        if (sample.elevation <= best) continue;
        const dx = sample.x - x;
        const dz = sample.z - z;
        const d2 = dx * dx + dz * dz;
        const out = Math.max(0, Math.sqrt(d2) - edgeOf(entries[i].spur)) * climb;
        const stands = sample.elevation - out;
        if (stands <= best) continue;
        best = stands;
        bestD2 = d2;
        bestSpur = entries[i].spur;
        bestIndex = entries[i].index;
      }
    }
    if (!bestSpur) return null;
    return footOf(bestSpur, bestIndex, bestD2, x, z, crest);
  };

  /** `lowest`'s own scratch record — see `foot`. */
  const trough: SpurSample = { ...foot };

  const lowest = (x: number, z: number, climb: number, bench: number): SpurHit | null => {
    if (spurs.length === 0) return null;
    const cells = blockAt(x, z);
    let bestSpur: SpurLine | null = null;
    let bestIndex = -1;
    let bestD2 = Infinity;
    let best = Infinity;
    for (let c = 0; c < cells.length; c++) {
      const cell = cells[c];
      // What the cell's lowest road could hold the country to from its
      // box's edge bounds everything in it.
      if (cell.minY + Math.max(0, Math.sqrt(boxD2(cell, x, z)) - bench) * climb >= best) continue;
      const entries = cell.entries;
      for (let i = 0; i < entries.length; i++) {
        const sample = entries[i].sample;
        // A cone stands no lower than its own road, so a sample over the
        // answer in hand is out before its distance is taken.
        if (sample.elevation >= best) continue;
        const dx = sample.x - x;
        const dz = sample.z - z;
        const d2 = dx * dx + dz * dz;
        const holds = sample.elevation + Math.max(0, Math.sqrt(d2) - bench) * climb;
        if (holds >= best) continue;
        best = holds;
        bestD2 = d2;
        bestSpur = entries[i].spur;
        bestIndex = entries[i].index;
      }
    }
    if (!bestSpur) return null;
    return footOf(bestSpur, bestIndex, bestD2, x, z, trough);
  };

  const pruneBefore = (atS: number): void => {
    let cut = 0;
    while (cut < spurs.length && spurs[cut].atS < atS) cut++;
    if (cut === 0) return;
    for (let i = 0; i < cut; i++) {
      for (const sample of spurs[i].samples) {
        const cell = grid.get(key(sample.x, sample.z));
        if (!cell) continue;
        const at = cell.entries.findIndex((e) => e.sample === sample);
        if (at >= 0) cell.entries.splice(at, 1);
      }
    }
    spurs.splice(0, cut);
    nearCx = NaN;
  };

  return { spurs, add, nearest, highest, lowest, pruneBefore };
}
