// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The landscape the road runs through — and, since the world opened up,
// the ground the car actually rides the moment it leaves the road. One
// seeded heightfield serves both the physics and the renderer: a flat
// verge shelf at road grade, per-side embankments rising into hillsides or
// falling toward valleys, a rolling far field with ridged mountain chains
// and broad sea basins sunk under the water table, and stream valleys
// carved through wherever a ford crosses the road. Everything SOLID that
// stands on that ground — the forest's trunks, the boulders, the fallen
// timber, the quilt of regions and groves that decides where each belongs
// — is props.ts's, hung off this field and re-exported here so callers ask
// one object about the landscape. Everything is deterministic in the track
// seed; heights are smooth analytic noise, so the ground under the car
// never stairsteps.

import { createRng } from "../lib/prng.ts";
import { blockOffsets, cellKey } from "../lib/math.ts";
import { smooth, valueNoise } from "../lib/noise.ts";
import type { Surface, Track, TrackSample } from "./compile.ts";
import { createGuardField, type CornerGuard, type GuardField } from "./guards.ts";
import { createStandField, type Stand, type StandField } from "./stands.ts";
import { BANK, traceRivers, type River, type RiverAnchor, type RoadClear } from "./river.ts";
import {
  corridorOffset,
  handoverAt,
  junctionFlat,
  junctionPlatformY,
  ROAD_CROSS,
  vergeOffset,
  type RoadShape,
} from "./road.ts";
import { createLandField, LAKE_Y } from "./land.ts";
import type { GeologyField } from "./geology.ts";
import { STAGE_RULES as R, knobScale } from "./rules.ts";
import { createSpurIndex, type SpurIndex } from "./spurs.ts";
import { createPropField } from "./props.ts";
import { bridgeParapets, type WildObstacle } from "./solids.ts";

export { LAKE_Y } from "./land.ts";
export {
  GROVES,
  GROVE_SCALE,
  REGIONS,
  REGION_SCALE,
  type GroveCommunity,
  type Region,
} from "./props.ts";
/** Edge length of the ground lattice the physics rides and the renderer
 * triangulates its ground tiles on, m. The two must agree — see groundAt. */
export const GROUND_CELL = 14;
/** Plain dirt road extrapolated straight past each stage end, m — the
 * rally start's run-up before the gate, and run-off past the flying
 * finish. The terrain keeps its shelf flat under the same corridor so the
 * apron never floats or drowns, the physics rides it, and R26 keeps every
 * other road off it. One number, stated in the rule book. */
export const APRON = R.startZone.apron;

function clamp01(t: number): number {
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

// ── Streams ───────────────────────────────────────────────────────────────

export type Stream = {
  /** Water surface centerline, world space, source first — each point
   * carrying the half-width of the water there, because a river is not the
   * same size along its length (R18). */
  points: { x: number; z: number; y: number; w: number }[];
  /** Widest half-width in this piece, meters — what the bounding box is
   * padded by and what a cheap rejection tests against. */
  halfWidth: number;
  /** How far below its surface the bed is cut, m — a ford's is ankle-deep
   * and a bridged river's is over the roof (R13). */
  depth: number;
  /** True when the road crosses this water on a DECK rather than through
   * it: the renderer spans it, and the water runs well below the road. */
  bridged: boolean;
  /** Arc position of the crossing this piece belongs to (chunk
   * association / pruning). */
  centerS: number;
  /** Loose bounding box (bed + banks), for cheap carve rejection. */
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
};

/** How far below the water surface a ford's bed is carved, meters. */
const BED_DEPTH = 0.45;
/** How far a surface may stand over water and still be IN it, m — a ford's
 * crown sheds the water it wades, and a road's camber is not a bank. */
const WADE_LIP = 0.2;
/** Points per sliced piece of river — enough that a bounding box is worth
 * testing, few enough that a test which passes has little left to walk. */
const RIVER_CHUNK = 8;

/** Cut one traced river into the pieces every consumer actually queries:
 * a short polyline with its own bounding box. Consecutive pieces overlap
 * by a point, so the water is continuous across the seam. */
function sliceRiver(river: River): Stream[] {
  const out: Stream[] = [];
  const points = river.points;
  for (let i = 0; i + 1 < points.length; i += RIVER_CHUNK - 1) {
    const slice = points.slice(i, i + RIVER_CHUNK);
    if (slice.length < 2) break;
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    let halfWidth = 0;
    let bestAnchor = river.anchors[0];
    let bestD = Infinity;
    for (const p of slice) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.z < minZ) minZ = p.z;
      if (p.z > maxZ) maxZ = p.z;
      if (p.halfWidth > halfWidth) halfWidth = p.halfWidth;
      for (const anchor of river.anchors) {
        const d = Math.hypot(anchor.x - p.x, anchor.z - p.z);
        if (d < bestD) {
          bestD = d;
          bestAnchor = anchor;
        }
      }
    }
    const pad = halfWidth + BANK;
    out.push({
      points: slice.map((p) => ({ x: p.x, z: p.z, y: p.y, w: p.halfWidth })),
      halfWidth,
      depth: river.depth,
      bridged: river.bridged,
      centerS: bestAnchor.s,
      minX: minX - pad,
      maxX: maxX + pad,
      minZ: minZ - pad,
      maxZ: maxZ + pad,
    });
  }
  return out;
}

/** Collect the road's water crossings in `samples[fromIndex..)` as river
 * anchors (R18): where the road meets water, at what level, how wide, and
 * whether it wades or spans. The WATER itself is then traced through them
 * — the road says where it crosses, the landscape says where the river
 * runs. */
export function collectAnchors(track: Track, fromIndex: number): RiverAnchor[] {
  const samples = track.samples;
  const anchors: RiverAnchor[] = [];
  const wet = (s: TrackSample): boolean => s.surface === "water" || s.deck !== null;
  let i = Math.max(0, fromIndex);
  // Never split a run: back up to its start if we landed inside one.
  while (i > 0 && wet(samples[i - 1])) i--;
  for (; i < samples.length; i++) {
    if (!wet(samples[i])) continue;
    let j = i;
    while (j < samples.length && wet(samples[j])) j++;
    const mid = samples[Math.floor((i + j - 1) / 2)];
    const runLength = samples[j - 1].s - samples[i].s + track.step;
    const deck = mid.deck;
    anchors.push({
      x: mid.x,
      z: mid.z,
      // A ford's water lies at the road; a deck stands its clearance above
      // it, and the channel below is cut deep enough to drown a car.
      waterY: mid.elevation - (deck ? R.bridge.clearance[deck] : 0),
      halfWidth: deck
        ? Math.max(6, runLength / 2 - 1.5)
        : Math.min(8, Math.max(3.5, runLength / 2.6)),
      depth: deck ? R.bridge.depth : BED_DEPTH,
      bridged: deck !== null,
      s: mid.s,
    });
    i = j;
  }
  return anchors;
}

