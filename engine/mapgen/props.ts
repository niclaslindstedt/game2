// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Everything SOLID that stands in the landscape, and the quilt that decides
// what kind of place a patch of ground is.
//
// Three scales of story, coarsest first:
//
//   REGION  (~900 m)  what this stretch of country IS — dense forest, open
//                     taiga, a logging block, a bog, an old burn. A region
//                     never plants anything itself; it re-weights the
//                     groves below it and scales the forest's density, so
//                     a stage reads as a handful of PLACES rather than one
//                     evenly-sprinkled wood.
//   GROVE   (~150 m)  which plant community owns this patch — a spruce
//                     wood, a young stand, a clearing, a dead stand.
//   STAND   (~42 m)   the clumping INSIDE one community: the difference
//                     between a wall of trunks and the gap beside it. This
//                     is what stops a forest reading as confetti.
//
// The quilt lives in the engine rather than the renderer because the
// trunks it places are SOLID: the car collides with what is drawn, so both
// sides have to derive it from the same seeded functions. Which SPECIES
// each community grows, and what its ground cover looks like, is the
// renderer's business (the biome in the app maps these ids to flora).

import { hash2, valueNoise } from "../lib/noise.ts";
import type { CornerGuard, GuardField } from "./guards.ts";
import { LAKE_Y } from "./land.ts";
import { ROAD_CROSS } from "./road.ts";
import { SOLID_PROP_HEIGHT, solidShape, standSolid, type WildObstacle } from "./solids.ts";

/** Solid props keep this far from the road EDGE, m, measured to their own
 * rim rather than their center — the ribbon draws its shoulder and ditch
 * out to `reach`, and nothing the car can hit may stand on that. Past it
 * the forest already stands, so past it is where a rock is honest. */
const PROP_ROAD_CLEAR = ROAD_CROSS.reach;
/** Trees keep this far from the road EDGE, m — just past the corridor the
 * road ribbon draws, so running wide brushes the verge and leaving the
 * road properly finds the forest. */
const TREE_ROAD_CLEAR = ROAD_CROSS.reach + 1;

// ── The sub-regions ───────────────────────────────────────────────────────

/** One kind of country. `forest` scales the trunk density across the whole
 * region; `groves` multiplies each community's share of the quilt inside
 * it (a community not named keeps its own weight, one at 0 never appears
 * there at all). */
export type Region = {
  id: string;
  weight: number;
  forest: number;
  groves: Record<string, number>;
};

/** The five kinds of country a taiga stage is quilted from. Lakeside and
 * river valley are deliberately NOT here: those are decided by where the
 * water actually is (the biome's contextual overrides), and a noise field
 * that put a lakeside where there is no lake would be lying. */
export const REGIONS: readonly Region[] = [
  {
    id: "denseForest",
    weight: 3,
    forest: 1.3,
    groves: {
      denseStand: 5,
      spruceWood: 3,
      oldGrowth: 2.5,
      clearing: 0.6,
      meadow: 0.1,
      logging: 0,
    },
  },
  {
    id: "openTaiga",
    weight: 3,
    forest: 0.85,
    groves: {
      pineHeath: 2,
      birchGrove: 1.6,
      meadow: 2,
      clearing: 1.6,
      denseStand: 0.2,
      logging: 0,
    },
  },
  {
    id: "logging",
    weight: 1.1,
    forest: 0.75,
    groves: {
      logging: 7,
      youngStand: 4,
      clearing: 2,
      spruceWood: 1,
      denseStand: 0.4,
      oldGrowth: 0.2,
      meadow: 0.4,
    },
  },
  {
    id: "bog",
    weight: 1.1,
    forest: 0.5,
    groves: { bog: 8, meadow: 1.4, pineHeath: 0.8, spruceWood: 0.15, denseStand: 0, logging: 0 },
  },
  {
    id: "burn",
    weight: 0.8,
    forest: 0.7,
    groves: {
      deadStand: 7,
      youngStand: 2.5,
      clearing: 1.5,
      meadow: 0.8,
      denseStand: 0,
      oldGrowth: 0,
      logging: 0,
    },
  },
];

/** Meters of region-noise period — how big one kind of country is. Several
 * hundred metres of stage, so a run crosses a handful of them. */
