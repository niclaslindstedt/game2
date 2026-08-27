// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The landscape the road runs through — and, since the world opened up,
// the ground the car actually rides the moment it leaves the road. One
// seeded heightfield serves both the physics and the renderer: a flat
// verge shelf at road grade, per-side embankments rising into hillsides or
// falling toward valleys, a rolling far field with ridged mountain chains
// and broad sea basins sunk under the water table, and stream valleys
// carved through wherever a ford crosses the road. The same field also
// seeds the wild's solid props — boulders and fallen trunks scattered off
// the corridor — so the renderer draws exactly what the physics can crash
// into. Everything is deterministic in the track seed; heights are smooth
// analytic noise, so the ground under the car never stairsteps.

import { createRng } from "../lib/prng.ts";
import { hash2, smooth, valueNoise } from "../lib/noise.ts";
import type { Surface, Track, TrackSample } from "./compile.ts";
import { createGuardField, type CornerGuard, type GuardField } from "./guards.ts";
import { traceRivers, type River, type RiverAnchor } from "./river.ts";
import {
  corridorOffset,
  junctionFlat,
  junctionPlatformY,
  ROAD_CROSS,
  type RoadShape,
} from "./road.ts";
import { createLandField, LAKE_Y } from "./land.ts";
import { STAGE_RULES as R, knobScale } from "./rules.ts";
import { createSpurIndex, type SpurIndex } from "./spurs.ts";

export { LAKE_Y } from "./land.ts";
/** Edge length of the ground lattice the physics rides and the renderer
 * triangulates its ground tiles on, m. The two must agree — see groundAt. */
export const GROUND_CELL = 14;
/** Plain dirt road extrapolated straight past each stage end, m — the
 * rally start's run-up before the gate, and run-off past the flying
 * finish. The terrain keeps its shelf flat under the same corridor so the
 * apron never floats or drowns, the physics rides it, and R24 keeps every
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
/** Bank blend distance from the water's edge back to the landscape, m. */
const BANK = 9;
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
 * queryable pieces — the one entry point the terrain field uses. */
