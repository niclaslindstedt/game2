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
import {
  SOLID_PROP_HEIGHT,
  solidShape,
  standSolid,
  type SolidKind,
  type WildObstacle,
} from "./solids.ts";

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

/** R32 — the community wet ground is always in, and how far the groundwater
 * has to stand above the surface before it takes over, m. A couple of
 * centimetres is a damp patch; this is ground you would not walk across in
 * boots, which is where the sedge and the drowned trunks belong. */
const BOG_GROVE = GROVES.findIndex((g) => g.id === "bog");
const BOG_WET = 0.05;

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

/** ...and how many trunks that one candidate grows. A cell grid puts at most
 * one trunk every ten metres, which is a spacing no forest has: even a
 * saturated stand comes out evenly spread, because the grid IS the spacing.
 * Real conifers grow in tight knots of three or four with light between the
 * knots, so a candidate is a CLUMP — its stems thrown into a couple of metres
 * around it, more of them where the stand noise is thick.
 *
 * The cell's own chance is divided by the clump's expected size, so the
 * forest holds exactly as many trunks per hectare as it did: what changes is
 * where they stand, not how many. */
const CLUMP_MAX = 4;
/** How far a clump's outer stems stand from its first one, m — closer than
 * this and two trunks are one fat trunk, further and they are two trees. */
const CLUMP_NEAR = 1.9;
const CLUMP_FAR = 4.6;

// ── The deep wild's boulders and fallen trunks ────────────────────────────

/** R32 — what the SOIL decides. A trunk needs a rooting depth (`ROOT_DEPTH`,
 * m) before a cell is forest at all; from there the stand thickens with the
 * cover, from `ROOT_THIN` of its density up to full over `ROOT_FULL` more
 * metres of soil. Bare rock keeps its moss and its grass and grows nothing
 * with a trunk, which is what puts the open ground on the ridges and the
 * mountain flanks rather than scattering it at random. */
const ROOT_DEPTH = 0.4;
const ROOT_THIN = 0.35;
const ROOT_FULL = 1.6;
/** ...and what it BURIES. Loose stone lies on the surface where the cover is
 * thin and is buried where it is deep: `SHED_BURIES` is the soil depth that
 * hides all of it, and `SHED_MIN` the share that shows anyway, because a
 * field always turns up a few. */
const SHED_BURIES = 2.6;
const SHED_MIN = 0.18;

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

/** Blowdowns: metres of period for the noise that says where a gale went
 * through this forest, the level it has to reach for one, and what the deep
 * wild's fallen timber is multiplied by inside it. A trunk down on its own is
 * a prop somebody dropped; five of them lying parallel down the same slope is
 * weather, and weather is what a boreal forest is mostly made of. */
const WINDTHROW_SCALE = 190;
const WINDTHROW_FROM = 0.56;
const WINDTHROW_DENSITY = 2.6;
/** The most trunks one candidate lays down in the middle of a blowdown, and
 * how far apart they lie ACROSS the fall line, m — far enough apart that a
 * car meets one at a time. */
const BLOWDOWN_MAX = 3;
const BLOWDOWN_GAP_MIN = 5.5;
const BLOWDOWN_GAP_MAX = 10;
/** How far apart the ground is sampled to read which way is downhill, m, and
 * the gradient below which a slope has no opinion and the gale decides. */
const FALL_SPAN = 5;
const FALL_SLOPE = 0.06;

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

/** ROCKY OUTCROPS: one candidate per grid cell of this edge, m, and the
 * share of those that carry one. A lone boulder in a field reads as a prop
 * somebody placed however well it is drawn; a knot of stone shouldering out
 * of a hillside reads as the hill itself, which is the only reason to have
 * rocks in a landscape at all. So the deep wild grows CLUSTERS: half a dozen
 * to a dozen stones bedded into one slope, biggest first, strung out along
 * the contour the way a bed of rock actually breaks surface. */
