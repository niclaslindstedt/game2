// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHERE THE ROAD IS, ASKED FROM ANYWHERE. Every height the terrain returns
// starts with the same question — which piece of road is nearest this
// point, how far off it is, and which side — and it is asked millions of
// times per stage, so it is answered out of a spatial hash over the
// compiled samples rather than a walk down the centerline.
//
// The index owns the run-up and run-off aprons too (they are road the
// compiler never sampled), and on an endless stage it owns the WINDOW: the
// grid re-anchors to the live road as the car moves on, so a fresh query
// never shapes itself around road the world has already forgotten.

import { blockOffsets, cellKey } from "../lib/math.ts";
import type { Track, TrackSample } from "./compile.ts";
import { knobScale, STAGE_RULES as R } from "./rules.ts";
import { APRON, clamp01 } from "./terrain-streams.ts";
import { GROUND_CELL } from "./lattice.ts";
import type { BiomeRules } from "./biomes.ts";
import type { LandField } from "./land.ts";
import type { RoadShape } from "./road.ts";

/** A road sample as the shaping reads it: the cross-section at that point,
 * the centerline height it hangs off, and whether the road is bored
 * through the hill there rather than laid on it. */
export type RibbonSample = RoadShape & { elevation: number; tunnel?: boolean };

export type SampleIndex = ReturnType<typeof createSampleIndex>;

/** What the index has to know about the field it is indexing for. All of
 * it is R31's cone: how far a shelf reaches, how fast the ground may climb
 * away from it, and where the cone lets go — the index carries the cone
 * because it is settled while the nearest sample is being found, and
 * finding it twice is the one thing a query this hot cannot afford. */
export type SampleIndexDeps = {
  land: LandField;
  biome: BiomeRules;
  shelfEnd: number;
  SHELF_END2: number;
  BENCH: number;
  BENCH2: number;
  VERGE_CLIMB: number;
  CORRIDOR_RANGE: number;
  CONE_REACH2: number;
  FADE_FROM2: number;
  LOCAL_CONE: number;
  ceilingOf: (s: RibbonSample) => number;
  coneRise: (d: number, climb: number) => number;
  fadeWeight: (d: number, reach: number) => number;
  keepFade: (cone: number, w: number, climb: number) => void;
  /** Start a fresh cone accumulation for this query. */
  resetFade: () => void;
};

/** Build the index for one stage. Nothing is filed until the first query,
 * so the field is free to build it as soon as the cone's numbers exist. */