export function computeStreams(
  seed: number,
  anchors: RiverAnchor[],
  farHeight: (x: number, z: number) => number,
): Stream[] {
  return traceRivers(seed, anchors, farHeight, LAKE_Y).flatMap(sliceRiver);
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

// ── Wild props ────────────────────────────────────────────────────────────

/** A solid thing standing in the wild: the physics collides with it and the
 * renderer draws it — the SAME seeded placement on both sides. */
export type WildObstacle = {
  x: number;
  z: number;
  /** Ground height under it (terrain.heightAt at its foot). */
  y: number;
  kind: "boulder" | "log" | "tree";
  /** Visual scale factor, ~0.8–1.8. */
  size: number;
  spin: number;
  /** Collision radius in the ground plane, m — for a tree, the trunk. */
  radius: number;
  /** Height above its foot — a car flying higher clears it. */
  height: number;
  /** Trees only: species roll (0–1) and grove index (into GROVES) — the
   * renderer picks WHAT to draw from these; the engine only owns WHERE the
   * trunk stands and how thick it is. */
  roll?: number;
  grove?: number;
};

/** One obstacle candidate per grid cell of this edge, m. */
const OB_CELL = 56;
/** Fraction of cells that actually hold one. */
const OB_DENSITY = 0.45;
/** Obstacles keep this far from the road centerline beyond the half-width. */
const OB_ROAD_CLEAR = 10;

// ── The grove quilt and the forest's trunks ───────────────────────────────

/** One plant community's PLACEMENT data: its share of the landscape and how
 * much of its ground carries a solid tree (0 open meadow, 1 closed forest).
 * Species, colors and undergrowth are the renderer's business (the biome in
 * the app maps these ids to flora) — the quilt and the trunks live here
 * because the car collides with them, and collision and drawing must agree
 * on the same seeded placement. */
export type GroveCommunity = { id: string; weight: number; density: number };

export const GROVES: readonly GroveCommunity[] = [
  { id: "spruceWood", weight: 3, density: 1 },
  { id: "pineHeath", weight: 2.5, density: 0.8 },
  { id: "birchGrove", weight: 2, density: 0.9 },
  { id: "oldGrowth", weight: 2, density: 1 },
  { id: "broadleafGrove", weight: 1.5, density: 0.85 },
  { id: "larchStand", weight: 1, density: 0.85 },
  { id: "meadow", weight: 2.5, density: 0.06 },
];

/** Meters of grove-noise period — how big one community's patch is. */
export const GROVE_SCALE = 150;

/** One tree candidate per grid cell of this edge, m — the ceiling on how
 * dense a closed forest gets (one trunk per ~100 m²). */
const TREE_CELL = 10;
/** Chance a cell's candidate stands, at community density 1. With the cell
 * size this sets the closed forest at roughly a trunk per 500 m² — gaps a
 * car can thread, walls it cannot ignore. */
const TREE_DENSITY = 0.22;
/** Trees keep this far from the road EDGE, m — just past the corridor the
 * road ribbon draws (its shoulder and ditch), so running wide brushes the
 * verge and leaving the road properly finds the forest. */
const TREE_ROAD_CLEAR = ROAD_CROSS.reach + 1;

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
  /** The corner guards placed so far (R14) — the renderer reads them to
   * dress the mounds, the tooling to draw them on a preview. */
  guards: CornerGuard[];
  /** Solid wild props near a point (within `r` of it), collision-checked
   * by the physics and drawn by the renderer. */
  obstaclesNear: (x: number, z: number, r: number) => WildObstacle[];
  /** The forest's solid trunks near a point (within `r`) — same contract
   * as obstaclesNear, kept separate because trees are far denser and the
   * renderer draws them through the flora system rather than as props. */
  treesNear: (x: number, z: number, r: number) => WildObstacle[];
  /** Which grove community (index into GROVES) owns a patch of ground —
   * the one quilt both the trunk placement above and the renderer's
   * species/undergrowth choices read, so a meadow is open on both sides. */
  groveAt: (x: number, z: number) => number;
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
  let grid = new Map<string, number[]>();
  let firstIndexed = 0;
  let indexed = 0;

  const indexSamples = (from: number, to: number): void => {
    for (let i = from; i < to; i++) {
      const key = `${Math.floor(samples[i].x / GRID)},${Math.floor(samples[i].z / GRID)}`;
      let cell = grid.get(key);
      if (!cell) grid.set(key, (cell = []));
      cell.push(i);
    }
  };

  type Near = { d: number; index: number; lateral: number };
  const nearestSample = (x: number, z: number): Near | null => {
    const cx = Math.floor(x / GRID);
    const cz = Math.floor(z / GRID);
    let best = -1;
    let bestD2 = Infinity;
    for (let dx = -3; dx <= 3; dx++) {
      for (let dz = -3; dz <= 3; dz++) {
        const cell = grid.get(`${cx + dx},${cz + dz}`);
        if (!cell) continue;
        for (const i of cell) {
          const ddx = x - samples[i].x;
          const ddz = z - samples[i].z;
          const d2 = ddx * ddx + ddz * ddz;
          if (d2 < bestD2) {
            bestD2 = d2;
            best = i;
          }
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
    return { d, index: best, lateral };
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

  const streams: Stream[] = [];
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
    return base + guards.riseAt(x, z);
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
  const groundAt = (x: number, z: number): number => {
    const gx = x / GROUND_CELL;
    const gz = z / GROUND_CELL;
    const i = Math.floor(gx);
    const j = Math.floor(gz);
    const fx = gx - i;
    const fz = gz - j;
    let lattice: number;
    if (fx + fz <= 1) {
      const h00 = cornerHeight(i, j);
      lattice = h00 + fx * (cornerHeight(i + 1, j) - h00) + fz * (cornerHeight(i, j + 1) - h00);
    } else {
      const h11 = cornerHeight(i + 1, j + 1);
      lattice =
        h11 + (1 - fx) * (cornerHeight(i, j + 1) - h11) + (1 - fz) * (cornerHeight(i + 1, j) - h11);
    }
    // Beside a road the DRAWN surface is the ribbon, not the tile under it
    // — its shoulder, its ditch, the lip past it (R16). The lattice is 14 m
    // between corners and could not hold a ditch if it tried, so within the
    // corridor the physics rides the ribbon and blends out to the tiles.
    const corridor = corridorGround(x, z);
    if (!corridor) return lattice;
    return corridor.y * corridor.weight + lattice * (1 - corridor.weight);
  };

  const waterAt = (x: number, z: number): number | null => {
    const ground = heightAt(x, z);
    if (ground < LAKE_Y) return LAKE_Y;
    const stream = streamWaterAt(streams, x, z);
    if (stream !== null && ground < stream - 0.02) return stream;
    return null;
  };

  // ── Wild props: one seeded candidate per cell, validated on demand ─────
  // Validity depends on the corridor (nothing solid on or near the road),
  // so the cache clears whenever new road streams in.
  const obSeed = rng.int(1, 1 << 30);
  let obCache = new Map<string, WildObstacle | null>();

  /** Distance from a point to the nearest ABANDONED BRANCH's mat edge, or
   * Infinity when there is none near — nothing is planted on a road, and a
   * spur is as much a road as the stage is (R17). */
  const spurClearance = (x: number, z: number): number => {
    if (spurs.spurs.length === 0) return Infinity;
    const spur = spurs.nearest(x, z);
    return spur ? spur.d - spur.spur.width / 2 : Infinity;
  };

  const spurSurfaceAt = (x: number, z: number): Surface | null => {
    if (spurs.spurs.length === 0) return null;
    const spur = spurs.nearest(x, z);
    if (!spur || spur.d > spur.spur.width / 2) return null;
    return spur.sample.surface;
  };

  const obstacleInCell = (cx: number, cz: number): WildObstacle | null => {
    const key = `${cx},${cz}`;
    const hit = obCache.get(key);
    if (hit !== undefined) return hit;
    if (obCache.size > 4096) obCache = new Map();
    let ob: WildObstacle | null = null;
    if (hash2(cx, cz, obSeed) < OB_DENSITY) {
      const x = (cx + 0.12 + hash2(cx, cz, obSeed + 1) * 0.76) * OB_CELL;
      const z = (cz + 0.12 + hash2(cx, cz, obSeed + 2) * 0.76) * OB_CELL;
      const near = nearestSample(x, z);
      const clear = (!near || near.d > half + OB_ROAD_CLEAR) && spurClearance(x, z) > OB_ROAD_CLEAR;
      if (clear && !inStream(streams, x, z, 1)) {
        // Feet on the RIDDEN ground: the car collides against `y`, so a
        // prop planted on the analytic field could hover a step above the
        // surface the car actually drives on.
        const y = groundAt(x, z);
        if (y > LAKE_Y + 1) {
          const boulder = hash2(cx, cz, obSeed + 3) < 0.55;
          const size = 0.8 + hash2(cx, cz, obSeed + 4);
          ob = {
            x,
            z,
            y,
            kind: boulder ? "boulder" : "log",
            size,
            spin: hash2(cx, cz, obSeed + 5) * Math.PI * 2,
            // A trunk lies low enough to jump; a boulder takes real air.
            radius: boulder ? 1.9 * size : 2.6 * size,
            height: boulder ? 2.1 * size : 0.75 * size,
          };
        }
      }
    }
    obCache.set(key, ob);
    return ob;
  };

  const obstaclesNear = (x: number, z: number, r: number): WildObstacle[] => {
    const found: WildObstacle[] = [];
    const lo = OB_CELL;
    for (let cx = Math.floor((x - r - 3) / lo); cx <= Math.floor((x + r + 3) / lo); cx++) {
      for (let cz = Math.floor((z - r - 3) / lo); cz <= Math.floor((z + r + 3) / lo); cz++) {
        const ob = obstacleInCell(cx, cz);
        if (!ob) continue;
        const dx = ob.x - x;
        const dz = ob.z - z;
        if (dx * dx + dz * dz <= (r + ob.radius) * (r + ob.radius)) found.push(ob);
      }
    }
    return found;
  };

  // ── The forest: one seeded trunk candidate per tree cell ───────────────
  // The same quilt-then-roll placement the renderer used to run on its own;
  // it lives here now so the trunks are solid. The wobbled grove lookup
  // keeps community borders meandering instead of running cell-straight.
  const groveSeed = (track.seed ^ 0x9e3779b9) >>> 0;
  const groveWeight = GROVES.reduce((sum, g) => sum + g.weight, 0);
  const groveAt = (x: number, z: number): number => {
    const wx = x + (valueNoise(x, z, 47, groveSeed + 1) - 0.5) * 70;
    const wz = z + (valueNoise(z, x, 53, groveSeed + 2) - 0.5) * 70;
    let t = hash2(Math.floor(wx / GROVE_SCALE), Math.floor(wz / GROVE_SCALE), groveSeed);
    t *= groveWeight;
    for (let i = 0; i < GROVES.length; i++) {
      t -= GROVES[i].weight;
      if (t <= 0) return i;
    }
    return GROVES.length - 1;
  };

  const treeSeed = rng.int(1, 1 << 30);
  /** The `trees` dial, straight onto the forest's density. */
  const forestScale = knobScale(track.knobs.trees, R.forest.density);
  let treeCache = new Map<string, WildObstacle | null>();

  const treeInCell = (cx: number, cz: number): WildObstacle | null => {
    const key = `${cx},${cz}`;
    const hit = treeCache.get(key);
    if (hit !== undefined) return hit;
    if (treeCache.size > 16384) treeCache = new Map();
    let tree: WildObstacle | null = null;
    const x = (cx + 0.1 + hash2(cx, cz, treeSeed + 1) * 0.8) * TREE_CELL;
    const z = (cz + 0.1 + hash2(cx, cz, treeSeed + 2) * 0.8) * TREE_CELL;
    const grove = groveAt(x, z);
    if (hash2(cx, cz, treeSeed) < TREE_DENSITY * forestScale * GROVES[grove].density) {
      const near = nearestSample(x, z);
      const clear =
        (!near || near.d > half + TREE_ROAD_CLEAR) && spurClearance(x, z) > TREE_ROAD_CLEAR;
      if (clear && !inStream(streams, x, z, 1.5)) {
        // Feet on the RIDDEN lattice ground, same as the props: the trunk
        // must stand exactly on the surface the car drives.
        const y = groundAt(x, z);
        if (y > LAKE_Y + 1.2) {
          const size = 0.75 + hash2(cx, cz, treeSeed + 3) * 0.6;
          tree = {
            x,
            z,
            y,
            kind: "tree",
            size,
            spin: hash2(cx, cz, treeSeed + 4) * Math.PI * 2,
            // The trunk plus its lowest boughs — fat enough to punish a
            // straight-through line, thin enough that gaps stay drivable.
            radius: 0.3 + 0.25 * size,
            // Tall enough that no jump clears a tree; only a real cliff
            // flight sails over the forest.
            height: 6 * size,
            roll: hash2(cx, cz, treeSeed + 5),
            grove,
          };
        }
      }
    }
    treeCache.set(key, tree);
    return tree;
  };

  // The guard groves' trunks (R14): the same solid trees the forest field
  // stands, but placed by the corner they shut rather than by the quilt —
  // and never thinned by the `trees` dial, because a corner with an open
  // inside is a broken corner however sparse the stage's woods are.
  const guardTrees = new Map<CornerGuard, WildObstacle[]>();

  const treesOfGuard = (guard: CornerGuard): WildObstacle[] => {
    const cached = guardTrees.get(guard);
    if (cached) return cached;
    const grown: WildObstacle[] = [];
    for (const sapling of guard.saplings) {
      const y = groundAt(sapling.x, sapling.z);
      if (y < LAKE_Y + 1.2) continue;
      grown.push({
        x: sapling.x,
        z: sapling.z,
        y,
        kind: "tree",
        size: sapling.size,
        spin: sapling.spin,
        radius: 0.3 + 0.25 * sapling.size,
        height: 6 * sapling.size,
        roll: sapling.roll,
        grove: groveAt(sapling.x, sapling.z),
      });
    }
    guardTrees.set(guard, grown);
    return grown;
  };

  const treesNear = (x: number, z: number, r: number): WildObstacle[] => {
    const found: WildObstacle[] = [];
    for (
      let cx = Math.floor((x - r - 1) / TREE_CELL);
      cx <= Math.floor((x + r + 1) / TREE_CELL);
      cx++
    ) {
      for (
        let cz = Math.floor((z - r - 1) / TREE_CELL);
        cz <= Math.floor((z + r + 1) / TREE_CELL);
        cz++
      ) {
        const tree = treeInCell(cx, cz);
        if (!tree) continue;
        const dx = tree.x - x;
        const dz = tree.z - z;
        if (dx * dx + dz * dz <= (r + tree.radius) * (r + tree.radius)) found.push(tree);
      }
    }
    for (const guard of guards.near(x, z, r)) {
      if (guard.kind !== "grove") continue;
      for (const tree of treesOfGuard(guard)) {
        const dx = tree.x - x;
        const dz = tree.z - z;
        if (dx * dx + dz * dz <= (r + tree.radius) * (r + tree.radius)) found.push(tree);
      }
    }
    return found;
  };

  let streamScan = 0;

  const sync = (carS: number): void => {
    if (samples.length > indexed || spurCount < track.spurs.length) {
      indexSamples(indexed, samples.length);
      indexed = samples.length;
      // The water: every crossing this stretch of road added, traced as
      // one river through them (R18) — born on the high ground, gathering
      // as it runs, ending in the lowest water it can find.
      // The river reads the ground the ROAD sits in (corridor shelf and
      // all), not the bare far field: a watercourse routed against a
      // landscape the road does not stand on would refuse every reach
      // between two crossings that the road itself made possible.
      streams.push(...computeStreams(track.seed, collectAnchors(track, streamScan), rawHeight));
      streamScan = samples.length;
      // The branches the compiler forked off at the paving junctions (R17),
      // and the guards that shut the corners the road has now committed
      // (R14) — placed against the road as it stands, so a guard never
      // lands on the stage and never on a stream or a branch.
      for (; spurCount < track.spurs.length; spurCount++) spurs.add(track.spurs[spurCount]);
      guards.extend(
        samples[samples.length - 1].s - (track.endless ? 250 : 0),
        (x, z) => nearestSample(x, z)?.d ?? Infinity,
        (x, z) => inStream(streams, x, z, 4) || spurClearance(x, z) < R.guard.moundClear,
      );
      // New road may have arrived where a prop stood — revalidate; fresh
      // stream valleys reshape the ground, so the lattice re-samples too.
      obCache = new Map();
      treeCache = new Map();
      cornerCache = new Map();
      guardTrees.clear();
    }
    if (!track.endless) return;
    // Forget road the run has left behind: the sample grid re-anchors to
    // the live window so fresh queries never shape themselves around it,
    // and spent stream descriptors stop taxing the carve.
    const floorS = carS - 700;
    if (samples[firstIndexed]?.s < floorS - 400) {
      while (firstIndexed < samples.length - 1 && samples[firstIndexed].s < floorS) firstIndexed++;
      grid = new Map();
      indexSamples(firstIndexed, samples.length);
      while (streams.length > 0 && streams[0].centerS < floorS) streams.shift();
      guards.pruneBefore(floorS);
      spurs.pruneBefore(floorS);
      obCache = new Map();
      treeCache = new Map();
      cornerCache = new Map();
      guardTrees.clear();
    }
  };

  sync(0);

  const roadDistanceAt = (x: number, z: number): number => nearestSample(x, z)?.d ?? Infinity;

  return {
    heightAt,
    groundAt,
    farHeightAt: farField,
    waterAt,
    roadDistanceAt,
    spurSurfaceAt,
    streams,
    guards: guards.guards,
    obstaclesNear,
    treesNear,
    groveAt,
    sync,
  };
}