/** Trace the watercourses a batch of crossings implies and cut them into
 * queryable pieces. The field itself keeps the traced courses as well as
 * the pieces, so it does the two steps separately; this is the one-call
 * version for tooling that only wants water it can query. */
export function computeStreams(
  seed: number,
  anchors: RiverAnchor[],
  farHeight: (x: number, z: number) => number,
  roadClear?: RoadClear,
): Stream[] {
  return traceRivers(seed, anchors, farHeight, LAKE_Y, roadClear).flatMap(sliceRiver);
}

/** Distance from a point to the water's centerline, plus the surface
 * height and the half-width THERE — a river narrows and widens along its
 * length, so every query has to answer with the local size. */
function nearestOnStream(
  s: Stream,
  x: number,
  z: number,
): { d: number; waterY: number; width: number } {
  let bestD2 = Infinity;
  let waterY = 0;
  let width = s.halfWidth;
  for (let i = 0; i < s.points.length - 1; i++) {
    const a = s.points[i];
    const b = s.points[i + 1];
    const abx = b.x - a.x;
    const abz = b.z - a.z;
    const t = Math.max(
      0,
      Math.min(1, ((x - a.x) * abx + (z - a.z) * abz) / (abx * abx + abz * abz)),
    );
    const px = a.x + abx * t;
    const pz = a.z + abz * t;
    const d2 = (x - px) * (x - px) + (z - pz) * (z - pz);
    if (d2 < bestD2) {
      bestD2 = d2;
      waterY = a.y + (b.y - a.y) * t;
      width = a.w + (b.w - a.w) * t;
    }
  }
  return { d: Math.sqrt(bestD2), waterY, width };
}

/** Carve the stream valley into a landscape height: inside the water line
 * the ground drops to the bed; across the bank it blends back to `base`.
 * Only ever lowers — a stream never builds a levee. */
export function carveGround(streams: Stream[], x: number, z: number, base: number): number {
  let ground = base;
  for (const s of streams) {
    if (x < s.minX || x > s.maxX || z < s.minZ || z > s.maxZ) continue;
    const { d, waterY, width } = nearestOnStream(s, x, z);
    if (d > width + BANK) continue;
    const bed = waterY - s.depth;
    const target = bed + smooth(clamp01((d - width) / BANK)) * Math.max(0, base - bed);
    if (target < ground) ground = target;
  }
  return ground;
}

/** True when a point stands in a stream's bed or on its banks — nothing
 * should grow there. */
export function inStream(streams: Stream[], x: number, z: number, margin: number): boolean {
  for (const s of streams) {
    if (x < s.minX - margin || x > s.maxX + margin || z < s.minZ - margin || z > s.maxZ + margin) {
      continue;
    }
    const near = nearestOnStream(s, x, z);
    if (near.d < near.width + BANK + margin) return true;
  }
  return false;
}

/** Water surface height of a stream at a point, or null when the point is
 * not over stream water. */
function streamWaterAt(streams: Stream[], x: number, z: number): number | null {
  let best: number | null = null;
  let bestD = Infinity;
  for (const s of streams) {
    if (x < s.minX || x > s.maxX || z < s.minZ || z > s.maxZ) continue;
    const { d, waterY, width } = nearestOnStream(s, x, z);
    // The NEAREST water wins, not the first found: two reaches of the same
    // course (or two courses) can both cover a point, and answering with
    // whichever happened to be indexed first puts the surface at the wrong
    // height — under a bridge, that is metres of clearance out.
    if (d < width && d < bestD) {
      bestD = d;
      best = waterY;
    }
  }
  return best;
}

// ── The field ─────────────────────────────────────────────────────────────