export const REGION_SCALE = 900;

// ── The plant communities ─────────────────────────────────────────────────

/** One plant community's PLACEMENT data: its share of the landscape (before
 * the region re-weights it) and how much of its ground carries a solid tree
 * (0 open, 1 closed forest, above 1 a wall). */
export type GroveCommunity = { id: string; weight: number; density: number };

export const GROVES: readonly GroveCommunity[] = [
  { id: "spruceWood", weight: 3, density: 1 },
  { id: "denseStand", weight: 1.4, density: 1.7 },
  { id: "pineHeath", weight: 2.5, density: 0.8 },
  { id: "birchGrove", weight: 2, density: 0.9 },
  { id: "oldGrowth", weight: 2, density: 1 },
  { id: "broadleafGrove", weight: 1.5, density: 0.85 },
  { id: "larchStand", weight: 1, density: 0.85 },
  { id: "youngStand", weight: 1.2, density: 1.35 },
  { id: "deadStand", weight: 0.8, density: 0.5 },
  { id: "clearing", weight: 1.4, density: 0.14 },
  { id: "logging", weight: 0.9, density: 0.22 },
  { id: "bog", weight: 1, density: 0.3 },
  { id: "meadow", weight: 2.5, density: 0.06 },
];

/** Meters of grove-noise period — how big one community's patch is. */
export const GROVE_SCALE = 150;

/** Meters of stand-noise period — the clumping inside ONE community. Small
 * enough that a single wood holds several of them, so the car passes a
 * closed stand, a thin patch and a hole in the space of a corner. */
const STAND_SCALE = 42;
/** The stand noise pushed to its ends: dense where it is dense, empty where
 * it is not. `base + span * n²` over uniform n has mean `base + span / 3`,
 * so these two are chosen to average exactly 1 — the clumping redistributes
 * the forest without thinning it. */
const STAND_BASE = 0.18;
const STAND_SPAN = 2.46;
/** ...and the ceiling the product of region, community and stand is held
 * to. Saturating the tree cells would put a trunk every 10 m in a straight
 * lattice, which reads as an orchard; this leaves the densest stand at
 * roughly a trunk per 130 m² — a wall, but a wall with gaps in it. */
const STAND_CEILING = 0.78;

/** One tree candidate per grid cell of this edge, m — the ceiling on how
 * dense a closed forest gets (one trunk per ~100 m²). */
const TREE_CELL = 10;
/** Chance a cell's candidate stands, at community density 1 and an average
 * stand. With the cell size this sets the ordinary closed forest at roughly
 * a trunk per 450 m² — gaps a car can thread, walls it cannot ignore. */
const TREE_DENSITY = 0.22;

// ── The deep wild's boulders and fallen trunks ────────────────────────────

/** One obstacle candidate per grid cell of this edge, m. */
const OB_CELL = 56;
/** Fraction of cells that actually hold one. */
const OB_DENSITY = 0.45;
/** Obstacles keep this far from the road centerline beyond the half-width. */
const OB_ROAD_CLEAR = 10;
/** Share of the deep wild's fallen trunks that came down in a gale and
 * still hold their root plate up on end at the butt. They are a KIND of
 * their own (`rootlog`) rather than a flag on a log: the plate stands a
 * metre and a half over a thing you could otherwise drive across, so the
 * collision shape has to know about it too. */
const ROOTED_LOG_SHARE = 0.45;

/** One loose-rock candidate per grid cell of this edge, m, and the share
 * of cells that hold one — the open ground's rock litter, a field of its
 * own because it runs much closer to the road than the deep-wild props
 * above and because most of the landscape carries some. */
const ROCK_CELL = 30;
const ROCK_DENSITY = 0.55;
/** How big a loose rock gets, as the radius of the lump before it is
 * squashed: the small end is pebble litter the field drops (see
 * SOLID_PROP_HEIGHT), the big end is a boulder that ends a run. */
const ROCK_SIZE_MIN = 0.3;
const ROCK_SIZE_MAX = 2.1;
/** Boulder fields: metres of period for the noise that says where the
 * ground sheds stone, the level it has to reach for one, and what the
 * litter there gets multiplied by. An isolated rock in a meadow reads as a
 * prop somebody placed; a slope carrying forty of them reads as geology,
 * which is the whole reason to have them. */
