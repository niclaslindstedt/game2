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
import { cellKey } from "../lib/math.ts";
import { smooth, valueNoise } from "../lib/noise.ts";
import type { Surface, Track, TrackSample } from "./compile.ts";
import { createGuardField, type CornerGuard, type GuardField } from "./guards.ts";
import { createStandField, type Stand, type StandField } from "./stands.ts";
import { BANK, traceRivers, type River, type RiverAnchor, type RoadClear } from "./river.ts";
import {
  corridorOffset,
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
  };
  let grid = new Map<number, Cell>();
  let firstIndexed = 0;
  let indexed = 0;

  const indexSamples = (from: number, to: number): void => {
    for (let i = from; i < to; i++) {
      const s = samples[i];
      const key = cellKey(Math.floor(s.x / GRID), Math.floor(s.z / GRID));
      let cell = grid.get(key);
      if (!cell) {
        grid.set(key, (cell = { index: [], x: [], z: [], top: [], px: [], pz: [], floor: [] }));
      }
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
      cell.index.push(i);
      cell.x.push(s.x);
      cell.z.push(s.z);
      cell.top.push(top);
      cell.px.push(px);
      cell.pz.push(pz);
      cell.floor.push(top - Math.hypot(px, pz) * BENCH);
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
  let nearCx = NaN;
  let nearCz = NaN;
  const nearCells: Cell[] = [];

  type Near = {
    d: number;
    index: number;
    lateral: number;
    /** R31 — the highest the ground may stand here for this road's sake:
     * the lowest nearby corridor's own underside, opening upward at
     * `verge.climb` once past the bench. Infinity where no road reaches. */
    ceiling: number;
  };
  const nearestSample = (x: number, z: number): Near | null => {
    const cx = Math.floor(x / GRID);
    const cz = Math.floor(z / GRID);
    if (cx !== nearCx || cz !== nearCz) {
      nearCx = cx;
      nearCz = cz;
      nearCells.length = 0;
      for (let dx = -3; dx <= 3; dx++) {
        for (let dz = -3; dz <= 3; dz++) {
          const cell = grid.get(cellKey(cx + dx, cz + dz));
          if (cell) nearCells.push(cell);
        }
      }
    }
    let best = -1;
    let bestD2 = Infinity;
    // R31 — the verge cone, taken over every sample in reach rather than
    // over the nearest one alone. At a hairpin the two arms are a road's
    // width apart and it is the LOWER one that says how high the ground
    // between them may stand; answering off whichever happened to be
    // nearer leaves the other arm walled in.
    let ceiling = Infinity;
    for (let c = 0; c < nearCells.length; c++) {
      const cell = nearCells[c];
      const cellX = cell.x;
      const cellZ = cell.z;
      for (let k = 0; k < cellX.length; k++) {
        const ddx = x - cellX[k];
        const ddz = z - cellZ[k];
        const d2 = ddx * ddx + ddz * ddz;
        if (d2 < bestD2) {
          bestD2 = d2;
          best = cell.index[k];
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
            cell.top[k] + (ddx * cell.px[k] + ddz * cell.pz[k]) * hold + (d - BENCH) * VERGE_CLIMB;
          if (rise < ceiling) ceiling = rise;
        }
      }
    }
    if (best < 0) return null;
    const s = samples[best];
    const lateral = (x - s.x) * Math.cos(s.heading) - (z - s.z) * Math.sin(s.heading);
    let d = Math.sqrt(bestD2);
    // Past either stage end, distance to the end sample would swing the
    // shelf away under the road apron — measure from the apron's spine
    // instead while within its reach.
    if (best === firstIndexed || best === samples.length - 1) {
      const lon = (x - s.x) * Math.sin(s.heading) + (z - s.z) * Math.cos(s.heading);
      const out = best === firstIndexed ? -lon : lon;
      if (out > 0) d = Math.hypot(lateral, Math.max(0, out - APRON));
    }
    return { d, index: best, lateral, ceiling };
  };

  // The bare landscape the road was laid across (land.ts) — the same
  // country the branch builder steered by, so nothing here can disagree
  // with where the water is.
  const land = createLandField(track.seed, track.knobs);
  const farField = land.heightAt;

  // Per-side embankment grade along the stage, m per m of distance from the
  // shoulder: positive climbs into a hillside wall, negative drops toward a
  // valley (or the sea the lakes make). Varies slowly with arc position.
  const sideGrade = (s: number, side: number): number => {
    const raw = valueNoise(s, side * 97.3, 210, sideSeed);
    return -0.34 + raw * 1.1;
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
  const VERGE_CLIMB = R.verge.climb;
  /** How far out the cone is still worth asking about, m. By here it stands
   * tens of metres over the road and binds on nothing but a cliff — and
   * where it does not bind, dropping it costs the query nothing. */
  const CONE_REACH2 = CORRIDOR_RANGE * CORRIDOR_RANGE;

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
        ribbonY(s, sideOf(near.lateral) * Math.min(near.d, shelfEnd), track.width) - TILE_SINK;
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
    let ceiling = near ? near.ceiling : Infinity;
    if (spur) {
      // A branch is never banked and the index carries no signed lateral,
      // so its cone is the plain one: its own underside, opening upward
      // past the bench.
      const branch = ceilingOf(spur.sample) + Math.max(0, spur.d - BENCH) * VERGE_CLIMB;
      if (branch < ceiling) ceiling = branch;
    }
    const raised = base + guards.riseAt(x, z);
    return raised < ceiling ? raised : ceiling;
  };

  const heightAt = (x: number, z: number): number => carveGround(streams, x, z, rawHeight(x, z));

  /** The DRAWN corridor surface at a point — the ribbon the road mesh
   * builds, with no tile sink under it — plus how much of it applies (1 on
   * the road, fading to 0 where the ground lattice takes over). Null when
   * the point is nowhere near a road. */
  const corridorGround = (x: number, z: number): { y: number; weight: number } | null => {
    let best: { y: number; weight: number } | null = null;
    const consider = (s: RibbonSample, d: number, side: number, width: number): void => {
      const edge = width / 2 + ROAD_CROSS.reach;
      if (d > edge + 3) return;
      const weight = 1 - smooth(clamp01((d - edge) / 3));
      if (best && best.weight >= weight) return;
      best = { y: ribbonY(s, side * Math.min(d, edge), width), weight };
    };
    const near = nearestSample(x, z);
    if (near && near.d < shelfEnd + 3)
      consider(samples[near.index], near.d, sideOf(near.lateral), track.width);
    const spur = spurs.spurs.length > 0 ? spurs.nearest(x, z) : null;
    if (spur) consider(spur.sample, spur.d, 1, spur.spur.width);
    // The apron wins over both: at a junction the ground IS the junction.
    const apron = apronAt(x, z);
    if (apron && apron.weight > 0) {
      const under: { y: number; weight: number } = best ?? { y: apron.y, weight: apron.weight };
      return {
        y: apron.y * apron.weight + under.y * (1 - apron.weight),
        weight: Math.max(apron.weight, under.weight),
      };
    }
    return best;
  };

  // Lattice corners are hot (every off-road step reads several), so they
  // are cached; the cache clears whenever the field itself changes shape
  // (new streams carved, the endless prune re-anchoring the corridor).
  let cornerCache = new Map<string, number>();
  const cornerHeight = (i: number, j: number): number => {
    const key = `${i},${j}`;
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
    // — its shoulder, its ditch, the lip past it (R16). The lattice is 14 m
    // between corners and could not hold a ditch if it tried, so within the
    // corridor the physics rides the ribbon and blends out to the tiles.
    const corridor = corridorGround(x, z);
    if (!corridor) return lattice;
    return corridor.y * corridor.weight + lattice * (1 - corridor.weight);
  };

  /** The ROAD standing over a point: the height of the ribbon the car
   * drives there, or null where no road covers the point — and null on a
   * BRIDGE, because a deck is a road over the water rather than ground
   * over it, and what runs under one is still the river it spans (R13). */
  const roadTopAt = (x: number, z: number): number | null => {
    const near = nearestSample(x, z);
    if (near && near.d < shelfEnd + 3 && samples[near.index].deck !== null) return null;
    const corridor = corridorGround(x, z);
    return corridor && corridor.weight > 0.5 ? corridor.y : null;
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
    const near = nearestSample(x, z);
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
    roadNear: nearestSample,
    sampleAt: (index) => samples[index],
    spurClearance,
    inAnyStream: (x, z, margin) => inStream(streams, x, z, margin),
    soilAt: land.geology.soilAt,
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
      const roadAt = (x: number, z: number): number => nearestSample(x, z)?.d ?? Infinity;
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

  const roadDistanceAt = (x: number, z: number): number => nearestSample(x, z)?.d ?? Infinity;

  return {
    heightAt,
    groundAt,
    farHeightAt: farField,
    geology: land.geology,
    waterAt,
    roadDistanceAt,
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