export type TerrainField = {
  /** Final ground height at a world position — corridor shelf, hills,
   * mountains, sea floor, stream beds and all. The analytic field scenery
   * stands on and the renderer samples its ground meshes from. */
  heightAt: (x: number, z: number) => number;
  /** The ground the car RIDES: `heightAt` sampled on the GROUND_CELL
   * lattice and interpolated across the same triangles the renderer draws,
   * so the physics ground IS the drawn ground. The analytic field between
   * lattice points disagrees with the mesh by up to a meter on curved
   * slopes — riding it buries the car in every concave hillside. */
  groundAt: (x: number, z: number) => number;
  /** The GROUND TILES on their own — `heightAt` at the GROUND_CELL corners,
   * interpolated across the same two triangles the renderer draws, with no
   * road ribbon laid over it. This is the surface the road's outer band
   * hands over TO (R16's `handoverAt`), so the road mesh reads it to put
   * its outermost vertices exactly where the ground beside them is; the
   * analysis reads it to measure whatever is left at the seam. */
  latticeAt: (x: number, z: number) => number;
  /** The landscape far from any road (mountains and sea included) — what
   * streams read to find their downhill side, and tooling can preview. */
  farHeightAt: (x: number, z: number) => number;
  /** R32 — what the ground is MADE of: the rock, the soil on it and the
   * groundwater in it. The road shapes the SURFACE and nothing under it,
   * so this is the bare country's own layering wherever it is asked —
   * which is what everything that plants, paints or judges wants. */
  geology: GeologyField;
  /** Water surface height over this point — lake/sea table or a stream's
   * local level — or null on dry ground. */
  waterAt: (x: number, z: number) => number | null;
  /** Distance to the road centerline, m — Infinity out of corridor range
   * (beyond ~240 m). What placement code asks before planting near road. */
  roadDistanceAt: (x: number, z: number) => number;
  /** R34 — how much the ground here is a FACE THE ROAD WAS CUT THROUGH, 0
   * (open country, or a bank a car could climb) to 1 (blasted rock over the
   * verge). Nothing roots on a cutting, so the prop field reads it off the
   * soil; the analysis reads it to count how much of a stage runs through
   * rock rather than over it. */
  cutAt: (x: number, z: number) => number;
  /** The surface of any road OTHER than the stage at a point: the mat of
   * an abandoned asphalt branch (R17), or null on open ground. The stage's
   * own surface comes from the track samples — this is what tells the
   * physics that a car exploring a spur is on tarmac, not in a field. */
  spurSurfaceAt: (x: number, z: number) => Surface | null;
  /** The stream valleys cut so far (the renderer draws their water). */
  streams: Stream[];
  /** ...and the whole watercourses they were sliced from, source point
   * first (R18). Nothing in the game needs a river end to end — every
   * query is local, which is what the slices are for — but judging one
   * does: whether it climbs, gathers, and arrives anywhere are all
   * questions about the whole course. */
  rivers: River[];
  /** The corner guards placed so far (R14) — the renderer reads them to
   * dress the mounds, the tooling to draw them on a preview. */
  guards: CornerGuard[];
  /** R27 — the spectator stands placed so far, in stage order. The
   * renderer builds the people; the run reads the order to know which
   * crowd the car has just gone past. */
  stands: Stand[];
  /** Solid wild props near a point (within `r` of it), collision-checked
   * by the physics and drawn by the renderer. */
  obstaclesNear: (x: number, z: number, r: number) => WildObstacle[];
  /** The forest's solid trunks near a point (within `r`) — same contract
   * as obstaclesNear, kept separate because trees are far denser and the
   * renderer draws them through the flora system rather than as props. */
  treesNear: (x: number, z: number, r: number) => WildObstacle[];
  /** R13 — the bays of a concrete bridge's PARAPET near a point (within
   * `r`). Its own query rather than part of `obstaclesNear`: these are not
   * wild props scattered on the ground, they are a wall on a road, and the
   * renderer draws them as part of the bridge rather than as scenery. */
  parapetsNear: (x: number, z: number, r: number) => WildObstacle[];
  /** Take a solid OUT of the world: a trunk the car snapped, a rock it
   * knocked flying. The field stops standing it, so nothing collides with
   * it again and nothing draws it — the piece that is left is a loose body
   * the renderer tumbles (`solidBreak`), not scenery either side still
   * agrees on. Felling is part of the run, not part of the seed: a fresh
   * game builds a fresh field with every trunk back up. */
  fell: (ob: WildObstacle) => void;
  /** Which grove community (index into GROVES) owns a patch of ground —
   * the one quilt both the trunk placement above and the renderer's
   * species/undergrowth choices read, so a meadow is open on both sides. */
  groveAt: (x: number, z: number) => number;
  /** ...and which sub-region (index into REGIONS) the patch sits in — the
   * scale above the groves. The renderer paints the ground from it, so a
   * bog is dark underfoot wherever the quilt says bog. */
  regionAt: (x: number, z: number) => number;
  /** Catch the field up with the track: index new samples and cut new
   * stream valleys (endless stages stream road in); prune far behind
   * `carS` so an endless run's memory stays bounded. */
  sync: (carS: number) => void;
};

/** Build the terrain field for a track. Deterministic in the track seed —
 * the engine and the renderer each build one and always agree. */