const BOULDER_SCALE = 130;
const BOULDER_FROM = 0.62;
const BOULDER_DENSITY = 1.7;
const BOULDER_SIZE = 1.5;
/** Share of the litter under a WOODED grove that is a cut stump rather
 * than a rock, and the size band one comes in. A stump is a round solid a
 * collision circle describes exactly, which is why the litter field grows
 * these and leaves the long fallen trunks to the deep wild. */
const STUMP_SHARE = 0.3;
const STUMP_SIZE_MIN = 0.75;
const STUMP_SIZE_MAX = 1.35;
/** Grove density at or above which the ground counts as wooded — a meadow
 * has nothing to have been felled. */
const STUMP_GROVE_DENSITY = 0.5;
/** ...and the communities that are ALL stumps whatever their density says,
 * because being cut over is what they are. */
const FELLED_GROVES = new Set(["logging", "deadStand"]);

/** One bedrock-outcrop candidate per grid cell of this edge, m — a fine
 * grid, because a slab only ever stands in the narrow band beside the
 * road where the ground is climbing out of a cut. */
const SLAB_CELL = 16;
/** ...and the share of those that stand up where the ground allows one. */
const SLAB_CHANCE = 0.7;
/** How far out from the road the wall is measured, and how far it has to
 * have climbed over the road there, m: the cut an outcrop belongs to. */
const SLAB_WALL_SPAN = 16;
const SLAB_WALL_RISE = 6;
/** How far past the road edge an outcrop's foot may sit, m. */
const SLAB_BAND = 10;

/** One timber-stack candidate per grid cell of this edge, m, and the share
 * of those that stand. Cut timber is stacked where it was cut and left for
 * the lorry, so a stack only appears on ground a logging grove owns — one
 * every few hundred metres of a logging block, which is what makes the
 * block read as one. How big one STANDS is solids.ts's (`solidShape`), like
 * every other solid. */
const TIMBER_CELL = 110;
const TIMBER_CHANCE = 0.55;

/** What the prop fields need to know about the world they stand in. Every
 * one of these is a pure seeded function of the track, so the engine and
 * the renderer each build their own field and always agree. */
export type PropContext = {
  seed: number;
  /** Road half-width, m. */
  half: number;
  /** The `trees` dial's multiplier on forest density. */
  forestScale: number;
  /** The ground the car RIDES — props stand on the lattice surface, not on
   * the analytic field, or they hover a step above what is drawn. */
  groundAt: (x: number, z: number) => number;
  /** Distance to the stage centerline and which sample it came from. */
  roadNear: (x: number, z: number) => { d: number; index: number } | null;
  /** Where a stage sample stands — the slab field's cut-wall probe. */
  sampleAt: (index: number) => { x: number; z: number; elevation: number };
  /** Distance past the mat edge of the nearest abandoned branch (R17). */
  spurClearance: (x: number, z: number) => number;
  /** True when a point is inside a stream valley, with margin. */
  inAnyStream: (x: number, z: number, margin: number) => boolean;
  /** R14 — the corner guards, whose groves grow trunks of their own. */
  guards: GuardField;
};

export type PropField = {
  obstaclesNear: (x: number, z: number, r: number) => WildObstacle[];
  treesNear: (x: number, z: number, r: number) => WildObstacle[];
  groveAt: (x: number, z: number) => number;
  regionAt: (x: number, z: number) => number;
  /** Take a solid OUT of the world — a trunk the car snapped, a rock it
   * knocked flying. Felling is part of the RUN, not of the seed. */
  fell: (ob: WildObstacle) => void;
  /** Forget every validated candidate — the road has moved under them. */
  invalidate: () => void;
};

/** Per-region grove weights, resolved once against the GROVES order so the
 * quilt's inner loop reads an array rather than a record lookup. */
const REGION_GROVES: number[][] = REGIONS.map((region) =>
  GROVES.map((grove) => grove.weight * (region.groves[grove.id] ?? 1)),
);
const REGION_GROVE_TOTAL: number[] = REGION_GROVES.map((weights) =>
  weights.reduce((sum, w) => sum + w, 0),
);
const REGION_TOTAL = REGIONS.reduce((sum, r) => sum + r.weight, 0);