const OUTCROP_CELL = 120;
const OUTCROP_CHANCE = 0.75;
/** How many stones one outcrop is made of. */
const OUTCROP_MIN = 5;
const OUTCROP_MAX = 10;
/** How far its stones spread from its middle, m — along the contour, and
 * this much again halved up and down the slope. */
const OUTCROP_SPREAD = 8;
/** How big its stones get, smallest at the ends of the band and biggest in
 * the middle. The small end is set by what the field is ALLOWED to place: a
 * stone has to stand SOLID_PROP_HEIGHT over the ground once it is bedded in,
 * and one too small to do that is litter the renderer scatters for itself. */
const OUTCROP_SIZE_MIN = 0.8;
const OUTCROP_SIZE_MAX = 1.7;
/** The gradient the ground under one has to have. Bedrock shows where the
 * hill is steep, which is the same rule the terrain's own paint follows —
 * so an outcrop stands in ground that is already painted as rock. */
const OUTCROP_SLOPE = 0.22;
/** How deep into the hill a stone is bedded, as a share of its own height.
 * This is the whole difference between geology and litter: a rock sitting ON
 * a slope was dropped there, one sunk half its depth INTO it grew there. */
const OUTCROP_SINK = 0.45;

/** One CUT-WALL SLAB candidate per grid cell of this edge, m — a fine grid,
 * because a slab only ever stands in the narrow band beside the road where
 * the ground is climbing out of a cut. (The outcrops above are the same rock
 * out in the country; these are the face the road was cut through.) */
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
  /** R32 — how far the GROUNDWATER stands above the surface here, m: 0 on
   * dry ground, positive in a mire. What puts the bog where the water is
   * rather than where a noise field happened to roll one. */
  wetAt: (x: number, z: number) => number;
  /** R32 — how deep the SOIL is here, m. What the ground is made of decides
   * what stands on it: a tree needs something to root in, and a boulder is
   * only on the surface where there is not enough cover to have buried it.
   * Reading it here rather than inventing a second "how stony is it" noise
   * is what makes the geology visible instead of merely present. */
  soilAt: (x: number, z: number) => number;
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
    // R32 — WET GROUND OVERRULES THE QUILT. The quilt is a noise field that
    // says what KIND of country a patch is, and it has no idea where the
    // water is; a bog rolled onto a hillside is a bog nothing feeds, and a
    // spruce wood rolled onto the edge of a swamp is a wood standing in
    // water. So wherever the ground is actually within a boot's depth of
    // the water table, the community is the BOG, whatever the quilt rolled.
    // This is what makes the reeds, the sedge and the drowned trunks appear
    // where a player would expect them rather than at random.
    if (BOG_GROVE >= 0 && ctx.wetAt(x, z) > BOG_WET) return BOG_GROVE;
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

  /** Plant one deep-wild solid, if the ground here will have it: clear of
   * every road by its own RIM, out of the streams and above the water table.
   * `sink` beds it that far into the hill — the one thing that separates an
   * outcrop's stones, which the hillside grew, from rocks set down on it.
   * Everything the field decides is a pure function of the seed, so both
   * sides of the world build the same one. */
  const addSolid = (
    into: WildObstacle[],
    x: number,
    z: number,
    kind: SolidKind,
    size: number,
    spin: number,
    roll: number,
    sink = 0,
  ): void => {
    const near = roadNear(x, z);
    if (near && near.d < half + OB_ROAD_CLEAR) return;
    if (spurClearance(x, z) < OB_ROAD_CLEAR) return;
    const { radius } = solidShape(kind, size);
    if (!offEveryRoad(x, z, radius) || inAnyStream(x, z, Math.max(1, radius * 0.5))) return;
    // Feet on the RIDDEN ground: the car collides against `y`, so a prop
    // planted on the analytic field could hover a step above the surface the
    // car actually drives on.
    const y = groundAt(x, z);
    if (y <= LAKE_Y + 1) return;
    into.push(standSolid({ x, z, y: y - sink, kind, size, spin, roll }));
  };

  /** Which way the ground falls away here, and how hard. Everything that
   * came down rather than grew — a blown-over trunk, a bed of rock breaking
   * surface — is placed against this: gravity is the only art direction a
   * hillside needs. */
  const fallLine = (x: number, z: number): { x: number; z: number; slope: number } => {
    const gx = groundAt(x + FALL_SPAN, z) - groundAt(x - FALL_SPAN, z);
    const gz = groundAt(x, z + FALL_SPAN) - groundAt(x, z - FALL_SPAN);
    const run = Math.hypot(gx, gz);
    if (run < 1e-4) return { x: 1, z: 0, slope: 0 };
    return { x: -gx / run, z: -gz / run, slope: run / (2 * FALL_SPAN) };
  };

  const obSeed = (ctx.seed ^ 0x45d9f3b3) >>> 0;
  let obCache = new Map<string, WildObstacle[]>();

  /** How badly the wind has been through this wood, 0 outside a blowdown and
   * up to 1 in the middle of one — the same shape of field as `bouldery`
   * below, and for the same reason: a patch of country that reads as ONE
   * event beats dice that happened to run hot. */
  const windthrown = (x: number, z: number): number => {
    const n = valueNoise(x, z, WINDTHROW_SCALE, (obSeed + 11) >>> 0);
    return n <= WINDTHROW_FROM ? 0 : (n - WINDTHROW_FROM) / (1 - WINDTHROW_FROM);
  };

  /** The bearing a gale on this seed blew from — one for the whole stage,
   * because one storm laid all of this down. */
  const galeBearing = hash2(0, 0, (obSeed + 12) >>> 0) * Math.PI * 2;

  const obstacleInCell = (cx: number, cz: number): WildObstacle[] => {
    const key = `${cx},${cz}`;
    const hit = obCache.get(key);
    if (hit !== undefined) return hit;
    if (obCache.size > 4096) obCache = new Map();
    const found: WildObstacle[] = [];
    const x = (cx + 0.12 + hash2(cx, cz, obSeed + 1) * 0.76) * OB_CELL;
    const z = (cz + 0.12 + hash2(cx, cz, obSeed + 2) * 0.76) * OB_CELL;
    const gale = windthrown(x, z);
    if (hash2(cx, cz, obSeed) < OB_DENSITY * (1 + gale * (WINDTHROW_DENSITY - 1))) {
      // Stone is what the ground sheds and wood is what the weather takes
      // down, so a blowdown is nearly all timber even where the same country
      // is otherwise strewn with boulders.
      const boulder = hash2(cx, cz, obSeed + 3) < 0.55 * (1 - gale * 0.85);
      const roll = hash2(cx, cz, obSeed + 6);
      const spin = hash2(cx, cz, obSeed + 5) * Math.PI * 2;
      if (boulder) {
        addSolid(found, x, z, "boulder", 0.8 + hash2(cx, cz, obSeed + 4), spin, roll);
      } else {
        // Trunks lie the way they fell: down the slope where there is one,
        // and along the gale where the ground is flat. `spin` on a lying
        // kind is that BEARING — the renderer turns it into the yaw its own
        // fallen-log geometry needs (planting.ts).
        const fall = fallLine(x, z);
        const wobble = (hash2(cx, cz, obSeed + 7) - 0.5) * 0.5;
        const bearing =
          (fall.slope > FALL_SLOPE ? Math.atan2(fall.z, fall.x) : galeBearing) + wobble;
        // Across the fall line — a gale lays trunks side by side, not end to
        // end, and side by side is what a car meets one at a time.
        const acrossX = -Math.sin(bearing);
        const acrossZ = Math.cos(bearing);
        const trunks = Math.min(
          BLOWDOWN_MAX,
          1 + Math.floor(hash2(cx, cz, obSeed + 8) * (1 + gale * BLOWDOWN_MAX)),
        );
        for (let i = 0; i < trunks; i++) {
          // Strung out either side of the candidate, so a blowdown grows
          // around where a lone trunk would have lain rather than off it.
          const step = i - (trunks - 1) / 2;
          const gap =
            BLOWDOWN_GAP_MIN +
            hash2(cx * 7 + i, cz, obSeed + 9) * (BLOWDOWN_GAP_MAX - BLOWDOWN_GAP_MIN);
          const tx = x + acrossX * step * gap;
          const tz = z + acrossZ * step * gap;
          const tRoll = i === 0 ? roll : hash2(cx, cz * 7 + i, obSeed + 10);
          // Bigger in a blowdown: what a gale takes is the old trees that
          // stood clear of the canopy, and a metre-thick bole down a
          // hillside is a landmark rather than a stick.
          const size = 0.8 + hash2(cx * 13 + i, cz, obSeed + 4) + gale * 0.6;
          const kind = tRoll < ROOTED_LOG_SHARE ? "rootlog" : "log";
          addSolid(found, tx, tz, kind, size, bearing, tRoll);
        }
      }
    }
    obCache.set(key, found);
    return found;
  };

  // ── Litter, boulder fields and bedrock outcrops ───────────────────────
  // The small stuff standing between the trunks: loose rocks over the open
  // ground, cut stumps under the woods, and the angular slabs that
  // shoulder out of a cut wall right beside the road. Anything the player
  // can SEE standing over the ground has to be something the player can
  // HIT — down to the middle of the hood, below which it is litter and not
  // an obstacle (SOLID_PROP_HEIGHT) and the renderer scatters it itself.

  const rockSeed = (ctx.seed ^ 0x517cc1b7) >>> 0;
  let rockCache = new Map<string, WildObstacle[]>();

  /** How stony this ground is, 0 off a boulder field and up to 1 in the
   * middle of one. The same field drives both how many stones the ground
   * sheds and how big they get, so a boulder field reads as one place
   * rather than as a patch where the dice ran hot. */
  const bouldery = (x: number, z: number): number => {
    const n = valueNoise(x, z, BOULDER_SCALE, rockSeed + 9);
    return n <= BOULDER_FROM ? 0 : (n - BOULDER_FROM) / (1 - BOULDER_FROM);
  };

  const litterInCell = (cx: number, cz: number): WildObstacle[] => {
    const key = `${cx},${cz}`;
    const hit = rockCache.get(key);
    if (hit !== undefined) return hit;
    if (rockCache.size > 8192) rockCache = new Map();
    const found: WildObstacle[] = [];
    const x = (cx + 0.1 + hash2(cx, cz, rockSeed + 1) * 0.8) * ROCK_CELL;
    const z = (cz + 0.1 + hash2(cx, cz, rockSeed + 2) * 0.8) * ROCK_CELL;
    // R32 — stone SURFACES where the cover is thin. Deep soil has buried
    // whatever the ice left on it; a metre of till is why a Swedish forest
    // floor is soft and a Norwegian fell is a boulder field. A stump is the
    // exception: it is the remains of a tree, so it belongs wherever a tree
    // could have stood rather than wherever the rock shows.
    const field = bouldery(x, z);
    const shed = Math.max(SHED_MIN, 1 - ctx.soilAt(x, z) / SHED_BURIES);
    if (hash2(cx, cz, rockSeed) < ROCK_DENSITY * shed * (1 + field * (BOULDER_DENSITY - 1))) {
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
          found.push(
            standSolid({
              x,
              z,
              y,
              kind,
              size,
              spin: hash2(cx, cz, rockSeed + 4) * Math.PI * 2,
              roll,
            }),
          );
        }
      }
    }
    rockCache.set(key, found);
    return found;
  };

  // ── Rocky outcrops: the bedrock breaking surface, in company ─────────
  // A slab (below) is the cut wall beside the road showing through. This is
  // the same rock out in the country, and the difference that matters is
  // that it never comes alone: a bed of stone breaks surface as a knot of
  // boulders strung along the contour, half-buried, biggest in the middle.
  const outcropSeed = (ctx.seed ^ 0x9e3d7c11) >>> 0;
  let outcropCache = new Map<string, WildObstacle[]>();

  const outcropInCell = (cx: number, cz: number): WildObstacle[] => {
    const key = `${cx},${cz}`;
    const hit = outcropCache.get(key);
    if (hit !== undefined) return hit;
    if (outcropCache.size > 2048) outcropCache = new Map();
    const found: WildObstacle[] = [];
    if (hash2(cx, cz, outcropSeed) < OUTCROP_CHANCE) {
      const x = (cx + 0.15 + hash2(cx, cz, outcropSeed + 1) * 0.7) * OUTCROP_CELL;
      const z = (cz + 0.15 + hash2(cx, cz, outcropSeed + 2) * 0.7) * OUTCROP_CELL;
      const fall = fallLine(x, z);
      if (fall.slope >= OUTCROP_SLOPE) {
        // Along the contour: rock breaks surface in a band across the slope,
        // not in a line down it.
        const alongX = -fall.z;
        const alongZ = fall.x;
        const stones =
          OUTCROP_MIN +
          Math.floor(hash2(cx, cz, outcropSeed + 3) * (OUTCROP_MAX - OUTCROP_MIN + 1));
        for (let i = 0; i < stones; i++) {
          const a = hash2(cx * 31 + i, cz, outcropSeed + 4) - 0.5;
          const b = hash2(cx, cz * 31 + i, outcropSeed + 5) - 0.5;
          const sx = x + alongX * a * 2 * OUTCROP_SPREAD + fall.x * b * OUTCROP_SPREAD;
          const sz = z + alongZ * a * 2 * OUTCROP_SPREAD + fall.z * b * OUTCROP_SPREAD;
          // Biggest at the middle of the band and smaller out at its ends,
          // so the cluster has a mass rather than being a scatter of equals.
          const roll = hash2(cx * 17 + i, cz * 19 + i, outcropSeed + 6);
          const taper = Math.max(0, 1 - Math.abs(a) * 1.4);
          const size =
            OUTCROP_SIZE_MIN + (OUTCROP_SIZE_MAX - OUTCROP_SIZE_MIN) * taper * (0.55 + roll * 0.45);
          const kind: SolidKind = taper > 0.55 ? "boulder" : "rock";
          const { height } = solidShape(kind, size);
          // ...and it beds in only as far as it can while still standing
          // over that bar: an outcrop with the holes shot out of it is not
          // an outcrop, so a stone is shallower rather than absent.
          const sink = Math.max(
            0,
            Math.min(height * OUTCROP_SINK * (0.6 + roll * 0.4), height - SOLID_PROP_HEIGHT - 0.05),
          );
          addSolid(
            found,
            sx,
            sz,
            kind,
            size,
            hash2(cx + i, cz, outcropSeed + 7) * Math.PI * 2,
            roll,
            sink,
          );
        }
      }
    }
    outcropCache.set(key, found);
    return found;
  };

  const slabSeed = (ctx.seed ^ 0x2545f491) >>> 0;
  let slabCache = new Map<string, WildObstacle[]>();

  const slabInCell = (cx: number, cz: number): WildObstacle[] => {
    const key = `${cx},${cz}`;
    const hit = slabCache.get(key);
    if (hit !== undefined) return hit;
    if (slabCache.size > 8192) slabCache = new Map();
    const found: WildObstacle[] = [];
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
              found.push(
                standSolid({
                  x,
                  z,
                  y,
                  kind: "slab",
                  size,
                  spin: hash2(cx, cz, slabSeed + 4) * Math.PI * 2,
                  roll: hash2(cx, cz, slabSeed + 5),
                }),
              );
            }
          }
        }
      }
    }
    slabCache.set(key, found);
    return found;
  };

  // ── Human traces: the cut timber a logging block leaves behind ────────
  const timberSeed = (ctx.seed ^ 0x7feb352d) >>> 0;
  let timberCache = new Map<string, WildObstacle[]>();

  const timberInCell = (cx: number, cz: number): WildObstacle[] => {
    const key = `${cx},${cz}`;
    const hit = timberCache.get(key);
    if (hit !== undefined) return hit;
    if (timberCache.size > 2048) timberCache = new Map();
    const found: WildObstacle[] = [];
    if (hash2(cx, cz, timberSeed) < TIMBER_CHANCE) {
      const x = (cx + 0.15 + hash2(cx, cz, timberSeed + 1) * 0.7) * TIMBER_CELL;
      const z = (cz + 0.15 + hash2(cx, cz, timberSeed + 2) * 0.7) * TIMBER_CELL;
      if (GROVES[groveAt(x, z)].id === "logging") {
        const size = 0.85 + hash2(cx, cz, timberSeed + 3) * 0.5;
        const { radius } = solidShape("timber", size);
        if (offEveryRoad(x, z, radius) && !inAnyStream(x, z, radius)) {
          const y = groundAt(x, z);
          if (y > LAKE_Y + 1.2) {
            found.push(
              standSolid({
                x,
                z,
                y,
                kind: "timber",
                size,
                spin: hash2(cx, cz, timberSeed + 4) * Math.PI * 2,
                roll: hash2(cx, cz, timberSeed + 5),
              }),
            );
          }
        }
      }
    }
    timberCache.set(key, found);
    return found;
  };

  /** Collect one cell field's props within `r` of a point. A cell may hold
   * several — a blowdown is a handful of trunks and an outcrop a knot of
   * stones — so the reach is widened by the furthest one of those can stand
   * from the cell's own candidate. */
  const gather = (
    found: WildObstacle[],
    cell: number,
    spread: number,
    inCell: (cx: number, cz: number) => WildObstacle[],
    x: number,
    z: number,
    r: number,
  ): void => {
    const edge = r + 3 + spread;
    for (let cx = Math.floor((x - edge) / cell); cx <= Math.floor((x + edge) / cell); cx++) {
      for (let cz = Math.floor((z - edge) / cell); cz <= Math.floor((z + edge) / cell); cz++) {
        for (const ob of inCell(cx, cz)) {
          if (!standing(ob)) continue;
          const dx = ob.x - x;
          const dz = ob.z - z;
          if (dx * dx + dz * dz <= (r + ob.radius) * (r + ob.radius)) found.push(ob);
        }
      }
    }
  };

  const obstaclesNear = (x: number, z: number, r: number): WildObstacle[] => {
    const found: WildObstacle[] = [];
    gather(found, OB_CELL, BLOWDOWN_GAP_MAX * BLOWDOWN_MAX, obstacleInCell, x, z, r);
    gather(found, ROCK_CELL, 0, litterInCell, x, z, r);
    gather(found, SLAB_CELL, 0, slabInCell, x, z, r);
    gather(found, TIMBER_CELL, 0, timberInCell, x, z, r);
    gather(found, OUTCROP_CELL, OUTCROP_SPREAD * 2, outcropInCell, x, z, r);
    return found;
  };

  // ── The forest: one seeded trunk candidate per tree cell ───────────────
  const treeSeed = (ctx.seed ^ 0x1d2c6fe1) >>> 0;
  let treeCache = new Map<string, WildObstacle[]>();

  /** Stand one trunk of a clump, if the ground where it landed will have it.
   * Every stem is checked on its own account: a clump thrown across the edge
   * of a stream valley loses the stems that fell in it and keeps the rest,
   * which is what a real thicket does at a bank. */
  const addTree = (
    into: WildObstacle[],
    x: number,
    z: number,
    grove: number,
    size: number,
    spin: number,
    roll: number,
  ): void => {
    const near = roadNear(x, z);
    if (near && near.d < half + TREE_ROAD_CLEAR) return;
    if (spurClearance(x, z) < TREE_ROAD_CLEAR || inAnyStream(x, z, 1.5)) return;
    // Feet on the RIDDEN lattice ground, same as the props: the trunk must
    // stand exactly on the surface the car drives.
    const y = groundAt(x, z);
    if (y <= LAKE_Y + 1.2) return;
    into.push(standSolid({ x, z, y, kind: "tree", size, spin, roll, grove }));
  };

  const treeInCell = (cx: number, cz: number): WildObstacle[] => {
    const key = `${cx},${cz}`;
    const hit = treeCache.get(key);
    if (hit !== undefined) return hit;
    if (treeCache.size > 16384) treeCache = new Map();
    const found: WildObstacle[] = [];
    const x = (cx + 0.1 + hash2(cx, cz, treeSeed + 1) * 0.8) * TREE_CELL;
    const z = (cz + 0.1 + hash2(cx, cz, treeSeed + 2) * 0.8) * TREE_CELL;
    const grove = groveAt(x, z);
    const stand = standDensity(x, z);
    // R32 — a tree needs something to root in. Bare rock carries moss,
    // grass and flowers and nothing with a trunk; thin cover grows a
    // struggling stand; deep soil grows a wood. Below `ROOT_DEPTH` the
    // cell is simply not forest, which is what puts the open ground on the
    // ridges and the mountain flanks instead of scattering it at random.
    const soil = ctx.soilAt(x, z);
    if (soil < ROOT_DEPTH) {
      treeCache.set(key, found);
      return found;
    }
    const rooting = Math.min(1, ROOT_THIN + (soil - ROOT_DEPTH) / ROOT_FULL);
    // How many stems this candidate grows, and — because the clump has to
    // cost the landscape nothing — the number the cell's own chance is then
    // divided by. Thick ground grows the big knots; the ceiling is what
    // keeps the thickest of them a thicket rather than a hedge.
    const crowd = Math.min(stand, 3);
    const stems = Math.min(CLUMP_MAX, 1 + Math.floor(hash2(cx, cz, treeSeed + 6) * (1 + crowd)));
    const mean = 1 + (Math.min(CLUMP_MAX, 1 + crowd) - 1) / 2;
    const chance =
      Math.min(
        STAND_CEILING,
        TREE_DENSITY *
          ctx.forestScale *
          REGIONS[regionAt(x, z)].forest *
          GROVES[grove].density *
          stand *
          rooting,
      ) / mean;
    if (hash2(cx, cz, treeSeed) < chance) {
      for (let i = 0; i < stems; i++) {
        const a = hash2(cx * 29 + i, cz, treeSeed + 7) * Math.PI * 2;
        const d =
          i === 0
            ? 0
            : CLUMP_NEAR + hash2(cx, cz * 29 + i, treeSeed + 8) * (CLUMP_FAR - CLUMP_NEAR);
        // One tree of a knot is always older than the others — a clump of
        // identical stems is a hedge, and a hedge is what an even scatter
        // was trying not to be.
        const grade = i === 0 ? 1 : 0.62 + hash2(cx + i, cz + i, treeSeed + 9) * 0.4;
        addTree(
          found,
          x + Math.cos(a) * d,
          z + Math.sin(a) * d,
          grove,
          (0.75 + hash2(cx * 11 + i, cz, treeSeed + 3) * 0.6) * grade,
          hash2(cx, cz * 11 + i, treeSeed + 4) * Math.PI * 2,
          hash2(cx * 7 + i, cz * 5 + i, treeSeed + 5),
        );
      }
    }
    treeCache.set(key, found);
    return found;
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
    // A cell's stems stand up to a clump radius out from its candidate, so
    // the walk has to reach a clump further than the circle asked for.
    const edge = r + 1 + CLUMP_FAR;
    for (
      let cx = Math.floor((x - edge) / TREE_CELL);
      cx <= Math.floor((x + edge) / TREE_CELL);
      cx++
    ) {
      for (
        let cz = Math.floor((z - edge) / TREE_CELL);
        cz <= Math.floor((z + edge) / TREE_CELL);
        cz++
      ) {
        for (const tree of treeInCell(cx, cz)) {
          if (!standing(tree)) continue;
          const dx = tree.x - x;
          const dz = tree.z - z;
          if (dx * dx + dz * dz <= (r + tree.radius) * (r + tree.radius)) found.push(tree);
        }
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
    outcropCache = new Map();
    slabCache = new Map();
    timberCache = new Map();
    treeCache = new Map();
    guardTrees.clear();
  };

  return { obstaclesNear, treesNear, groveAt, regionAt, fell, invalidate };
}