export function createTerrain(track: Track): TerrainField {
  const seed = (track.seed ^ 0x1b873593) >>> 0;
  const rng = createRng(seed);
  // The bare landscape draws the first of these for itself (land.ts); it
  // is still taken from the stream here so everything after it keeps the
  // seed it has always had.
  rng.int(1, 1 << 30);
  const sideSeed = rng.int(1, 1 << 30);

  // ── Corridor queries: a spatial hash over the road samples ─────────────
  // Rebuilt from the live window as an endless run moves on, so a fresh
  // query never snaps to road the world has already forgotten.
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
    floor: number[];
    /** R34 — the grade this sample's cone opens at past the bench, m per m.
     * `verge.climb` where the ground is till and the road was scraped in;
     * up to `verge.cut.face` where it is rock and the road was blasted
     * through it. Per sample rather than one constant, because it is a
     * property of what the road is and what it is cut through, and both
     * change along a stage. Never BELOW `VERGE_CLIMB`, which is what keeps
     * `cellFloor`'s rejection bound valid. */
    climb: number[];
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
  };
  const emptyCell = (): Cell => ({
    index: [],
    x: [],
    z: [],
    top: [],
    px: [],
    pz: [],
    floor: [],
    climb: [],
    minX: Infinity,
    maxX: -Infinity,
    minZ: Infinity,
    maxZ: -Infinity,
    minFloor: Infinity,
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
    const worth = s.surface === "asphalt" ? C.sealed : C.loose;
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
      cell.floor.push(floor);
      cell.climb.push(cutClimb(s));
      if (s.x < cell.minX) cell.minX = s.x;
      if (s.x > cell.maxX) cell.maxX = s.x;
      if (s.z < cell.minZ) cell.minZ = s.z;
      if (s.z > cell.maxZ) cell.maxZ = s.z;
      if (floor < cell.minFloor) cell.minFloor = floor;
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
     * `verge.climb` once past the bench. Infinity where no road reaches. */
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
  };

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

  /** Past either stage end the distance to the end SAMPLE would swing the
   * shelf away under the road apron, so it is measured from the apron's
   * spine instead while within its reach. Both searches end here. */
  const apronDistance = (
    best: number,
    x: number,
    z: number,
    lateral: number,
    d: number,
  ): number => {
    if (best !== firstIndexed && best !== samples.length - 1) return d;
    const s = samples[best];
    const lon = (x - s.x) * Math.sin(s.heading) + (z - s.z) * Math.cos(s.heading);
    const out = best === firstIndexed ? -lon : lon;
    return out > 0 ? Math.hypot(lateral, Math.max(0, out - APRON)) : d;
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
    if (best < 0) return null;
    const s = samples[best];
    const lateral = (x - s.x) * Math.cos(s.heading) - (z - s.z) * Math.sin(s.heading);
    return {
      d: apronDistance(best, x, z, lateral, Math.sqrt(bestD2)),
      index: best,
      lateral,
    };
  };

  const nearestSample = (x: number, z: number): Near | null => {
    block(Math.floor(x / GRID), Math.floor(z / GRID));
    let best = -1;
    let bestD2 = Infinity;
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
          if (rise < ceiling) ceiling = rise;
        }
      }
    }
    if (best < 0) return null;
    const s = samples[best];
    const lateral = (x - s.x) * Math.cos(s.heading) - (z - s.z) * Math.sin(s.heading);
    const d = Math.sqrt(bestD2);
    // The NEARBY cone: the same min, over the road this point is actually
    // beside rather than over every corridor in reach. `rawHeight` uses it
    // as a floor, so that a road sixty metres off and twenty metres down
    // cannot take the hillside out from under this one.
    //
    // A min and not the nearest SAMPLE's plane alone: samples are 2 m apart
    // and the point at a corner's outer lip is nearest to a neighbour whose
    // plane extrapolates a few centimetres over the verge here. Smoothing
    // that is half of what the full min was doing, and a floor that undid
    // it would put a lip back along the outside of every corner.
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
          : bestCell.top[bestSlot] + (tilt * BENCH) / d + coneRise(d, bestCell.climb[bestSlot]);
      if (ceiling < own) {
        const window = d + LOCAL_CONE;
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
            const t = ddx2 * cell.px[k] + ddz2 * cell.pz[k];
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
      d: apronDistance(best, x, z, lateral, d),
      index: best,
      lateral,
      ceiling,
      own,
      ownClimb,
    };
  };

  // The bare landscape the road was laid across (land.ts) — the same
  // country the branch builder steered by, so nothing here can disagree
  // with where the water is.
  const land = createLandField(track.seed, track.knobs);
  const farField = land.heightAt;

  // Per-side embankment grade along the stage, m per m of distance from the
  // shoulder: positive climbs into a hillside wall, negative drops toward a
  // valley (or the sea the lakes make). Varies slowly with arc position.
  //
  // R34 — the two sides are ONE number read twice, with opposite signs, and
  // that is the whole rule. A road laid across a slope is BENCHED into it:
  // cut on the uphill side, filled on the downhill, because that is the
  // cheapest way to get a level road onto a hillside and it is what every
  // mountain road on earth looks like. Drawing the two sides independently
  // — which is what this did — puts them both uphill about half the time,
  // and at the top of the steepness dial half a stage came out walled in on
  // both sides for four hundred metres at a stretch. That is not a cutting,
  // it is a tunnel with the lid off.
  //
  // A THROUGH-CUT, rock standing up both sides at once, is still built: it
  // is what `tilt` is for, and it happens where the hillside is levelling
  // off and the country either side of the road is high anyway. It comes
  // out short, which is exactly what a through-cut is — you pass through
  // one, you do not drive down it.
  //
  // `steepness` scales the RISING half and only that half: how steep the
  // hillside the road is cut into stands is what the dial was asked about;
  // how far a car that goes over the other edge falls is not.
  const sideLean = knobScale(track.knobs.steepness, R.geology.steep.bank);
  const sideGrade = (s: number, side: number): number => {
    const lean = (valueNoise(s, 0, 210, sideSeed) - 0.5) * 2;
    const tilt = -0.28 + valueNoise(s, 37.1, 330, sideSeed + 3) * 0.55;
    const raw = tilt + side * lean * 0.62;
    return raw > 0 ? raw * sideLean : raw;
  };

  const half = track.width / 2;
  const shelfEnd = half + ROAD_CROSS.reach; // the ribbon's own outer edge
  /** How far from the road the corridor still shapes the ground, m — see
   * rawHeight; inside the sample grid's own search reach on purpose. */
  const CORRIDOR_RANGE = 140;
  /** R14 — the mounds and groves that shut the inside of a sharp corner.
   * Built here, from the corner geometry, because the ground they raise
   * and the trunks they stand are both this field's to report. */
  const guards: GuardField = createGuardField(track);
  const stands: StandField = createStandField(track);

  /** How far under the drawn ribbon the ground TILES are pinned, m. The
   * road mesh draws the whole corridor — mat, shoulder, ditch, lip (R16) —
   * on a 2 m sample spacing the 14 m ground lattice could never hold, so
   * the lattice ducks below all of it and lets the ribbon be the surface
   * anyone sees there. `groundAt` puts the physics back on the ribbon. */
  const TILE_SINK = 0.35;

  /** How far past a branch's own corridor its shelf blends back into the
   * landscape, m — inside the branch index's search reach, or the blend
   * would end at a cell boundary instead of where it means to. */
  const SPUR_BLEND = 30;

  // ── R31: the rideable verge ───────────────────────────────────────────
  // A rally car spends half a stage off the road, and the one thing it must
  // always be able to do is come back. So the landscape does not get the
  // last word next to a road: whatever the country was doing there, the
  // ground is CUT to a cone opening upward off the road's own underside.
  // Inside the BENCH the cone is flat, which is what pins the ground
  // lattice under the tarmac; outside it the ground may climb, but only at
  // a grade the wheels can take.
  /** Radius of the flat bench, m, measured from a road's centerline. */
  const BENCH = Math.max(shelfEnd, R.verge.bench);
  const BENCH2 = BENCH * BENCH;
  const VERGE_CLIMB: number = R.verge.climb;
  /** R34 — how far out a CUT FACE may begin, m from the centerline. The
   * bench is one lattice cell diagonal, sized so every corner of a cell the
   * road crosses is pinned under it; the face has to start a whole cell
   * OUTSIDE that, because a corner just past the bench is still a corner
   * the bilinear ground under the corridor's own lip is interpolated from.
   * Start the face at the bench itself and a fourteen-metre rock wall lifts
   * the outermost vertex of the road mesh with it — R16's hand-over opens
   * back up into the vertical face down the side of the road it exists to
   * close. What it buys, besides being correct, is a car's worth of runoff
   * between the tarmac and the rock. */
  const CUT_FROM = BENCH + GROUND_CELL;

  /** How far a cone opens above its road's own underside at distance `d`,
   * m — R31's runoff out to `CUT_FROM`, then R34's face beyond it. Zero
   * inside the bench. One function, four callers (the ceiling walk, the
   * two `own` walks and the floor that takes the rise back off), because
   * a cone measured one way and undone another is a lip along the road. */
  const coneRise = (d: number, climb: number): number =>
    d <= BENCH
      ? 0
      : (Math.min(d, CUT_FROM) - BENCH) * VERGE_CLIMB + Math.max(0, d - CUT_FROM) * climb;
  /** How far out the cone is still worth asking about, m. By here it stands
   * tens of metres over the road and binds on nothing but a cliff — and
   * where it does not bind, dropping it costs the query nothing. */
  const CONE_REACH2 = CORRIDOR_RANGE * CORRIDOR_RANGE;
  /** How much further than the nearest road a corridor may be and still
   * count as the road this point is BESIDE, m — see `Near.own`. Comfortably
   * over the sample spacing, so a corner's whole neighbourhood is in; well
   * under R23's `roadClear`, so a second road never is. */
  const LOCAL_CONE = 8;

  /** The underside of a road's corridor at one sample: where the OUTER
   * VERGE sits — the lowest line anything drawn there stands on — sunk by
   * the tile clearance. Measured level, because the bank that tilts it is
   * carried by the plane the cone is evaluated on; taking the low side's
   * height as a flat ceiling instead would cut a metre of trench along the
   * high side of every banked corner. A bridge DECK stands over a ravine on
   * purpose and pins nothing. */
  const ceilingOf = (shape: RibbonSample): number =>
    shape.deck != null
      ? Infinity
      : shape.elevation + vergeOffset(ROAD_CROSS.reach, shape.lift, 0) - TILE_SINK;

  const streams: Stream[] = [];
  const rivers: River[] = [];
  const spurs: SpurIndex = createSpurIndex();
  /** How many of `track.spurs` are in the index — an ingest cursor, so it
   * never rewinds when an endless run prunes the branches behind it. */
  let spurCount = 0;

  /** Anything with a road's cross-section: a stage sample or a branch's
   * (the branch has no bridges, so its deck is simply absent). */
  type RibbonSample = RoadShape & { elevation: number };

  /** The corridor's own cross-section at a SIGNED lateral offset from a
   * road's center: the mat's crown and wheel tracks inside the edge, its
   * shoulder and the ground leaning away outside it (road.ts). One function
   * for the stage road and for an abandoned branch — they are the same kind
   * of thing.
   *
   * The offset is signed because the corridor is not symmetric: a banked
   * corner (R19) tilts the whole cross-section by `-bank * lateral`, so the
   * outside of the turn rides metres proud of the inside. Handing this an
   * unsigned DISTANCE banks both verges the same way, and then one side of
   * every corner is drawn a metre away from where the physics rides it —
   * which is a car that sinks into the ground beside the road. */
  const ribbonY = (s: RibbonSample, lateral: number, width: number): number =>
    s.elevation + corridorOffset(s, lateral, width);

  /** Which side of a road a point is on, never 0 — `Math.sign` would
   * collapse a dead-centre point's offset to zero along with its sign. */
  const sideOf = (lateral: number): number => (lateral < 0 ? -1 : 1);

  /** R17 — the junction platforms, as ground: inside one the corridor is a
   * single graded plane on the MAIN road's own slope, whichever road's
   * verge would otherwise have run through it. Returns the plane's height
   * there and how much of it applies (1 in the middle, fading over the
   * platform's rim), or null. Both carriageways were warped onto this same
   * plane when they were compiled, so nothing has to be reconciled here —
   * the ground simply agrees with the roads standing on it. */
  const apronAt = (x: number, z: number): { y: number; weight: number } | null => {
    let best: { y: number; weight: number } | null = null;
    for (const junction of track.junctions) {
      const weight = junctionFlat(junction, x, z);
      if (weight <= 0) continue;
      if (best && best.weight >= weight) continue;
      best = { y: junctionPlatformY(junction, x, z), weight };
    }
    return best;
  };

  /** The landscape before any stream is cut through it. */
  const rawHeight = (x: number, z: number): number => {
    const far = farField(x, z);
    const near = nearestSample(x, z);
    let base: number;
    // Past CORRIDOR_RANGE the road has no say. It is set to where the
    // sample grid's own search actually reaches: a range beyond the search
    // does not extend the road's influence, it just moves the point where
    // the influence stops being found — and a blend that has not finished
    // by then leaves a seam ruled along the search grid, which a shaded
    // relief render shows up as a hairline running across the country.
    if (!near || near.d > CORRIDOR_RANGE) {
      base = far;
    } else {
      const s = samples[near.index];
      const corridorY =
        ribbonY(s, sideOf(near.lateral) * Math.min(near.d, shelfEnd), s.width) - TILE_SINK;
      if (near.d < shelfEnd) {
        base = corridorY;
      } else {
        const grade = sideGrade(s.s, near.lateral >= 0 ? 1 : -1);
        const embankment = s.elevation + (near.d - shelfEnd) * grade;
        const toFar = smooth(clamp01((near.d - shelfEnd) / 110));
        const shaped = embankment * (1 - toFar) + far * toFar;
        const off = smooth(clamp01((near.d - shelfEnd) / 26));
        base = corridorY * (1 - off) + shaped * off;
      }
    }
    // A branch flattens its own shelf through whatever the landscape was
    // doing there — it is a road, and roads are built, not draped. But a
    // branch never reshapes the ground under the road it LEFT: the two run
    // side by side for a hundred meters after a junction, and the stage
    // road owns everything it is nearer to.
    const spur = spurs.spurs.length > 0 ? spurs.nearest(x, z) : null;
    if (spur) {
      const edge = spur.spur.width / 2 + ROAD_CROSS.reach;
      const roadD = near ? near.d : Infinity;
      if (spur.d < edge + SPUR_BLEND && spur.d < roadD) {
        // A branch is never banked, so its cross-section is symmetric and
        // the unsigned distance is the whole story (the index does not carry
        // a signed lateral).
        const shelf = ribbonY(spur.sample, Math.min(spur.d, edge), spur.spur.width) - TILE_SINK;
        const reach = 1 - smooth(clamp01((spur.d - edge) / SPUR_BLEND));
        const mine = smooth(clamp01((roadD - spur.d) / 12));
        const t = reach * mine;
        base = shelf * t + base * (1 - t);
      }
    }
    const apron = apronAt(x, z);
    if (apron) {
      const flat = apron.y - TILE_SINK;
      base = flat * apron.weight + base * (1 - apron.weight);
    }
    // R31 — and then the whole lot is CUT to the verge cone. Last, and
    // over the corner guards too, because it binds on everything above it:
    // the far field's mountains, the embankment's own grade, the blend
    // between them, a branch's shelf where the branch owns this ground, and
    // R14's mounds — a mound the car simply stops against is not a corner
    // that costs something to cut, it is a wall in the one place a car is
    // most likely to arrive sideways. Cut to the cone it is still a hill
    // worth going round. The cone is a min of continuous functions of
    // position, so this can only ever take ground AWAY: a valley, a ford's
    // dip and the ravine under a bridge are all still exactly as deep as
    // the landscape made them.
    // ...but a cone may not cut the ground out from under a road's OWN
    // CORRIDOR. The ceiling is a min over every corridor in reach, which is
    // right for the country between two arms of a stage — the lower one says
    // how high the ground between them may stand — and wrong for the ground
    // one of them is standing on. Where an abandoned branch ran sixty metres
    // away and twenty below, its cone reached in under the route and took
    // fourteen metres of hillside out from beneath it, leaving the ribbon in
    // the air with a skirt hanging off its edge: the dark face down the side
    // of the road in every screenshot of one.
    //
    // So inside a corridor the road standing there is the floor on the
    // ceiling, fading out over the same three metres the drawn corridor
    // fades over. Past its own lip the ground is free to fall away — that is
    // what an embankment is — and the min over every cone is right again.
    // Inside the corridor the nearest road IS this road: two roads keep
    // `roadClear` apart (R23), which is more than two corridors' width, so
    // nothing else can be nearer to a point on this one's shelf.
    let ceiling = near ? near.ceiling : Infinity;
    /** How much of this point is a ROAD's ground rather than the country's:
     * 1 inside a corridor, spent one ground cell past its lip. That reach is
     * the same argument R31's bench is built on — a lattice triangle spans a
     * cell, so a corner within a cell of the corridor is one a triangle can
     * carry straight across the road, and a corner the far cone hollowed out
     * takes the road's own edge down with it. */
    const holdOf = (d: number, edge: number): number =>
      1 - smooth(clamp01((d - edge) / GROUND_CELL));
    /** ...and the level it is held at: the road's own underside, FALLING
     * away past its lip at the grade the verge is allowed to climb. Falling,
     * not rising with the cone, because past its own edge a road stands on
     * an embankment and an embankment has a side — this only says the side
     * is a slope a car could come back up, which is R31 read the other way
     * round. `own` carries the cone's rise past the bench, so that is taken
     * back off — at the grade it was actually opened at (R34), not at the
     * verge's, or a cutting leaves the difference standing as a lip along
     * its own corridor. */
    const floorOf = (level: number, d: number, edge: number, climb: number): number =>
      level - coneRise(d, climb) - Math.max(0, d - edge) * VERGE_CLIMB;
    let hold = near ? holdOf(near.d, shelfEnd) : 0;
    let floor = near ? floorOf(near.own, near.d, shelfEnd, near.ownClimb) : -Infinity;
    if (spur) {
      // A branch is never banked and the index carries no signed lateral,
      // so its cone is the plain one: its own underside, opening upward
      // past the bench. Nor is a branch ever CUT (R34): it is the road the
      // stage did not take, abandoned to the country, and nobody blasts a
      // cutting for a road nobody is going to drive.
      const branch = ceilingOf(spur.sample) + coneRise(spur.d, VERGE_CLIMB);
      if (branch < ceiling) ceiling = branch;
      // ...and where the point is on the BRANCH's ground, the branch is the
      // road it is beside and the floor is its own.
      const edge = spur.spur.width / 2 + ROAD_CROSS.reach;
      if (!near || spur.d < near.d) {
        hold = holdOf(spur.d, edge);
        floor = floorOf(branch, spur.d, edge, VERGE_CLIMB);
      }
    }
    // It only ever RAISES the ceiling, so this takes no ground away and
    // fills nothing in: `raised` still bounds the result from above, and a
    // valley, a ford's dip and the ravine under a bridge are all exactly as
    // deep as the landscape made them.
    if (hold > 0 && floor > ceiling) ceiling += (floor - ceiling) * hold;
    const raised = base + guards.riseAt(x, z);
    return raised < ceiling ? raised : ceiling;
  };

  const heightAt = (x: number, z: number): number => carveGround(streams, x, z, rawHeight(x, z));

  /** R34 — how much the ground at a point is a FACE THE ROAD WAS CUT
   * THROUGH, 0 (open country, or a bank battered back to something a car
   * could climb) to 1 (blasted rock standing over the verge).
   *
   * Two questions, multiplied. How hard was this piece of road cut — which
   * is the cone's own grade, already decided per sample by `cutClimb` off
   * the surface, the cover and the dial. And how much country is actually
   * standing on the cut here: a cutting is only a cutting where the land
   * WANTED to be above the road, and the same blasted tarmac running out
   * across a flat has no face beside it at all.
   *
   * Cheap where it has to be. Almost every point the props ask about is
   * nowhere near a road, and that answer costs one index lookup — the bare
   * landscape is only read once a road is close enough to have cut it. */
  const cutAt = (x: number, z: number): number => {
    const C = R.verge.cut;
    const near = nearestSample(x, z);
    if (!near || near.d > CORRIDOR_RANGE) return 0;
    const blast = clamp01((near.ownClimb - VERGE_CLIMB) / Math.max(1e-6, C.face.max - VERGE_CLIMB));
    if (blast <= 0) return 0;
    const over = farField(x, z) - near.ceiling;
    if (over <= C.bare.over) return 0;
    return blast * smooth(clamp01((over - C.bare.over) / (C.bare.full - C.bare.over)));
  };

  /** The DRAWN corridor surface at a point — the ribbon the road mesh
   * builds, with no tile sink under it — and two different weights on it.
   * Null when the point is nowhere near a road.
   *
   * `cover` is whether a road is DRAWN over this point at all: 1 anywhere
   * inside the corridor, fading out past its lip. It answers "is the thing
   * under the wheels here a road", which is what the water check wants.
   *
   * `hand` is R16's HAND-OVER — how much of the ribbon's own HEIGHT still
   * applies. It leaves 1 at the bare shoulder and is spent by the corridor's
   * outer lip, so the ribbon and the ground lattice meet there at a shared
   * height rather than one stopping in the air over the other
   * (`handoverAt`). The two are not the same question and used to be the
   * same number, which is why the road had a vertical face down each side. */
  type Corridor = { y: number; cover: number; hand: number };
  const corridorGround = (x: number, z: number): Corridor | null => {
    let best: Corridor | null = null;
    const consider = (s: RibbonSample, d: number, side: number, width: number): void => {
      const edge = width / 2 + ROAD_CROSS.reach;
      if (d > edge + 3) return;
      const cover = 1 - smooth(clamp01((d - edge) / 3));
      if (best && best.cover >= cover) return;
      best = {
        y: ribbonY(s, side * Math.min(d, edge), width),
        cover,
        hand: handoverAt(d - width / 2),
      };
    };
    const near = nearestRoad(x, z);
    if (near && near.d < shelfEnd + 3)
      consider(samples[near.index], near.d, sideOf(near.lateral), samples[near.index].width);
    const spur = spurs.spurs.length > 0 ? spurs.nearest(x, z) : null;
    if (spur) consider(spur.sample, spur.d, 1, spur.spur.width);
    // The apron wins over both: at a junction the ground IS the junction —
    // one graded plane, right out to its rim, with no hand-over of its own
    // to make (R17).
    const apron = apronAt(x, z);
    if (apron && apron.weight > 0) {
      const under: Corridor = best ?? { y: apron.y, cover: apron.weight, hand: apron.weight };
      return {
        y: apron.y * apron.weight + under.y * (1 - apron.weight),
        cover: Math.max(apron.weight, under.cover),
        hand: Math.max(apron.weight, under.hand),
      };
    }
    return best;
  };

  // Lattice corners are hot (every off-road step reads several), so they
  // are cached; the cache clears whenever the field itself changes shape
  // (new streams carved, the endless prune re-anchoring the corridor).
  let cornerCache = new Map<number, number>();
  const cornerHeight = (i: number, j: number): number => {
    const key = cellKey(i, j);
    const hit = cornerCache.get(key);
    if (hit !== undefined) return hit;
    if (cornerCache.size > 8192) cornerCache = new Map();
    const y = heightAt(i * GROUND_CELL, j * GROUND_CELL);
    cornerCache.set(key, y);
    return y;
  };

  // Each lattice cell splits into two triangles along the same diagonal the
  // renderer's tile indexing uses — (i+1,j) to (i,j+1) — so this is the
  // exact drawn surface, not an approximation of it.
  const latticeAt = (x: number, z: number): number => {
    const gx = x / GROUND_CELL;
    const gz = z / GROUND_CELL;
    const i = Math.floor(gx);
    const j = Math.floor(gz);
    const fx = gx - i;
    const fz = gz - j;
    if (fx + fz <= 1) {
      const h00 = cornerHeight(i, j);
      return h00 + fx * (cornerHeight(i + 1, j) - h00) + fz * (cornerHeight(i, j + 1) - h00);
    }
    const h11 = cornerHeight(i + 1, j + 1);
    return (
      h11 + (1 - fx) * (cornerHeight(i, j + 1) - h11) + (1 - fz) * (cornerHeight(i + 1, j) - h11)
    );
  };

  const groundAt = (x: number, z: number): number => {
    const lattice = latticeAt(x, z);
    // Beside a road the DRAWN surface is the ribbon, not the tile under it
    // — its crown, its wheel tracks, its shoulder (R16). The lattice is 14 m
    // between corners and could not hold any of that, so out to the shoulder
    // the physics rides the ribbon; past it R16's hand-over leans onto the
    // tiles, and by the corridor's lip they have it.
    const corridor = corridorGround(x, z);
    if (!corridor) return lattice;
    return corridor.y * corridor.hand + lattice * (1 - corridor.hand);
  };

  /** The ROAD standing over a point: the height of the ribbon the car
   * drives there, or null where no road covers the point — and null on a
   * BRIDGE, because a deck is a road over the water rather than ground
   * over it, and what runs under one is still the river it spans (R13). */
  const roadTopAt = (x: number, z: number): number | null => {
    const near = nearestRoad(x, z);
    if (near && near.d < shelfEnd + 3 && samples[near.index].deck !== null) return null;
    const corridor = corridorGround(x, z);
    return corridor && corridor.cover > 0.5 ? corridor.y : null;
  };

  const waterAt = (x: number, z: number): number | null => {
    // The ground the question is asked of is the one the world SHOWS: the
    // lattice the tiles are drawn on, not the analytic field between its
    // corners. A channel too narrow for the lattice to hold runs UNDER a
    // hillside the tiles never dip into, and a car up there is on the
    // hillside — there is nothing to drown in.
    const ground = latticeAt(x, z);
    const surface = ground < LAKE_Y ? LAKE_Y : streamWaterAt(streams, x, z);
    if (surface === null || ground >= surface - 0.02) return null;
    // ...and a road over it is another layer again: an embankment across a
    // lake, or a shelf cut above a stream, is dry road with water below,
    // not water. Only a ford — whose ribbon lies AT the water it wades —
    // is still wet.
    const road = roadTopAt(x, z);
    if (road !== null && road > surface + WADE_LIP) return null;
    return surface;
  };

  /** Distance from a point to the nearest ABANDONED BRANCH's mat edge, or
   * Infinity when there is none near — nothing is planted on a road, and a
   * spur is as much a road as the stage is (R17). */
  const spurClearance = (x: number, z: number): number => {
    if (spurs.spurs.length === 0) return Infinity;
    const spur = spurs.nearest(x, z);
    return spur ? spur.d - spur.spur.width / 2 : Infinity;
  };

  /** Distance from a point to the nearest road's outer EDGE — stage or
   * abandoned branch, ribbon and verge included — negative on the road
   * itself. R18's water steers by it: a watercourse crosses a road where
   * the road was built to cross it, and keeps its bank off it everywhere
   * else. */
  const roadClear: RoadClear = (x, z) => {
    const near = nearestRoad(x, z);
    const stage = near ? near.d - shelfEnd : Infinity;
    const spur = spurs.spurs.length > 0 ? spurs.nearest(x, z) : null;
    const branch = spur ? spur.d - spur.spur.width / 2 - ROAD_CROSS.reach : Infinity;
    return Math.min(stage, branch);
  };

  const spurSurfaceAt = (x: number, z: number): Surface | null => {
    if (spurs.spurs.length === 0) return null;
    const spur = spurs.nearest(x, z);
    if (!spur || spur.d > spur.spur.width / 2) return null;
    return spur.sample.surface;
  };

  // Everything solid that stands on this ground, and the region/grove quilt
  // that decides what kind of place it stands in (props.ts). It reads the
  // field through these functions rather than sharing its state, so the
  // engine's copy and the renderer's copy of the world always agree.
  const props = createPropField({
    seed: track.seed,
    half,
    forestScale: knobScale(track.knobs.trees, R.forest.density),
    groundAt,
    roadNear: nearestRoad,
    sampleAt: (index) => samples[index],
    spurClearance,
    inAnyStream: (x, z, margin) => inStream(streams, x, z, margin),
    // R34 — the cover, MINUS whatever the road blasted off. The geology's
    // own soil is the bare country's, and the bare country never heard of
    // the cutting: read it raw and a spruce wood grows down a rock face,
    // which is the same mistake R32's rooting rule exists to stop one
    // layer further down.
    soilAt: (x, z) => land.geology.soilAt(x, z) * (1 - cutAt(x, z)),
    wetAt: land.geology.wetAt,
    guards,
  });

  // R13 — the parapets, built once off the deck runs the track already
  // carries and bucketed for the contact model to ask about. An endless
  // stage streams road in, so the build has a cursor of its own; a whole
  // stage's bridges are a few hundred bays, which is a rounding error
  // beside the forest.
  const parapets: WildObstacle[] = [];
  const parapetGrid = new Map<number, WildObstacle[]>();
  const PARAPET_CELL = 24;
  let parapetScan = 0;
  const indexParapets = (): void => {
    for (const bay of bridgeParapets(samples, track.width, parapetScan, samples.length)) {
      parapets.push(bay);
      const key = cellKey(Math.floor(bay.x / PARAPET_CELL), Math.floor(bay.z / PARAPET_CELL));
      const bucket = parapetGrid.get(key);
      if (bucket) bucket.push(bay);
      else parapetGrid.set(key, [bay]);
    }
    parapetScan = samples.length;
  };

  const parapetsNear = (x: number, z: number, r: number): WildObstacle[] => {
    if (parapets.length === 0) return [];
    const found: WildObstacle[] = [];
    const reach = Math.ceil((r + 1) / PARAPET_CELL);
    const cx = Math.floor(x / PARAPET_CELL);
    const cz = Math.floor(z / PARAPET_CELL);
    for (let dx = -reach; dx <= reach; dx++) {
      for (let dz = -reach; dz <= reach; dz++) {
        for (const bay of parapetGrid.get(cellKey(cx + dx, cz + dz)) ?? []) {
          const ddx = bay.x - x;
          const ddz = bay.z - z;
          const hit = r + bay.radius;
          if (ddx * ddx + ddz * ddz <= hit * hit) found.push(bay);
        }
      }
    }
    return found;
  };

  let streamScan = 0;

  const sync = (carS: number): void => {
    if (samples.length > indexed || spurCount < track.spurs.length) {
      indexSamples(indexed, samples.length);
      indexed = samples.length;
      indexParapets();
      // The water: every crossing this stretch of road added, traced as
      // one river through them (R18) — born on the high ground, gathering
      // as it runs, ending in the lowest water it can find.
      // The river reads the ground the ROAD sits in (corridor shelf and
      // all), not the bare far field: a watercourse routed against a
      // landscape the road does not stand on would refuse every reach
      // between two crossings that the road itself made possible.
      // Traced, then sliced: the field queries the slices, and the whole
      // watercourses are kept beside them because a river is only judgeable
      // end to end — the analysis walks one from its source to its mouth to
      // ask whether it ever climbs, whether it gathers, and whether it ends
      // in anything.
      for (const river of traceRivers(
        track.seed,
        collectAnchors(track, streamScan),
        rawHeight,
        LAKE_Y,
        roadClear,
        // The country the stage occupies: a mouth that gets clear of it has
        // left the map, which is one of the two ways a river is allowed to
        // end. Without it every course that would have run off the frame
        // pools instead, and the map fills with tarns nothing feeds.
        track.bounds,
      )) {
        rivers.push(river);
        streams.push(...sliceRiver(river));
      }
      streamScan = samples.length;
      // The branches the compiler forked off at the paving junctions (R17),
      // and the guards that shut the corners the road has now committed
      // (R14) — placed against the road as it stands, so a guard never
      // lands on the stage and never on a stream or a branch.
      for (; spurCount < track.spurs.length; spurCount++) spurs.add(track.spurs[spurCount]);
      const committedS = samples[samples.length - 1].s - (track.endless ? 250 : 0);
      const roadAt = (x: number, z: number): number => nearestRoad(x, z)?.d ?? Infinity;
      guards.extend(
        committedS,
        roadAt,
        (x, z) => inStream(streams, x, z, 4) || spurClearance(x, z) < R.guard.moundClear,
      );
      // R27 — and the crowd, placed last of the three so it can refuse the
      // ground a guard's mound has just taken: spectators stand on flat
      // ground beside a corner, not up the side of the hill shutting it.
      stands.extend(
        committedS,
        roadAt,
        (x, z) =>
          waterAt(x, z) !== null ||
          inStream(streams, x, z, 4) ||
          spurClearance(x, z) < R.guard.groveClear ||
          guards.riseAt(x, z) > 0.5,
      );
      // New road may have arrived where a prop stood — revalidate; fresh
      // stream valleys reshape the ground, so the lattice re-samples too.
      props.invalidate();
      cornerCache = new Map();
    }
    if (!track.endless) return;
    // Forget road the run has left behind: the sample grid re-anchors to
    // the live window so fresh queries never shape themselves around it,
    // and spent stream descriptors stop taxing the carve.
    const floorS = carS - 700;
    if (samples[firstIndexed]?.s < floorS - 400) {
      while (firstIndexed < samples.length - 1 && samples[firstIndexed].s < floorS) firstIndexed++;
      grid = new Map();
      nearCx = NaN;
      indexSamples(firstIndexed, samples.length);
      while (streams.length > 0 && streams[0].centerS < floorS) streams.shift();
      guards.pruneBefore(floorS);
      stands.pruneBefore(floorS);
      spurs.pruneBefore(floorS);
      props.invalidate();
      cornerCache = new Map();
    }
  };

  sync(0);

  const roadDistanceAt = (x: number, z: number): number => nearestRoad(x, z)?.d ?? Infinity;

  return {
    heightAt,
    groundAt,
    latticeAt,
    farHeightAt: farField,
    geology: land.geology,
    waterAt,
    roadDistanceAt,
    cutAt,
    spurSurfaceAt,
    streams,
    rivers,
    guards: guards.guards,
    stands: stands.stands,
    obstaclesNear: props.obstaclesNear,
    parapetsNear,
    treesNear: props.treesNear,
    fell: props.fell,
    groveAt: props.groveAt,
    regionAt: props.regionAt,
    sync,
  };
}