export function createPropField(ctx: PropContext): PropField {
  const { groundAt, roadNear, sampleAt, spurClearance, inAnyStream, half, guards } = ctx;

  // ── The quilt ─────────────────────────────────────────────────────────
  // Both lookups wobble their sample point before snapping it to a cell, so
  // borders meander through the landscape instead of running cell-straight.
  const regionSeed = (ctx.seed ^ 0x27d4eb2f) >>> 0;
  const regionAt = (x: number, z: number): number => {
    const wx = x + (valueNoise(x, z, 300, regionSeed + 1) - 0.5) * 460;
    const wz = z + (valueNoise(z, x, 330, regionSeed + 2) - 0.5) * 460;
    let t =
      hash2(Math.floor(wx / REGION_SCALE), Math.floor(wz / REGION_SCALE), regionSeed) *
      REGION_TOTAL;
    for (let i = 0; i < REGIONS.length; i++) {
      t -= REGIONS[i].weight;
      if (t <= 0) return i;
    }
    return REGIONS.length - 1;
  };

  const groveSeed = (ctx.seed ^ 0x9e3779b9) >>> 0;
  const groveAt = (x: number, z: number): number => {
    const wx = x + (valueNoise(x, z, 47, groveSeed + 1) - 0.5) * 70;
    const wz = z + (valueNoise(z, x, 53, groveSeed + 2) - 0.5) * 70;
    const region = regionAt(x, z);
    const weights = REGION_GROVES[region];
    let t =
      hash2(Math.floor(wx / GROVE_SCALE), Math.floor(wz / GROVE_SCALE), groveSeed) *
      REGION_GROVE_TOTAL[region];
    for (let i = 0; i < GROVES.length; i++) {
      t -= weights[i];
      if (t <= 0) return i;
    }
    return GROVES.length - 1;
  };

  const standSeed = (ctx.seed ^ 0x6b43a9b5) >>> 0;
  /** How thick the trees stand at this exact spot, as a multiple of the
   * community's own density — the closed stands and the holes between
   * them. Averages 1 over the landscape, so this clusters the forest
   * without thinning it. */
  const standDensity = (x: number, z: number): number => {
    const n = valueNoise(x, z, STAND_SCALE, standSeed);
    return STAND_BASE + STAND_SPAN * n * n;
  };

  // ── Wild props: one seeded candidate per cell, validated on demand ─────
  // Validity depends on the corridor (nothing solid on or near the road),
  // so the caches clear whenever new road streams in.

  // What the car has taken down. Keyed by position, because that is the one
  // thing every field's props agree on — and the caches are dropped and
  // rebuilt as the road streams, so the flag cannot live on the prop.
  const felled = new Set<string>();
  const propKey = (ob: WildObstacle): string => `${ob.x.toFixed(2)},${ob.z.toFixed(2)}`;
  const fell = (ob: WildObstacle): void => {
    felled.add(propKey(ob));
  };
  const standing = (ob: WildObstacle): boolean => !felled.has(propKey(ob));

  /** True when a prop of `radius` standing here leaves the road ribbon —
   * mat, shoulder and ditch — entirely to itself. */
  const offEveryRoad = (x: number, z: number, radius: number): boolean => {
    const near = roadNear(x, z);
    if (near && near.d - radius < half + PROP_ROAD_CLEAR) return false;
    return spurClearance(x, z) - radius > PROP_ROAD_CLEAR;
  };

  const obSeed = (ctx.seed ^ 0x45d9f3b3) >>> 0;
  let obCache = new Map<string, WildObstacle | null>();

  const obstacleInCell = (cx: number, cz: number): WildObstacle | null => {
    const key = `${cx},${cz}`;
    const hit = obCache.get(key);
    if (hit !== undefined) return hit;
    if (obCache.size > 4096) obCache = new Map();
    let ob: WildObstacle | null = null;
    if (hash2(cx, cz, obSeed) < OB_DENSITY) {
      const x = (cx + 0.12 + hash2(cx, cz, obSeed + 1) * 0.76) * OB_CELL;
      const z = (cz + 0.12 + hash2(cx, cz, obSeed + 2) * 0.76) * OB_CELL;
      const near = roadNear(x, z);
      const clear = (!near || near.d > half + OB_ROAD_CLEAR) && spurClearance(x, z) > OB_ROAD_CLEAR;
      if (clear && !inAnyStream(x, z, 1)) {
        // Feet on the RIDDEN ground: the car collides against `y`, so a
        // prop planted on the analytic field could hover a step above the
        // surface the car actually drives on.
        const y = groundAt(x, z);
        if (y > LAKE_Y + 1) {
          const boulder = hash2(cx, cz, obSeed + 3) < 0.55;
          const size = 0.8 + hash2(cx, cz, obSeed + 4);
          const roll = hash2(cx, cz, obSeed + 6);
          ob = standSolid({
            x,
            z,
            y,
            kind: boulder ? "boulder" : roll < ROOTED_LOG_SHARE ? "rootlog" : "log",
            size,
            spin: hash2(cx, cz, obSeed + 5) * Math.PI * 2,
            roll,
          });
        }
      }
    }
    obCache.set(key, ob);
    return ob;
  };

  // ── Litter, boulder fields and bedrock outcrops ───────────────────────
  // The small stuff standing between the trunks: loose rocks over the open
  // ground, cut stumps under the woods, and the angular slabs that
  // shoulder out of a cut wall right beside the road. Anything the player
  // can SEE standing over the ground has to be something the player can
  // HIT — down to the middle of the hood, below which it is litter and not
  // an obstacle (SOLID_PROP_HEIGHT) and the renderer scatters it itself.

  const rockSeed = (ctx.seed ^ 0x517cc1b7) >>> 0;
  let rockCache = new Map<string, WildObstacle | null>();

  /** How stony this ground is, 0 off a boulder field and up to 1 in the
   * middle of one. The same field drives both how many stones the ground
   * sheds and how big they get, so a boulder field reads as one place
   * rather than as a patch where the dice ran hot. */
  const bouldery = (x: number, z: number): number => {
    const n = valueNoise(x, z, BOULDER_SCALE, rockSeed + 9);
    return n <= BOULDER_FROM ? 0 : (n - BOULDER_FROM) / (1 - BOULDER_FROM);
  };

  const litterInCell = (cx: number, cz: number): WildObstacle | null => {
    const key = `${cx},${cz}`;
    const hit = rockCache.get(key);
    if (hit !== undefined) return hit;
    if (rockCache.size > 8192) rockCache = new Map();
    let litter: WildObstacle | null = null;
    const x = (cx + 0.1 + hash2(cx, cz, rockSeed + 1) * 0.8) * ROCK_CELL;
    const z = (cz + 0.1 + hash2(cx, cz, rockSeed + 2) * 0.8) * ROCK_CELL;
    const field = bouldery(x, z);
    if (hash2(cx, cz, rockSeed) < ROCK_DENSITY * (1 + field * (BOULDER_DENSITY - 1))) {
      const roll = hash2(cx, cz, rockSeed + 3);
      const grove = GROVES[groveAt(x, z)];
      const cutOver = FELLED_GROVES.has(grove.id);
      const stump =
        (cutOver || hash2(cx, cz, rockSeed + 5) < STUMP_SHARE) &&
        (cutOver || grove.density >= STUMP_GROVE_DENSITY);
      const kind = stump ? "stump" : "rock";
      const size = stump
        ? STUMP_SIZE_MIN + roll * (STUMP_SIZE_MAX - STUMP_SIZE_MIN)
        : (ROCK_SIZE_MIN + roll * (ROCK_SIZE_MAX - ROCK_SIZE_MIN)) *
          (1 + field * (BOULDER_SIZE - 1));
      const { radius, height } = solidShape(kind, size);
      // Under the middle of the hood it is not an obstacle at all: the
      // renderer scatters that litter itself and the car rides over it.
      if (height >= SOLID_PROP_HEIGHT && offEveryRoad(x, z, radius) && !inAnyStream(x, z, radius)) {
        const y = groundAt(x, z);
        if (y > LAKE_Y + 1) {
          litter = standSolid({
            x,
            z,
            y,
            kind,
            size,
            spin: hash2(cx, cz, rockSeed + 4) * Math.PI * 2,
            roll,
          });
        }
      }
    }
    rockCache.set(key, litter);
    return litter;
  };

  const slabSeed = (ctx.seed ^ 0x2545f491) >>> 0;
  let slabCache = new Map<string, WildObstacle | null>();

  const slabInCell = (cx: number, cz: number): WildObstacle | null => {
    const key = `${cx},${cz}`;
    const hit = slabCache.get(key);
    if (hit !== undefined) return hit;
    if (slabCache.size > 8192) slabCache = new Map();
    let slab: WildObstacle | null = null;
    if (hash2(cx, cz, slabSeed) < SLAB_CHANCE) {
      const x = (cx + 0.15 + hash2(cx, cz, slabSeed + 1) * 0.7) * SLAB_CELL;
      const z = (cz + 0.15 + hash2(cx, cz, slabSeed + 2) * 0.7) * SLAB_CELL;
      const near = roadNear(x, z);
      const edge = near ? near.d - half : Infinity;
      // Only in the band beside the road, and only where the ground out
      // there is still climbing hard — an outcrop is the cut wall showing
      // through, not a rock dropped in a meadow.
      if (near && edge > PROP_ROAD_CLEAR && edge < PROP_ROAD_CLEAR + SLAB_BAND) {
        const s = sampleAt(near.index);
        const dd = Math.hypot(x - s.x, z - s.z) || 1;
        const outX = (x - s.x) / dd;
        const outZ = (z - s.z) / dd;
        const wall = groundAt(x + outX * SLAB_WALL_SPAN, z + outZ * SLAB_WALL_SPAN) - s.elevation;
        if (wall >= SLAB_WALL_RISE) {
          // Big where the wall is big — but never so big that the slab
          // reaches back over the ribbon it stands beside.
          const grow = 1.6 + hash2(cx, cz, slabSeed + 3) * (1.8 + Math.min(wall, 14) * 0.12);
          const size = Math.min(grow, (edge - PROP_ROAD_CLEAR) / 0.85);
          const { radius } = solidShape("slab", size);
          if (size > 1 && offEveryRoad(x, z, radius) && !inAnyStream(x, z, radius)) {
            const y = groundAt(x, z);
            if (y > LAKE_Y + 1) {
              slab = standSolid({
                x,
                z,
                y,
                kind: "slab",
                size,
                spin: hash2(cx, cz, slabSeed + 4) * Math.PI * 2,
                roll: hash2(cx, cz, slabSeed + 5),
              });
            }
          }
        }
      }
    }
    slabCache.set(key, slab);
    return slab;
  };

  // ── Human traces: the cut timber a logging block leaves behind ────────
  const timberSeed = (ctx.seed ^ 0x7feb352d) >>> 0;
  let timberCache = new Map<string, WildObstacle | null>();

  const timberInCell = (cx: number, cz: number): WildObstacle | null => {
    const key = `${cx},${cz}`;
    const hit = timberCache.get(key);
    if (hit !== undefined) return hit;
    if (timberCache.size > 2048) timberCache = new Map();
    let stack: WildObstacle | null = null;
    if (hash2(cx, cz, timberSeed) < TIMBER_CHANCE) {
      const x = (cx + 0.15 + hash2(cx, cz, timberSeed + 1) * 0.7) * TIMBER_CELL;
      const z = (cz + 0.15 + hash2(cx, cz, timberSeed + 2) * 0.7) * TIMBER_CELL;
      if (GROVES[groveAt(x, z)].id === "logging") {
        const size = 0.85 + hash2(cx, cz, timberSeed + 3) * 0.5;
        const { radius } = solidShape("timber", size);
        if (offEveryRoad(x, z, radius) && !inAnyStream(x, z, radius)) {
          const y = groundAt(x, z);
          if (y > LAKE_Y + 1.2) {
            stack = standSolid({
              x,
              z,
              y,
              kind: "timber",
              size,
              spin: hash2(cx, cz, timberSeed + 4) * Math.PI * 2,
              roll: hash2(cx, cz, timberSeed + 5),
            });
          }
        }
      }
    }
    timberCache.set(key, stack);
    return stack;
  };

  /** Collect one cell field's props within `r` of a point. */
  const gather = (
    found: WildObstacle[],
    cell: number,
    inCell: (cx: number, cz: number) => WildObstacle | null,
    x: number,
    z: number,
    r: number,
  ): void => {
    for (let cx = Math.floor((x - r - 3) / cell); cx <= Math.floor((x + r + 3) / cell); cx++) {
      for (let cz = Math.floor((z - r - 3) / cell); cz <= Math.floor((z + r + 3) / cell); cz++) {
        const ob = inCell(cx, cz);
        if (!ob || !standing(ob)) continue;
        const dx = ob.x - x;
        const dz = ob.z - z;
        if (dx * dx + dz * dz <= (r + ob.radius) * (r + ob.radius)) found.push(ob);
      }
    }
  };

  const obstaclesNear = (x: number, z: number, r: number): WildObstacle[] => {
    const found: WildObstacle[] = [];
    gather(found, OB_CELL, obstacleInCell, x, z, r);
    gather(found, ROCK_CELL, litterInCell, x, z, r);
    gather(found, SLAB_CELL, slabInCell, x, z, r);
    gather(found, TIMBER_CELL, timberInCell, x, z, r);
    return found;
  };

  // ── The forest: one seeded trunk candidate per tree cell ───────────────
  const treeSeed = (ctx.seed ^ 0x1d2c6fe1) >>> 0;
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
    const chance = Math.min(
      STAND_CEILING,
      TREE_DENSITY *
        ctx.forestScale *
        REGIONS[regionAt(x, z)].forest *
        GROVES[grove].density *
        standDensity(x, z),
    );
    if (hash2(cx, cz, treeSeed) < chance) {
      const near = roadNear(x, z);
      const clear =
        (!near || near.d > half + TREE_ROAD_CLEAR) && spurClearance(x, z) > TREE_ROAD_CLEAR;
      if (clear && !inAnyStream(x, z, 1.5)) {
        // Feet on the RIDDEN lattice ground, same as the props: the trunk
        // must stand exactly on the surface the car drives.
        const y = groundAt(x, z);
        if (y > LAKE_Y + 1.2) {
          const size = 0.75 + hash2(cx, cz, treeSeed + 3) * 0.6;
          tree = standSolid({
            x,
            z,
            y,
            kind: "tree",
            size,
            spin: hash2(cx, cz, treeSeed + 4) * Math.PI * 2,
            roll: hash2(cx, cz, treeSeed + 5),
            grove,
          });
        }
      }
    }
    treeCache.set(key, tree);
    return tree;
  };

  // The guard groves' trunks (R14): the same solid trees the forest field
  // stands, but placed by the corner they shut rather than by the quilt —
  // and never thinned by the `trees` dial or the stand noise, because a
  // corner with an open inside is a broken corner however sparse the
  // stage's woods are.
  const guardTrees = new Map<CornerGuard, WildObstacle[]>();

  const treesOfGuard = (guard: CornerGuard): WildObstacle[] => {
    const cached = guardTrees.get(guard);
    if (cached) return cached;
    const grown: WildObstacle[] = [];
    for (const sapling of guard.saplings) {
      const y = groundAt(sapling.x, sapling.z);
      if (y < LAKE_Y + 1.2) continue;
      grown.push(
        standSolid({
          x: sapling.x,
          z: sapling.z,
          y,
          kind: "tree",
          size: sapling.size,
          spin: sapling.spin,
          roll: sapling.roll,
          grove: groveAt(sapling.x, sapling.z),
        }),
      );
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
        if (!tree || !standing(tree)) continue;
        const dx = tree.x - x;
        const dz = tree.z - z;
        if (dx * dx + dz * dz <= (r + tree.radius) * (r + tree.radius)) found.push(tree);
      }
    }
    for (const guard of guards.near(x, z, r)) {
      if (guard.kind !== "grove") continue;
      for (const tree of treesOfGuard(guard)) {
        if (!standing(tree)) continue;
        const dx = tree.x - x;
        const dz = tree.z - z;
        if (dx * dx + dz * dz <= (r + tree.radius) * (r + tree.radius)) found.push(tree);
      }
    }
    return found;
  };

  const invalidate = (): void => {
    obCache = new Map();
    rockCache = new Map();
    slabCache = new Map();
    timberCache = new Map();
    treeCache = new Map();
    guardTrees.clear();
  };

  return { obstaclesNear, treesNear, groveAt, regionAt, fell, invalidate };
}