export function createSampleIndex(track: Track, deps: SampleIndexDeps) {
  const { land, biome, shelfEnd, SHELF_END2, BENCH, BENCH2, VERGE_CLIMB } = deps;
  const { CORRIDOR_RANGE, CONE_REACH2, FADE_FROM2, LOCAL_CONE } = deps;
  const { ceilingOf, coneRise, fadeWeight, keepFade, resetFade } = deps;
  const samples = track.samples;
  const GRID = 48;
  /** A grid cell's road: the sample indices in it, with their positions
   * alongside. The search below walks a hundred-odd of these per query and
   * only ever wants the two coordinates, so they are kept out here rather
   * than fetched through a sample object each time. */
  /** R31 — a cell's road, and the ceiling each sample of it imposes. The
   * ceiling is a PLANE, not a height: the corridor's own underside at the
   * sample (`top`), tilting away on the surface the road is actually built
   * on — its longitudinal grade AND its bank, together in `px`/`pz`. Both
   * halves matter. Without the grade, a road descending a hillside drags
   * the ground beside it down to the lowest point it reaches within a
   * bench; without the bank, a banked corner's high side is cut to the
   * height of its low one, which is a metre of trench along every fast
   * turn. `floor` is the lowest value the plane can hand back inside the
   * bench — the rejection that keeps the root and the dot product off most
   * of the candidates. */
  type Cell = {
    index: number[];
    x: number[];
    z: number[];
    top: number[];
    px: number[];
    pz: number[];
    /** The plane's two halves on their own — the sample's forward axis
     * (sin h, cos h), its grade along it and its bank across it — for the
     * one reader that has to take a neighbour's plane apart and put it
     * back together in road coordinates: the nearby cone's walk in
     * `nearestSample`. */
    fx: number[];
    fz: number[];
    slope: number[];
    bank: number[];
    floor: number[];
    /** R34 — the grade this sample's cone opens at past the bench, m per m.
     * `verge.climb` where the ground is till and the road was scraped in;
     * up to `verge.cut.face` where it is rock and the road was blasted
     * through it. Per sample rather than one constant, because it is a
     * property of what the road is and what it is cut through, and both
     * change along a stage. Never BELOW `VERGE_CLIMB`, which is what keeps
     * `cellFloor`'s rejection bound valid. */
    climb: number[];
    /** R47 — a PORTAL sample's gate: the along-road unit vector pointing
     * into the bore (zero on every other sample) and the mouth it stands
     * before. Its cone is a disc, and a disc a bench wide reaches twenty
     * metres into the mountain the road has gone under; past the mouth it
     * says nothing, and the country stands. */
    gx: number[];
    gz: number[];
    mx: number[];
    mz: number[];
    /** The box the cell's samples actually occupy, and the lowest `floor`
     * among them. Together they let a query REJECT a whole cell without
     * touching a sample — see `nearestSample`, where they are most of the
     * work the search does not do. A cell holds only the road that runs
     * through it, so its box is usually a ribbon across a corner of the
     * 48 m square rather than the square. */
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
    minFloor: number;
    /** ...and the span of ARC the cell's samples cover, as indices, so a
     * search for the OTHER arm of the stage can skip a cell holding only
     * the arm it already has. */
    minIndex: number;
    maxIndex: number;
  };
  const emptyCell = (): Cell => ({
    index: [],
    x: [],
    z: [],
    top: [],
    px: [],
    pz: [],
    fx: [],
    fz: [],
    slope: [],
    bank: [],
    floor: [],
    climb: [],
    gx: [],
    gz: [],
    mx: [],
    mz: [],
    minX: Infinity,
    maxX: -Infinity,
    minZ: Infinity,
    maxZ: -Infinity,
    minFloor: Infinity,
    minIndex: Infinity,
    maxIndex: -Infinity,
  });
  let grid = new Map<number, Cell>();
  let firstIndexed = 0;
  let indexed = 0;

  /** R34 — the grade the country beside one piece of road is allowed to
   * stand at, m per m past the bench.
   *
   * Four things decide it, and all four are the rule in one line each:
   * whether the road is CUT IN here at all, what it is cut through (rock
   * stands, till slumps), what the road is worth (a blasted tarmac cutting
   * or a scraped gravel one), and how hard the country is
   * (`knobs.steepness`). Multiplied rather than taken as a max, because a
   * cutting needs all four: a sealed road running down a valley on its own
   * embankment gets the same soft bank a farm track does, and so does a
   * sealed road cut deep into a hillside of till.
   *
   * The FIRST of them is the one that decides where cuttings are, and it
   * only means anything because the road follows the country
   * (`elevation.follow`): most of a stage runs along the low ground at or
   * over natural grade, and the answer there is R31's own climb with soil
   * beside it. A road at a height of its own invention is arbitrarily cut
   * in everywhere, and then so are its rock faces.
   *
   * A bridge has no cut. It stands in the air over a channel, and giving
   * its cone a face would wall in the ravine underneath it. */
  const cutClimb = (s: TrackSample): number => {
    if (s.deck != null) return VERGE_CLIMB;
    const C = R.verge.cut;
    // How far the road's grade runs UNDER the ground it is crossing: what
    // a cutting is, measured where it is.
    const depth = land.heightAt(s.x, s.z) - s.elevation;
    const into = clamp01((depth - C.depth.from) / (C.depth.full - C.depth.from));
    if (into <= 0) return VERGE_CLIMB;
    // R47 — a mountain road is blasted whatever it is surfaced with: the
    // gravel above the pass's seal line was cut out of the same rock as
    // the tarmac below it, and a face battered back to a grader's grade
    // cannot be built into a flank at all.
    const worth = s.surface === "asphalt" || biome.land.massif !== null ? C.sealed : C.loose;
    // R32 — the cover, read out on the FLANKS rather than under the
    // centerline. A cutting is not on the road, it is up the side of it,
    // and those are different ground: the road lies along the valley where
    // the till is deep, and the shoulder it had to force is scoured. Read
    // at the road's own position instead and almost no stage ever gets a
    // cutting, because almost no road runs over bare rock.
    //
    // The THINNER of the two, because the two sides are not symmetric and
    // the cone is: one side of a road is nearly always the high one, that
    // is the side with something to cut, and steep ground is the ground
    // with no cover left on it. The low side has nothing standing on it for
    // a grade to bind.
    const cos = Math.cos(s.heading);
    const sin = Math.sin(s.heading);
    const soil = Math.min(
      land.geology.soilAt(s.x + BENCH * cos, s.z - BENCH * sin),
      land.geology.soilAt(s.x - BENCH * cos, s.z + BENCH * sin),
    );
    const rock = 1 - clamp01(soil / C.soil);
    const face = knobScale(track.knobs.steepness, C.face);
    return VERGE_CLIMB + (face - VERGE_CLIMB) * into * worth * rock;
  };

  const indexSamples = (from: number, to: number): void => {
    for (let i = from; i < to; i++) {
      const s = samples[i];
      const key = cellKey(Math.floor(s.x / GRID), Math.floor(s.z / GRID));
      let cell = grid.get(key);
      if (!cell) grid.set(key, (cell = emptyCell()));
      const top = ceilingOf(s);
      // The road's own grade here, from its neighbours: one sample step
      // either side, which is the finest the compiled centerline holds.
      const back = samples[i > 0 ? i - 1 : i];
      const fwd = samples[i + 1 < samples.length ? i + 1 : i];
      const run = fwd.s - back.s;
      const slope = run > 1e-6 ? (fwd.elevation - back.elevation) / run : 0;
      // Forward is (sin h, cos h) and the lateral axis (cos h, -sin h), so
      // the surface `elevation + slope * along - bank * lateral` has this
      // gradient. One vector, and the query is a dot product.
      const sinH = Math.sin(s.heading);
      const cosH = Math.cos(s.heading);
      const bank = s.bank ?? 0;
      const px = slope * sinH - bank * cosH;
      const pz = slope * cosH + bank * sinH;
      const floor = top - Math.hypot(px, pz) * BENCH;
      cell.index.push(i);
      cell.x.push(s.x);
      cell.z.push(s.z);
      cell.top.push(top);
      cell.px.push(px);
      cell.pz.push(pz);
      cell.fx.push(sinH);
      cell.fz.push(cosH);
      cell.slope.push(slope);
      cell.bank.push(bank);
      cell.floor.push(floor);
      cell.climb.push(cutClimb(s));
      // R47 — a sample within a bench of a bore's mouth gates its cone at
      // the mouth. Searched both ways along the road, nearest mouth wins.
      let gx = 0;
      let gz = 0;
      let mx = 0;
      let mz = 0;
      if (!s.tunnel) {
        const reach = Math.ceil((BENCH + GROUND_CELL) / track.step);
        for (let k = 1; k <= reach; k++) {
          const ahead = samples[i + k];
          const behind = samples[i - k];
          const mouth = ahead?.tunnel ? ahead : behind?.tunnel ? behind : null;
          if (!mouth) continue;
          const dx = mouth.x - s.x;
          const dz = mouth.z - s.z;
          const d = Math.hypot(dx, dz) || 1;
          gx = dx / d;
          gz = dz / d;
          mx = mouth.x;
          mz = mouth.z;
          break;
        }
      }
      cell.gx.push(gx);
      cell.gz.push(gz);
      cell.mx.push(mx);
      cell.mz.push(mz);
      if (s.x < cell.minX) cell.minX = s.x;
      if (s.x > cell.maxX) cell.maxX = s.x;
      if (s.z < cell.minZ) cell.minZ = s.z;
      if (s.z > cell.maxZ) cell.maxZ = s.z;
      if (floor < cell.minFloor) cell.minFloor = floor;
      if (i < cell.minIndex) cell.minIndex = i;
      if (i > cell.maxIndex) cell.maxIndex = i;
    }
    nearCx = NaN;
  };

  // The neighbourhood a query last looked at. Everything that asks where the
  // road is asks about points a few meters apart — the four lattice corners
  // under a wheel, the six probes a ground reading takes around itself, the
  // candidate props in a cell — and at 48 m to a cell those keep landing in
  // the same 7x7 block. Holding that block's non-empty buckets turns a
  // repeat query from forty-nine map lookups into a walk of the two or three
  // that actually hold road. Invalidated whenever the index changes shape.
  //
  // Held in RING ORDER, nearest ring first, and that ordering is what makes
  // the rejection below work: the block reaches 140 m and the road within a
  // few metres is what sets the ceiling, so walking the middle first arrives
  // at the outer rings with a bound low enough to throw them away whole.
  let nearCx = NaN;
  let nearCz = NaN;
  const nearCells: Cell[] = [];
  const BLOCK = blockOffsets(3);

  /** Squared distance from a point to a cell's SAMPLE box — zero inside it.
   * The rejection bound: nothing in the cell is nearer than this, and
   * nothing in it can hold a cone lower than `minFloor` lifted by the climb
   * over that distance. */
  const boxDistance2 = (cell: Cell, x: number, z: number): number => {
    const dx = x < cell.minX ? cell.minX - x : x > cell.maxX ? x - cell.maxX : 0;
    const dz = z < cell.minZ ? cell.minZ - z : z > cell.maxZ ? z - cell.maxZ : 0;
    return dx * dx + dz * dz;
  };

  /** The LOWEST ceiling any sample in `cell` could impose on a point that
   * far from its box. Inside the bench a sample's plane cannot fall below
   * its own `floor`; past it the cone lifts that by the verge grade, which
   * at a hundred metres is forty-odd metres of clearance and is why almost
   * every outer-ring cell is thrown away without being read.
   *
   * `VERGE_CLIMB` and not the sample's own R34 grade on purpose: this is a
   * LOWER bound on what the cell could impose, and a cut only ever opens
   * the cone FASTER. Reading a cell's steepest grade here would reject
   * cells that still had something to say. */
  const cellFloor = (cell: Cell, d2: number): number =>
    d2 <= BENCH2 ? cell.minFloor : cell.minFloor + (Math.sqrt(d2) - BENCH) * VERGE_CLIMB;

  /** WHERE THE ROAD IS, and nothing about how high the ground beside it may
   * stand. Every caller but one wants only this. */
  type RoadNear = { d: number; index: number; lateral: number };

  type Near = RoadNear & {
    /** R31 — the highest the ground may stand here for this road's sake:
     * the lowest nearby corridor's own underside, opening upward at
     * `verge.climb` once past the bench. Infinity where no road reaches.
     * FINAL only over the cones outside their fade: the ones letting go are
     * left in `fadeCone` for `fadeCeiling` to finish once the ground they
     * rise toward is known. */
    ceiling: number;
    /** ...and the same cone over the road this point is BESIDE alone. A cone
     * may cut the country between two arms of a stage; it may not cut the
     * ground out from under one of them, and this is the floor that says so
     * — see `rawHeight`. */
    own: number;
    /** R34 — the grade `own` was opened at, so `rawHeight` can take exactly
     * that rise back off again. Reading `verge.climb` there instead leaves
     * the difference standing as a lip right at the corridor's lip, which
     * on a blasted cutting is metres of it. */
    ownClimb: number;
    /** THE OTHER ARMS: of every sample of a different stretch of the stage
     * — more than `ARM_WINDOW` samples of arc from the nearest — the one
     * whose FILL stands highest here (`other`, run out from its shelf at
     * the verge grade) and the one whose CUT holds the country lowest
     * (`deep`, its bench climbing back at the same grade), each with its
     * distance, or -1 where the corridor's blend reach holds only the one
     * arm. `shapeAt` carries that fill and that cut across the line where
     * this arm becomes nearer: the country between two arms at two heights
     * belongs to the higher one's embankment until that has come down to
     * the ground, and to the lower one's bench until that has climbed
     * back, not to whichever happens to be closer. Picked by what they
     * STAND at rather than by distance, because the nearest sample outside
     * the window is as often the same road fifty metres further along —
     * whose fill and cut are this road's own — as it is another arm, and
     * the real arm behind it was then hidden (seed 11). */
    other: number;
    otherD: number;
    deep: number;
    deepD: number;
  };
  /** How far apart along the stage two samples have to be before they are
   * two ARMS rather than one road, in samples: fifty metres of arc. Short
   * enough that a hairpin's two legs count — a hairpin CLIMBING ten metres
   * between its legs is two roads at two heights, and the lower leg's
   * ground took a ten metre step where the upper leg's fill was dropped —
   * and long enough that the next few samples of the same straight never
   * do (their fill line is this road's own, further off, and lower). */
  const ARM_WINDOW = 25;

  /** Pick up the non-empty cells of the block around `(cx, cz)` into
   * `nearCells`, if the last query was not already standing in it. */
  const block = (cx: number, cz: number): void => {
    if (cx === nearCx && cz === nearCz) return;
    nearCx = cx;
    nearCz = cz;
    nearCells.length = 0;
    for (let i = 0; i < BLOCK.length; i += 2) {
      const cell = grid.get(cellKey(cx + BLOCK[i], cz + BLOCK[i + 1]));
      if (cell) nearCells.push(cell);
    }
  };

  /** The stage's END APRONS (R24): the dirt extrapolated straight past each
   * end sample, which is road the terrain shelves like road. A point past
   * an end is as far from the road as it is from the apron's SPINE — the
   * end sample's line, out to `APRON` — and the sample it belongs to is
   * that end sample. Asked on EVERY query, not only when the end sample
   * happens to be the nearest: past a curved end an earlier sample of the
   * route can be nearer than the end one, and a distance that switched
   * from the spine's to that sample's — sixty metres, across one lattice
   * cell — took the corridor's whole cross-section with it, a wall beside
   * the apron at either end of the stage. Writes the nearer end into
   * `apron` and says whether there was one. Both searches end here. */
  const apron = { index: -1, d: 0, lateral: 0 };
  // The two ends are not the same length: the run-up is as long as the grid
  // standing on it (`Track.startApron`), the run-off is the rule book's.
  const reach = [track.startApron, APRON];
  const nearerApron = (x: number, z: number, d: number): boolean => {
    apron.index = -1;
    for (let end = 0; end < 2; end++) {
      const i = end === 0 ? firstIndexed : samples.length - 1;
      const s = samples[i];
      const sinH = Math.sin(s.heading);
      const cosH = Math.cos(s.heading);
      const lon = (x - s.x) * sinH + (z - s.z) * cosH;
      const out = end === 0 ? -lon : lon;
      if (out <= 0) continue;
      const lateral = (x - s.x) * cosH - (z - s.z) * sinH;
      const spine = Math.hypot(lateral, Math.max(0, out - reach[end]));
      if (spine >= d) continue;
      d = spine;
      apron.index = i;
      apron.d = spine;
      apron.lateral = lateral;
    }
    return apron.index >= 0;
  };

  /** The nearest road sample and nothing else — no verge cone, and so no
   * reason to read a candidate the box test has already put further off than
   * the answer in hand.
   *
   * That is the whole point of it being its own search. The cone is a MIN
   * over every corridor in reach, so `nearestSample` has to keep reading
   * cells it can never win the distance with; the corridor surface, the
   * road-clearance field and the prop placement want none of that, and they
   * are between them most of the queries the field ever answers. */
  const nearestRoad = (x: number, z: number): RoadNear | null => {
    block(Math.floor(x / GRID), Math.floor(z / GRID));
    let best = -1;
    let bestD2 = Infinity;
    for (let c = 0; c < nearCells.length; c++) {
      const cell = nearCells[c];
      const bx = x < cell.minX ? cell.minX - x : x > cell.maxX ? x - cell.maxX : 0;
      const bz = z < cell.minZ ? cell.minZ - z : z > cell.maxZ ? z - cell.maxZ : 0;
      if (bx * bx + bz * bz >= bestD2) continue;
      const cellX = cell.x;
      const cellZ = cell.z;
      for (let k = 0; k < cellX.length; k++) {
        const ddx = x - cellX[k];
        const ddz = z - cellZ[k];
        const d2 = ddx * ddx + ddz * ddz;
        if (d2 >= bestD2) continue;
        bestD2 = d2;
        best = cell.index[k];
      }
    }
    // R24 — the END APRONS reach further than the block does. A point on
    // an apron's spine, `CORRIDOR_RANGE` out along it, is that plus the
    // apron's own length from the end sample, and whether the 7x7 block
    // holds that sample is a matter of where it sits in its cell. So a
    // point the block holds no road for is asked of the aprons before it
    // is called open country — without which the run-out past every
    // finish ended in a wall somewhere between 144 and 192 m out, the
    // country standing up the whole of what the fill still had to let go.
    if (best < 0) {
      if (!nearerApron(x, z, CORRIDOR_RANGE)) return null;
      return { d: apron.d, index: apron.index, lateral: apron.lateral };
    }
    const d = Math.sqrt(bestD2);
    if (nearerApron(x, z, d)) return { d: apron.d, index: apron.index, lateral: apron.lateral };
    const s = samples[best];
    const lateral = (x - s.x) * Math.cos(s.heading) - (z - s.z) * Math.sin(s.heading);
    return { d, index: best, lateral };
  };

  const nearestSample = (x: number, z: number): Near | null => {
    block(Math.floor(x / GRID), Math.floor(z / GRID));
    let best = -1;
    let bestD2 = Infinity;
    resetFade();
    // R31 — the verge cone, taken over every sample in reach rather than
    // over the nearest one alone. At a hairpin the two arms are a road's
    // width apart and it is the LOWER one that says how high the ground
    // between them may stand; answering off whichever happened to be
    // nearer leaves the other arm walled in.
    let ceiling = Infinity;
    // The winning sample's own cell and slot, so its own cone can be taken
    // after the walk: the loop skips the arithmetic for most candidates on
    // purpose, and the nearest one is often among them.
    let bestCell: Cell | null = null;
    let bestSlot = -1;
    for (let c = 0; c < nearCells.length; c++) {
      const cell = nearCells[c];
      // Two questions a cell can answer, and a cell that can answer NEITHER
      // is skipped whole. It holds no nearer sample if its box is already
      // further off than the best, and it can lower no ceiling if the
      // lowest cone it could possibly hold is already above the one in
      // hand. Both bounds are exact, so this changes only the work.
      const boxD2 = boxDistance2(cell, x, z);
      if (boxD2 >= bestD2 && (boxD2 >= CONE_REACH2 || cellFloor(cell, boxD2) >= ceiling)) continue;
      const cellX = cell.x;
      const cellZ = cell.z;
      for (let k = 0; k < cellX.length; k++) {
        const ddx = x - cellX[k];
        const ddz = z - cellZ[k];
        const d2 = ddx * ddx + ddz * ddz;
        if (d2 < bestD2) {
          bestD2 = d2;
          best = cell.index[k];
          bestCell = cell;
          bestSlot = k;
        }
        // Nothing this sample could say is lower than what has already been
        // said — which is most of them, and what keeps the square root and
        // the dot product off the hot loop.
        if (cell.floor[k] >= ceiling) continue;
        // R47 — a portal sample's cone stops at the mouth.
        if (
          (cell.gx[k] !== 0 || cell.gz[k] !== 0) &&
          (x - cell.mx[k]) * cell.gx[k] + (z - cell.mz[k]) * cell.gz[k] > 0
        ) {
          continue;
        }
        if (d2 <= BENCH2) {
          const flat = cell.top[k] + ddx * cell.px[k] + ddz * cell.pz[k];
          if (flat < ceiling) ceiling = flat;
        } else if (d2 < CONE_REACH2) {
          // Past the bench the plane is held at the bench's own rim and the
          // cone opens above it. Holding it matters: a road on a 1-in-2 dip
          // extrapolated over the query's whole reach would carve a trench
          // a hundred metres out of a hillside it never touches.
          const d = Math.sqrt(d2);
          const hold = BENCH / d;
          const rise =
            cell.top[k] + (ddx * cell.px[k] + ddz * cell.pz[k]) * hold + coneRise(d, cell.climb[k]);
          if (rise >= ceiling) continue;
          // In the fade the cone is not final — it rises toward ground the
          // walk has not built yet — so it is kept, not taken. Only ever
          // below the running min, which is a bound on it either way.
          if (d2 >= FADE_FROM2) keepFade(rise, fadeWeight(d, CORRIDOR_RANGE), cell.climb[k]);
          else ceiling = rise;
        }
      }
    }
    // R24 — and the aprons, where the block holds no sample at all: see
    // `nearestRoad`. The end sample stands in for the winner; its own cone
    // is opened at its own distance, as it is when the spine is nearer.
    if (best < 0) {
      if (!nearerApron(x, z, CORRIDOR_RANGE)) return null;
      best = apron.index;
      bestD2 = apron.d * apron.d;
    }
    /** The distance to the nearest SAMPLE, which is what its own cone is
     * opened at whether or not the apron's spine stands nearer. */
    const rawD = Math.sqrt(bestD2);
    let d = rawD;
    const s = samples[best];
    let lateral = (x - s.x) * Math.cos(s.heading) - (z - s.z) * Math.sin(s.heading);
    let index = best;
    if (nearerApron(x, z, d)) {
      index = apron.index;
      d = apron.d;
      lateral = apron.lateral;
    }
    // The other arm, where there is one in reach. Only asked once the point
    // is past the nearest arm's own shelf — inside it that arm owns the
    // ground outright — and rejected cell by cell on the box AND on the arc
    // the cell holds, so a stage with one arm here costs a few comparisons.
    // The end aprons are arms too, measured from their spine: a stage that
    // finishes beside its own start has the start's apron cut into the
    // hillside thirty metres from the finish stretch, and dropping that
    // cut where the finish becomes nearer was a step across the line.
    let other = -1;
    let otherD2 = CONE_REACH2;
    let otherStand = -Infinity;
    let deep = -1;
    let deepD2 = CONE_REACH2;
    let deepHold = Infinity;
    if (bestD2 > SHELF_END2) {
      const lo = index - ARM_WINDOW;
      const hi = index + ARM_WINDOW;
      /** Take a sample of another arm as the fill and the cut candidate,
       * by what each stands at here. A fill stands no higher than its
       * road and a cut holds no lower, so the road's own height throws a
       * sample out before its distance is taken. */
      const consider = (at: number, d2: number): void => {
        const e = samples[at].elevation;
        if (e > otherStand) {
          const stand = e - Math.max(0, Math.sqrt(d2) - shelfEnd) * VERGE_CLIMB;
          if (stand > otherStand) {
            otherStand = stand;
            other = at;
            otherD2 = d2;
          }
        }
        if (e < deepHold) {
          const hold = e + Math.max(0, Math.sqrt(d2) - shelfEnd) * VERGE_CLIMB;
          if (hold < deepHold) {
            deepHold = hold;
            deep = at;
            deepD2 = d2;
          }
        }
      };
      for (let c = 0; c < nearCells.length; c++) {
        const cell = nearCells[c];
        if (cell.minIndex >= lo && cell.maxIndex <= hi) continue;
        if (boxDistance2(cell, x, z) >= CONE_REACH2) continue;
        const cellX = cell.x;
        const cellZ = cell.z;
        for (let k = 0; k < cellX.length; k++) {
          const at = cell.index[k];
          if (at >= lo && at <= hi) continue;
          const ddx = x - cellX[k];
          const ddz = z - cellZ[k];
          const d2 = ddx * ddx + ddz * ddz;
          if (d2 >= CONE_REACH2) continue;
          consider(at, d2);
        }
      }
      if (nearerApron(x, z, CORRIDOR_RANGE) && (apron.index < lo || apron.index > hi)) {
        consider(apron.index, apron.d * apron.d);
      }
    }
    // The NEARBY cone: the same min, over the road this point is actually
    // beside rather than over every corridor in reach. `rawHeight` uses it
    // as a floor, so that a road sixty metres off and twenty metres down
    // cannot take the hillside out from under this one.
    //
    // A min and not the nearest SAMPLE's plane alone, because the tiles
    // have to stay under EVERY strip of ribbon drawn over them: inside a
    // tight bend the strips fan and cross, and at a jump's lip the ribbon
    // drops two metres in one sample — a lattice corner held to the lip's
    // own plane is a tile through the landing's mat two cells on. What
    // keeps it under is the neighbours' planes carrying the road's GRADE
    // along to this point.
    //
    // ...carried in ROAD coordinates, never in the neighbour's own frame.
    // A sample's plane models the road where its strip is — within a
    // sample step along it. Read at a point eight or fifteen metres along
    // it stands a metre under the corridor's own verge at the outer lip,
    // three ways at once: its bank is the bank where IT is, and the bank
    // winds on and off over a corner's runoff; its tilt is applied to the
    // point's lateral in its own frame, which the bend has foreshortened;
    // and its grade is run out along a chord that, on the outside of a
    // bend, is longer than the arc. A min that took those planes dug a
    // trench under the ribbon's outer band and left a ridge just past the
    // lip where the fill fell out of it — on every banked corner of every
    // stage, always at the lip's own offset (`rollers.bump`,
    // `rollers.edge`). So a neighbour of the same stretch that does not
    // cover the point is read as the road's underside AT THE NEAREST
    // SAMPLE'S STATION — its top run along the arc at its grade — under
    // the cross-section tilt of the road here (this bank, this lateral),
    // faded from its own exact plane over the step past its strip so
    // nothing steps where a strip stops covering. Another arm's sample is
    // read as it stands, as before: road coordinates mean nothing across
    // the country between two arms.
    //
    // Only computed where a distant cone is actually cutting below the
    // nearest road's own plane, which is rare: everywhere else the answer is
    // the ceiling itself and the second walk never happens.
    let own = Infinity;
    let ownClimb = VERGE_CLIMB;
    if (bestCell && bestSlot >= 0) {
      const ddx = x - bestCell.x[bestSlot];
      const ddz = z - bestCell.z[bestSlot];
      const tilt = ddx * bestCell.px[bestSlot] + ddz * bestCell.pz[bestSlot];
      ownClimb = bestCell.climb[bestSlot];
      own =
        bestD2 <= BENCH2
          ? bestCell.top[bestSlot] + tilt
          : bestCell.top[bestSlot] +
            (tilt * BENCH) / rawD +
            coneRise(rawD, bestCell.climb[bestSlot]);
      if (ceiling < own) {
        const bankHere = bestCell.bank[bestSlot];
        const sNear = samples[best].s;
        const latHere = ddx * bestCell.fz[bestSlot] - ddz * bestCell.fx[bestSlot];
        const window = rawD + LOCAL_CONE;
        const window2 = window * window;
        for (let c = 0; c < nearCells.length; c++) {
          const cell = nearCells[c];
          // The same two rejections as the walk above, against this walk's
          // own bounds: a cell outside the window holds nothing to consider,
          // and one whose lowest possible cone is already above `own` cannot
          // lower it.
          const boxD2 = boxDistance2(cell, x, z);
          if (boxD2 > window2 || cellFloor(cell, boxD2) >= own) continue;
          for (let k = 0; k < cell.x.length; k++) {
            const ddx2 = x - cell.x[k];
            const ddz2 = z - cell.z[k];
            const d2 = ddx2 * ddx2 + ddz2 * ddz2;
            if (d2 > window2) continue;
            let t = ddx2 * cell.px[k] + ddz2 * cell.pz[k];
            if (Math.abs(cell.index[k] - best) <= ARM_WINDOW) {
              const along = ddx2 * cell.fx[k] + ddz2 * cell.fz[k];
              const strip = clamp01(2 - Math.abs(along) / track.step);
              if (strip < 1) {
                const road =
                  cell.slope[k] * (sNear - samples[cell.index[k]].s) - bankHere * latHere;
                t += (road - t) * (1 - strip);
              }
            }
            let here: number;
            if (d2 <= BENCH2) here = cell.top[k] + t;
            else {
              const dk = Math.sqrt(d2);
              here = cell.top[k] + (t * BENCH) / dk + coneRise(dk, cell.climb[k]);
            }
            if (here < own) {
              own = here;
              ownClimb = cell.climb[k];
            }
          }
        }
      }
    }
    return {
      d,
      index,
      lateral,
      ceiling,
      own,
      ownClimb,
      other,
      otherD: Math.sqrt(otherD2),
      deep,
      deepD: Math.sqrt(deepD2),
    };
  };
  return {
    GRID,
    BLOCK,
    apron,
    cutClimb,
    nearestRoad,
    nearestSample,
    /** True when road has arrived that the grid has not filed yet. */
    pending: (): boolean => samples.length > indexed,
    /** File everything that has arrived since the last call. */
    indexPending: (): void => {
      indexSamples(indexed, samples.length);
      indexed = samples.length;
    },
    /** The arc position of the oldest sample still in the window. */
    windowFrom: (): number | undefined => samples[firstIndexed]?.s,
    /** Drop road behind `floorS` and rebuild the grid around what is left. */
    reanchor: (floorS: number): void => {
      while (firstIndexed < samples.length - 1 && samples[firstIndexed].s < floorS) firstIndexed++;
      grid = new Map();
      nearCx = NaN;
      indexSamples(firstIndexed, samples.length);
    },
  };
}
