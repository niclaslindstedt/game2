// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// R39 — THE TOWNS. A public road was laid to reach somewhere (R17), and
// every so often the somewhere is on the stage: a small town of ten to
// twenty buildings standing along the sealed road on both sides of it, each
// on its own graded lot with its front to the street. The rally either
// drives straight through it — the town stands on the tarmac the route
// BORROWS, which is where a stage through a village comes from — or meets
// it at the junction where the route leaves the road, where the town stands
// along the arm the tape shuts, so the road the rally does not take can be
// seen going somewhere.
//
// The engine places it, for the reason it places the homesteads (R37): the
// walls and the parked cars are things a car stops against, the lots are
// pads the terrain grades level with the street, and the forest and the
// crowd have to keep off both. The renderer only DRAWS what is decided here
// — which building, in which paint, under which roof, is a plan it reads
// off the record rather than a roll of its own.
//
// A town is a VILLAGE, not a row of farms. Most of it is houses, but it has
// what a farm has not — a block of flats, a grocery, the post office, the
// workshop that fixes the cars — and those stand in the middle of it, where
// a village keeps its shops. The buildings are drawn from the same plan
// vocabulary the homesteads use (`buildings.ts`), with a village's own
// distribution over it.

import { hash2 } from "../lib/noise.ts";
import { createRng, type Rng } from "../lib/prng.ts";
import {
  buildingSolids,
  drawTownPlan,
  parkedSolids,
  type Building,
  type BuildingKind,
  type ParkedCar,
} from "./buildings.ts";
import type { HomesteadSample } from "./homesteads.ts";
import type { Highway } from "./highway.ts";
import { GROUND_CELL } from "./lattice.ts";
import type { LandField } from "./land.ts";
import { corridorOffset, ROAD_CROSS, type RoadShape } from "./road.ts";
import { STAGE_RULES as R } from "./rules.ts";
import type { WildObstacle } from "./solids.ts";
import { SPUR, type ShelfBand, type Spur } from "./spurs.ts";

const T = R.town;

/** One building's lot on the street. */
export type Lot = {
  /** Arc position along the STREET the lot fronts, m. */
  atS: number;
  /** Which side of the street: +1 right of the street's direction. */
  side: -1 | 1;
  /** The building: where its footprint's centre is, which way its front
   * faces (toward the street), and what it is. */
  building: Building;
  /** How far the building's centre stands from the STREET's centreline, m
   * — unsigned; `side` says which way. What the town's platform is sized
   * from, and the one measurement of a lot that is about the street rather
   * than about the ground. */
  lateral: number;
  /** The graded pad it stands on: a disc the terrain grades to the plane
   * through `y` — the level of the street's own verge beside it — falling
   * along the street at the street's own `grade` (m per m, as a vector in
   * the ground plane), so the lot and the road it fronts agree along the
   * whole of the lot's frontage rather than at one point of it. */
  pad: { x: number; z: number; y: number; radius: number; grade: { x: number; z: number } };
  /** The cars outside, on the front yard between the verge and the wall. */
  cars: ParkedCar[];
};

/** Which piece of sealed road a town stands on. `route` is the borrowed
 * run the rally drives, with `fromS..toS` in ROUTE arc; `arm` is an
 * abandoned branch (`track.spurs`, found by the junction's `atS` and its
 * `end`), with `fromS..toS` in the BRANCH's own arc. */
export type TownStreet = {
  kind: "route" | "arm";
  end?: "entry" | "exit";
  fromS: number;
  toS: number;
};

/** R39 — THE GROUND THE VILLAGE STANDS ON: the street's own shelf, held
 * level out past the back of the deepest lot on each side for the whole
 * length of the town, and eased back onto the country past that.
 *
 * ONE band for the whole town, rather than the pad a lot is drawn on. The
 * drawn ground's corners are `GROUND_CELL` apart and a lot's pad is about
 * that across, so graded a disc at a time the flattening falls BETWEEN the
 * corners: it never reaches the surface anyone stands on, and every house
 * on the street ends up on the country's own slope instead of on its plot —
 * half of them hanging in the air over it and half of them buried in it. A
 * band tens of metres wide and hundreds long is carried by the same corners
 * exactly, which is also what the place looks like: a village street is
 * level from the kerb to the back gardens, and the country starts again
 * behind them. */
export type TownPlatform = {
  /** The street's centreline through the town, at `platform.step` metres,
   * each point carrying the level the ground is graded to on either side of
   * it — the street's own verge level there, which is exactly what a lot's
   * pad is graded to. Two levels rather than one because a street with any
   * cross-fall left in it stands higher on one verge than the other. */
  spine: {
    x: number;
    z: number;
    /** The level the ground is graded to on either side of the street. */
    right: number;
    left: number;
    /** ...and how far the band reaches on either side here, m: past the
     * back of the deepest lot on that side and then a lattice cell
     * further, so the corners the ground under a back wall is
     * interpolated from are themselves on the level — cut short of
     * anything the band may not shape. It may not shape the ground
     * another ROAD stands on (R23: a road is drawn on its own shelf, and
     * a village's level laid over one walls its edge in), nor a
     * homestead's yard, nor the water. */
    outRight: number;
    outLeft: number;
  }[];
  /** The widest the band gets on either side, m — what a bounding box and
   * a cheap rejection are built from. */
  right: number;
  left: number;
  /** How far out the street's own drawn corridor reaches, m. The band
   * carries its two verge levels across the street over this, so the
   * level is one continuous function of where you stand rather than two
   * that meet at a step down the centreline — and it runs UNDER the mat
   * for the same reason it runs past the back gardens: the corners the
   * ground beside a front wall is interpolated from are a lattice cell
   * away, and some of them are under the road. Nothing is lost under
   * there — a road's ribbon is drawn over its own tiles and the car rides
   * the ribbon (R16) — and the tiles no longer sag away from the verge as
   * a ditch, which along a village street is a kerb instead. */
  lip: number;
  /** How far past the band's rim the country is eased back onto it, m. */
  blend: number;
};

export type Town = {
  /** Arc position on the STAGE where the town is met: where the route
   * enters the street, or the junction the arm leaves from. */
  atS: number;
  street: TownStreet;
  /** In street order, each side interleaved as they were placed. */
  lots: Lot[];
  /** The one piece of graded ground the whole town stands on. */
  platform: TownPlatform;
  /** A roll for what the plan does not dictate — the town's name, say. */
  roll: number;
};

/** The slice of a sample the placer reads: a road's cross-section with a
 * position and a bend — the route's own sample, or a branch's dressed up
 * as one. */
export type StreetSample = RoadShape & {
  x: number;
  z: number;
  heading: number;
  elevation: number;
  s: number;
  curvature: number;
  /** Full road width here, m. */
  width: number;
  jump?: boolean;
};

/** Everything the placer has to ask about the country. Functions rather
 * than the compiler's own state, so the module can be driven from a test
 * with a flat rig as easily as from a compiled stage. */
export type TownContext = {
  seed: number;
  /** The stage's nominal full width, m. */
  width: number;
  /** The route's samples, in stage order. */
  samples: readonly HomesteadSample[];
  /** Half-open range of sample indices settled since the last call:
   * everything before `from` was decided on an earlier call, and everything
   * from `to` on is still moving. */
  from: number;
  to: number;
  /** R25 — where the finish gate stands, or null. */
  finishS: number | null;
  endless: boolean;
  land: LandField;
  /** The abandoned branches built so far, and the junctions they leave. */
  spurs: readonly Spur[];
  junctions: readonly { x: number; z: number; s: number }[];
  /** Distance from a point to the nearest piece of ROUTE, m, leaving out
   * the route between `except.fromS` and `except.toS` — the street itself,
   * when the street is the route. */
  routeDistance: (x: number, z: number, except?: { fromS: number; toS: number }) => number;
  /** Distance to the nearest abandoned branch other than `except`, m. */
  branchDistance: (x: number, z: number, except?: Spur) => number;
  /** The public road under a point (within a road's width of it), if any,
   * and the distance to the nearest public road other than `except`. */
  highwayAt: (x: number, z: number) => Highway | null;
  highwayDistance: (x: number, z: number, except?: Highway) => number;
  /** R23 + R31 — the band ground may stand in here without becoming a wall
   * beside the stage. */
  shelfBand: (x: number, z: number) => ShelfBand;
  /** Distance to the nearest homestead's yard, m (Infinity when none). */
  homesteadDistance: (x: number, z: number) => number;
  /** The towns already standing on this stage, from every earlier call. */
  placed: readonly Town[];
};

/** A candidate street, whichever road it is on. */
type Street = {
  kind: "route" | "arm";
  end?: "entry" | "exit";
  /** Where on the stage the town would be met. */
  atS: number;
  samples: readonly StreetSample[];
  /** Arc bounds on the street inside which a lot may stand. */
  fromS: number;
  toS: number;
  /** The branch the street is, when it is one. */
  spur?: Spur;
  /** The route's own arc the street occupies, when it is the route. */
  routeSpan?: { fromS: number; toS: number };
  highway: Highway | null;
  /** A roll that decides whether a street the stage only meets gets a town. */
  roll: number;
};

/** Place every town whose street is settled in `[from, to)`. Returns the
 * towns and the sample index the next call should resume from — a paved
 * run still open at `to` is not decided until it closes, so an endless
 * stage sees the same town whether the road was chunked before or after
 * it. Deterministic in the seed and the route. */
export function placeTowns(ctx: TownContext): { towns: Town[]; scanned: number } {
  const { samples } = ctx;
  if (ctx.to <= ctx.from || samples.length === 0) return { towns: [], scanned: ctx.from };
  const towns: Town[] = [];
  const all: Town[] = [...ctx.placed];
  let scanned = ctx.to;
  const candidates: Street[] = [];

  // The borrowed runs: every stretch of sealed route that starts in the
  // window. One that has not ended by the window's edge is left for the
  // next call, which starts again from a junction's parting before its
  // first sample — so the arm at the junction the run begins at is decided
  // in the same call as the run, in the same order, whichever call it is.
  for (let i = ctx.from; i < ctx.to; i++) {
    if (samples[i].surface !== "asphalt") continue;
    let j = i;
    while (j < samples.length && samples[j].surface === "asphalt") j++;
    if (j >= ctx.to && ctx.endless) {
      scanned = i;
      const backS = samples[i].s - R.junction.parting;
      while (scanned > ctx.from && samples[scanned - 1].s >= backS) scanned--;
      break;
    }
    const run = samples.slice(i, j).map(routeSample);
    const street = routeStreet(ctx, run, i);
    if (street) candidates.push(street);
    i = j;
  }
  // The arms: the abandoned branch at every junction and both at every
  // crossing whose meeting point is in the window.
  const fromS = samples[ctx.from].s;
  const toS = samples[Math.min(scanned, samples.length) - 1].s;
  for (const spur of ctx.spurs) {
    if (spur.atS < fromS || spur.atS > toS) continue;
    const street = armStreet(ctx, spur);
    if (street) candidates.push(street);
  }
  // In STAGE order, so a stream chunked any way decides them in the same
  // order as one call does. At one junction the run the rally drives
  // comes before the arm it does not; and of the two arms the one the
  // route LEAVES the road at comes first — it runs on ahead of the driver,
  // and a town down it is the town they are looking at as the stage turns
  // off, where the arm at a joining junction is behind them.
  const order = (s: Street): number =>
    s.atS + (s.kind === "route" ? -1 : s.end === "exit" ? 0 : 0.5);
  candidates.sort((a, b) => order(a) - order(b));

  for (const street of candidates) {
    // R39 — one town on a stage; on an endless one, one every `spacing`.
    if (!ctx.endless && all.length >= T.perStage) break;
    const last = all.length > 0 ? all[all.length - 1].atS : -Infinity;
    if (ctx.endless && street.atS - last < T.spacing) continue;
    if (street.kind === "arm" && street.roll >= T.armChance) continue;
    const rng = createRng(
      (ctx.seed ^ 0x51a7e2d9 ^ Math.imul(Math.round(street.atS * 4), 2246822519)) >>> 0,
    );
    const town = tryTown(ctx, street, rng);
    if (!town) continue;
    towns.push(town);
    all.push(town);
  }
  return { towns, scanned };
}

function routeSample(s: HomesteadSample): StreetSample {
  return {
    x: s.x,
    z: s.z,
    heading: s.heading,
    elevation: s.elevation,
    s: s.s,
    curvature: s.curvature,
    width: s.width,
    surface: s.surface,
    deck: s.deck,
    lift: s.lift,
    bank: s.bank,
    flat: s.flat,
    shift: s.shift,
    jump: s.jump,
  };
}

/** A borrowed run as a street: the run itself, kept off the stage's two
 * ends the way a homestead is (R2, R25). */
function routeStreet(ctx: TownContext, run: StreetSample[], index: number): Street | null {
  if (run.length < 2) return null;
  const first = run[0];
  const last = run[run.length - 1];
  if (last.s - first.s < T.street.min) return null;
  let fromS = Math.max(first.s, R.homestead.keepOff.start);
  let toS = last.s;
  if (ctx.finishS !== null) toS = Math.min(toS, ctx.finishS - R.homestead.keepOff.finish);
  if (toS - fromS < T.street.min) return null;
  const mid = run[Math.floor(run.length / 2)];
  return {
    kind: "route",
    atS: first.s,
    samples: run,
    fromS,
    toS,
    routeSpan: { fromS: first.s, toS: last.s },
    highway: ctx.highwayAt(mid.x, mid.z),
    roll: hash2(index, 1, ctx.seed ^ 0x2f6e1b3d),
  };
}

/** An abandoned arm as a street: from past its barrier and the junction's
 * own ground out to `street.reach`, dressed in the road's cross-section
 * (a branch is never banked, and its width is the main road's). */
function armStreet(ctx: TownContext, spur: Spur): Street | null {
  if (spur.samples.length < 2) return null;
  const width = spur.width;
  const samples: StreetSample[] = spur.samples.map((s, i, arr) => {
    const next = arr[Math.min(i + 1, arr.length - 1)];
    const prev = arr[Math.max(i - 1, 0)];
    const ds = next.s - prev.s;
    let turn = next.heading - prev.heading;
    while (turn > Math.PI) turn -= 2 * Math.PI;
    while (turn <= -Math.PI) turn += 2 * Math.PI;
    return {
      x: s.x,
      z: s.z,
      heading: s.heading,
      elevation: s.elevation,
      s: s.s,
      curvature: ds > 0 ? turn / ds : 0,
      width,
      surface: s.surface,
      lift: s.lift,
      flat: s.flat,
    };
  });
  const end = samples[samples.length - 1].s;
  const fromS = Math.max(R.junction.parting, (spur.block?.s ?? SPUR.block.from) + 12);
  const toS = Math.min(end, T.street.reach);
  if (toS - fromS < T.street.min) return null;
  const mid = samples[Math.floor(samples.length / 4)];
  return {
    kind: "arm",
    end: spur.end,
    atS: spur.atS,
    samples,
    fromS,
    toS,
    spur,
    highway: ctx.highwayAt(mid.x, mid.z),
    roll: hash2(Math.round(spur.atS), spur.end === "entry" ? 2 : 3, ctx.seed ^ 0x2f6e1b3d),
  };
}

/** The village's kinds cut down to what a street of `n` buildings can
 * carry and still be mostly houses: the shops first, then the rest in the
 * order they were drawn, never more than a house short of half the
 * street. The kinds were drawn for the count the dry walk promised, and a
 * street walked again for a smaller count keeps a village's shape by
 * giving up its villas before its post office. */
function fitKinds(
  kinds: { kind: BuildingKind; at: number }[],
  n: number,
): { kind: BuildingKind; at: number }[] {
  const room = Math.max(0, Math.floor(n / 2) - 1);
  const shops = kinds.filter((k) => k.kind === "grocery" || k.kind === "post");
  const rest = kinds.filter((k) => k.kind !== "grocery" && k.kind !== "post");
  return [...shops, ...rest].slice(0, room).sort((a, b) => a.at - b.at);
}

/** R39 — whether a shop stands in an END QUARTER of the village as built:
 * a grocery or a post office at either end of the street is what the
 * placement by share of the count exists to prevent. */
function shopsOffCentre(lots: Lot[]): boolean {
  let from = Infinity;
  let to = -Infinity;
  for (const lot of lots) {
    if (lot.atS < from) from = lot.atS;
    if (lot.atS > to) to = lot.atS;
  }
  const span = Math.max(1, to - from);
  return lots.some((lot) => {
    const kind = lot.building.plan.kind;
    if (kind !== "grocery" && kind !== "post") return false;
    const t = (lot.atS - from) / span;
    return t < 0.25 || t > 0.75;
  });
}

/** The buildings a town gets that are not houses, each with WHERE along
 * the street it belongs as a share of the street's length: the shops in
 * the middle, the flats either side of them, the workshop out toward one
 * end, the villas wherever the dice put them. Sorted by place; the placer
 * takes each one as the rows reach its place, and houses fill the rest.
 * A place rather than a slot, because how many buildings a street ends up
 * holding is not known until it has been walked. */
function drawKinds(rng: Rng): { kind: BuildingKind; at: number }[] {
  const out: { kind: BuildingKind; at: number }[] = [];
  const draw = (kind: keyof typeof T.kinds, places: number[]): void => {
    const rule = T.kinds[kind];
    let chance = rule.chance;
    for (let i = 0; i < rule.max; i++) {
      if (!rng.chance(chance)) break;
      out.push({ kind, at: places[i % places.length] });
      chance *= 0.5;
    }
  };
  draw("grocery", [0.42]);
  draw("post", [0.48]);
  draw("apartments", [0.28, 0.62]);
  draw("workshop", [rng.chance(0.5) ? 0.06 : 0.8]);
  draw("villa", [rng.range(0, 0.85), rng.range(0, 0.85), rng.range(0, 0.85)]);
  return out.sort((a, b) => a.at - b.at);
}

/** Whether a lot may front the street at this sample: sealed, open road on
 * a sweep — not a junction's platform, not a mouth, not a bridge, not a
 * lip — clear of every junction's own ground. */
function usable(ctx: TownContext, street: Street, sample: StreetSample): boolean {
  if (sample.surface !== "asphalt") return false;
  if ((sample.flat ?? 0) > 0 || (sample.shift ?? 0) !== 0) return false;
  if (sample.deck != null || sample.jump) return false;
  if (Math.abs(sample.curvature) > 1 / T.street.minRadius) return false;
  if (Math.abs(sample.bank ?? 0) > 0.03) return false;
  if (sample.s < street.fromS || sample.s > street.toS) return false;
  for (const j of ctx.junctions) {
    if (Math.hypot(j.x - sample.x, j.z - sample.z) < R.junction.parting) return false;
  }
  return true;
}

/** The street sample nearest an arc position. */
function sampleAtS(samples: readonly StreetSample[], s: number): StreetSample {
  let lo = 0;
  let hi = samples.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (samples[mid].s < s) lo = mid + 1;
    else hi = mid;
  }
  if (lo > 0 && s - samples[lo - 1].s < samples[lo].s - s) lo--;
  return samples[lo];
}

/** Stand a town along a street, or find that the street will not hold one. */
function tryTown(ctx: TownContext, street: Street, rng: Rng): Town | null {
  const roll = rng.next();
  // The street a lot may actually front: between the first and the last
  // sample that is open, sealed, sweeping road clear of the junctions.
  const open = street.samples.filter((s) => usable(ctx, street, s));
  if (open.length === 0) return null;
  const fromS = open[0].s;
  const toS = open[open.length - 1].s;
  if (toS - fromS < T.street.min) return null;
  // How many the street will actually hold is only known once it has been
  // walked — the country refuses lots a street's length cannot predict —
  // and the shops have to stand in the middle of what gets built rather
  // than of what was hoped for. So the street is walked TWICE: once with
  // houses on its own dice to count what fits, then for real, with the
  // village's kinds placed by their share of that count.
  const dry = walkStreet(ctx, street, createRng((ctx.seed ^ 0x1c9b7d3f) >>> 0), {
    fromS,
    toS,
    n: T.size.max,
    pending: [],
  });
  const n = Math.min(rng.int(T.size.min, T.size.max), dry.length);
  if (n < T.size.min) return null;
  const kinds = drawKinds(rng);
  let lots = walkStreet(ctx, street, rng, { fromS, toS, n, pending: [...kinds] });
  // ...and again when the shops did not land in the middle. The real walk
  // stands a block of flats and two villas where the dry one stood houses,
  // and meets refusals the dry one did not: it falls short of `n`, so a
  // shop placed by its share of `n` comes due late, and a lot the country
  // refuses moves the shop further along still, until the post office
  // stands second from the end of the village. Walked again for what
  // fitted, on fresh dice, it is usually back in the middle; a street that
  // will not stand its shops in the middle on three tries stands none, a
  // village being a row of houses before it is anything else.
  for (const salt of [0x3d1f9a5b, 0x5e2c7b19]) {
    if (lots.length < T.size.min || !shopsOffCentre(lots)) break;
    const again = walkStreet(ctx, street, createRng((ctx.seed ^ salt) >>> 0), {
      fromS,
      toS,
      n: lots.length,
      pending: fitKinds(kinds, lots.length),
    });
    if (again.length >= T.size.min) lots = again;
  }
  if (lots.length >= T.size.min && shopsOffCentre(lots)) {
    const houses = kinds.filter((k) => k.kind !== "grocery" && k.kind !== "post");
    const again = walkStreet(ctx, street, createRng((ctx.seed ^ 0x71a3e4d7) >>> 0), {
      fromS,
      toS,
      n: lots.length,
      pending: fitKinds(houses, lots.length),
    });
    if (again.length >= T.size.min) lots = again;
  }
  if (lots.length < T.size.min) return null;
  // ...and on BOTH sides of it. A street whose one side the country
  // refused every lot on — a hillside, a shore, the route's own corridor
  // running close behind it — is a row of houses looking across the road
  // at a field: a lane, not a village (R39). The walk lets a side stall
  // out so the other can go on filling; this is where that has to add up.
  if (!lots.some((lot) => lot.side === 1) || !lots.some((lot) => lot.side === -1)) return null;
  return {
    atS: street.atS,
    street: {
      kind: street.kind,
      end: street.end,
      fromS: street.kind === "route" ? (street.routeSpan?.fromS ?? street.fromS) : street.fromS,
      toS: street.kind === "route" ? (street.routeSpan?.toS ?? street.toS) : street.toS,
    },
    lots,
    platform: platformFor(ctx, street, lots),
    roll,
  };
}

/** How far the back of a lot stands from the street's centreline, m: past
 * the building's own back wall, and past the WING's when it has one — a
 * villa's L reaches half its depth again behind the block, which is the
 * corner that used to hang in the air. */
function lotReach(lot: Lot): number {
  const plan = lot.building.plan;
  return lot.lateral + plan.depth / 2 + (plan.wing?.depth ?? 0);
}

/** R39 — the one graded band the town stands on: the street's own verge
 * level, held out past the back of the deepest lot on each side and a
 * lattice cell further still, over the whole frontage and a lattice cell
 * past either end of it. Both margins are the lattice's, because what the
 * band exists to beat is the lattice: a corner inside the rim carries a
 * level part-way back to the country, and the ground under a back wall is
 * interpolated from corners a cell away. */
function platformFor(ctx: TownContext, street: Street, lots: Lot[]): TownPlatform {
  const P = T.platform;
  /** Past the last house, and past the deepest one: a whole lattice cell,
   * so no corner the town stands on is in the rim. */
  const spare = GROUND_CELL + P.margin;
  let wantRight = 0;
  let wantLeft = 0;
  let fromS = Infinity;
  let toS = -Infinity;
  for (const lot of lots) {
    const reach = lotReach(lot) + spare;
    if (lot.side > 0) wantRight = Math.max(wantRight, reach);
    else wantLeft = Math.max(wantLeft, reach);
    const half = lot.building.plan.width / 2 + spare;
    fromS = Math.min(fromS, lot.atS - half);
    toS = Math.max(toS, lot.atS + half);
  }
  /** ...and how far the band MUST reach at one point of the street whatever
   * else is in the way: a lattice cell past the back of any lot standing
   * THERE. Nothing may narrow it there — the margin on the lattice is not a
   * nicety, it is the whole mechanism — and nothing has to, because a lot is
   * only ever stood where that much ground behind it was clear (`tryLot`).
   * Asked of the whole town rather than of the piece of street it is asked
   * about, this floor would hold the band at its full width along stretches
   * with no house on them at all, which is exactly where a road it should
   * have kept off is. */
  const needAt = (s: number, side: 1 | -1): number => {
    let need = 0;
    for (const lot of lots) {
      if (lot.side !== side) continue;
      if (Math.abs(lot.atS - s) > lot.building.plan.width / 2 + spare) continue;
      need = Math.max(need, lotReach(lot) + spare);
    }
    return need;
  };
  // ...but never off the end of its own street: past the last sample the
  // walk below clamps, and a spine that carried on would stand a run of
  // points on top of each other at whatever the road was doing where it
  // stopped. Where the street runs on, the band simply ends and the road's
  // own shelf takes the ground back.
  fromS = Math.max(fromS, street.samples[0].s);
  toS = Math.min(toS, street.samples[street.samples.length - 1].s);
  const spine: TownPlatform["spine"] = [];
  const steps = Math.max(1, Math.ceil((toS - fromS) / P.step));
  let lip = 0;
  let right = 0;
  let left = 0;
  for (let i = 0; i <= steps; i++) {
    const at = sampleAtS(street.samples, fromS + ((toS - fromS) * i) / steps);
    const here = at.width / 2 + ROAD_CROSS.reach;
    lip = Math.max(lip, here);
    const outRight = bandOut(ctx, street, at, 1, wantRight, needAt(at.s, 1), here);
    const outLeft = bandOut(ctx, street, at, -1, wantLeft, needAt(at.s, -1), here);
    right = Math.max(right, outRight);
    left = Math.max(left, outLeft);
    spine.push({
      x: at.x,
      z: at.z,
      right: at.elevation + corridorOffset(at, here, at.width),
      left: at.elevation + corridorOffset(at, -here, at.width),
      outRight,
      outLeft,
    });
  }
  return { spine, right, left, lip, blend: P.blend };
}

/** How far the band may reach out from one point of the street on one side,
 * m — `want`, or as far as it gets before it runs into something a
 * village's level may not be laid over, and never less than `need`.
 *
 * What it may not be laid over is everything a LOT may not stand on, for a
 * reason a lot's own placement cannot cover: the band reaches half as far
 * again past the back of the deepest house, so a route running sixty metres
 * behind the village clears every lot on it (R23) and still had the
 * village's level laid across its own shelf — which walls its edge in, and
 * is exactly what R31's cone exists to prevent. (The terrain field keeps
 * the last word on that, and gives the ground inside any other road's
 * corridor back to the road; this is what keeps the band from wanting it in
 * the first place.)
 *
 * Walked rather than solved, because the answer is a distance to whichever
 * of four different things is nearest and none of them is a straight line
 * along the street. `platform.step` again for the stride — the band's own
 * resolution — so a gap the walk skips is a gap the spine could not carry
 * anyway. */
function bandOut(
  ctx: TownContext,
  street: Street,
  at: StreetSample,
  side: 1 | -1,
  want: number,
  need: number,
  lip: number,
): number {
  /** What every piece of the band needs from any road that is not the
   * street — the ROUTE's corridor and a margin, as a lot needs (R23). */
  const corridor = ctx.width / 2 + ROAD_CROSS.reach + 1;
  const right = { x: Math.cos(at.heading), z: -Math.sin(at.heading) };
  const room = (out: number): boolean => {
    const px = at.x + right.x * side * out;
    const pz = at.z + right.z * side * out;
    return (
      ctx.routeDistance(px, pz, street.routeSpan) >= corridor &&
      ctx.branchDistance(px, pz, street.spur) >= corridor &&
      ctx.highwayDistance(px, pz, street.highway ?? undefined) >= corridor &&
      ctx.homesteadDistance(px, pz) >= R.homestead.apart &&
      !ctx.land.flooded(px, pz, SPUR.shoreFreeboard)
    );
  };
  // The RIM counts as part of the reach: a band that only stops INSIDE the
  // other road's corridor has still shaped it, by however much of its
  // weight was left there — which is the road's edge walled in at over a
  // metre per metre, in the analyzer and on the screen.
  let roomTo = Infinity;
  for (let d = lip; d <= want + T.platform.blend; d += T.platform.step) {
    if (!room(d)) {
      roomTo = d;
      break;
    }
  }
  const out = roomTo === Infinity ? want : roomTo - T.platform.blend;
  return Math.min(want, Math.max(need, Math.max(0, out)));
}

/** Walk the open street from `fromS` toward `toS` standing up to `n`
 * buildings down both sides of it, the village's kinds in `pending` each
 * taken as the count reaches its share of `n`, and houses everywhere else. */
function walkStreet(
  ctx: TownContext,
  street: Street,
  rng: Rng,
  plan: { fromS: number; toS: number; n: number; pending: { kind: BuildingKind; at: number }[] },
): Lot[] {
  const { fromS, toS, n } = plan;
  const pending = [...plan.pending];
  const lots: Lot[] = [];
  /** Where each side's next front begins, in street arc. One side starts
   * a little further along so the two rows are staggered rather than
   * paired across the street. */
  const cursor: Record<1 | -1, number> = {
    1: fromS + rng.range(0, 10),
    [-1]: fromS + rng.range(0, 10),
  };
  const done: Record<1 | -1, boolean> = { 1: false, [-1]: false };
  let stalls = 0;
  /** The building waiting to be stood, and how many times the street has
   * refused it. A block of flats needs more level ground than a village
   * on a hillside has, and a kind the street will not take gives way to a
   * house rather than holding up every building behind it. */
  let held: Building["plan"] | null = null;
  let refused = 0;
  while (lots.length < n && !(done[1] && done[-1])) {
    // The side that is furthest behind takes the next building, so the
    // two rows grow together down the street.
    let side: 1 | -1 = cursor[1] <= cursor[-1] ? 1 : -1;
    if (done[side]) side = -side as 1 | -1;
    if (!held) {
      // How far down the street the walk is: by count against `n`, and by
      // ARC against the street's span, whichever is further. The count is
      // the dry walk's, drawn on houses alone, and a real walk that stands
      // a block of flats and two villas fits fewer buildings than it
      // counted — so by count alone the post office at 0.48 of a village
      // that ran out of street at twelve lots stood second from its end.
      const progress = Math.max(lots.length / n, (cursor[side] - fromS) / Math.max(1, toS - fromS));
      const due = pending.length > 0 && progress >= pending[0].at ? pending.shift() : null;
      held = drawTownPlan(rng, due ? due.kind : "house");
    }
    const built = held;
    const centreS = cursor[side] + built.width / 2;
    if (centreS + built.width / 2 > toS) {
      done[side] = true;
      continue;
    }
    const at = sampleAtS(street.samples, centreS);
    let lot = usable(ctx, street, at) ? tryLot(ctx, street, at, side, built, rng) : null;
    // ...and clear of the last building on this side, measured across the
    // ground rather than along the street: the cursor spaces the fronts by
    // their widths in arc, and on the inside of a bend two fronts a
    // building's width apart along the kerb stand closer than that. Two
    // footprints on one piece of ground is what the spacing exists to
    // rule out, so a lot the bend has closed up is refused and the walk
    // steps on.
    if (lot) {
      for (let i = lots.length - 1; i >= 0; i--) {
        const prev = lots[i];
        if (prev.side !== side) continue;
        const apart = Math.hypot(
          prev.building.x - lot.building.x,
          prev.building.z - lot.building.z,
        );
        if (apart <= (prev.building.plan.width + built.width) / 2 + T.lot.gap.min / 2) lot = null;
        break;
      }
    }
    if (!lot) {
      // Nothing fits here — try a little further along, and give up on
      // the side once it has stalled for a whole building's worth.
      cursor[side] += 6;
      if (++stalls > 40) done[side] = true;
      if (++refused >= 3) {
        held = null;
        refused = 0;
      }
      continue;
    }
    stalls = 0;
    refused = 0;
    held = null;
    lots.push(lot);
    cursor[side] += built.width + rng.range(T.lot.gap.min, T.lot.gap.max);
  }
  return lots;
}

/** Is a front yard deep enough to nose cars in off the street, rather
 * than leave them parked along it? */
function shopKind(kind: BuildingKind): boolean {
  return kind !== "house" && kind !== "villa";
}

/** Stand one building on one side of the street, or find the country will
 * not take it. */
function tryLot(
  ctx: TownContext,
  street: Street,
  at: StreetSample,
  side: 1 | -1,
  plan: Building["plan"],
  rng: Rng,
): Lot | null {
  const right = { x: Math.cos(at.heading), z: -Math.sin(at.heading) };
  const fwd = { x: Math.sin(at.heading), z: Math.cos(at.heading) };
  /** How far out the road's own cross-section reaches: its mat, then the
   * shoulder and the verge the ribbon draws (R16). */
  const lip = at.width / 2 + ROAD_CROSS.reach;
  const radius = Math.hypot(plan.width / 2, plan.depth / 2) + T.lot.margin;
  // The front yard: a shop's is deep enough to park across, a house's is
  // whatever the dice gave it — and either is at least deep enough that
  // the pad's rim stays past the verge.
  let front = shopKind(plan.kind) ? T.lot.shopFront : rng.range(T.lot.front.min, T.lot.front.max);
  front = Math.max(front, radius - plan.depth / 2 + 0.5);
  const lateral = lip + front + plan.depth / 2;
  const x = at.x + right.x * side * lateral;
  const z = at.z + right.z * side * lateral;
  // The lot is graded level with the street's own verge beside it, so the
  // front yard and the road's shoulder are one piece of ground — and it
  // falls along the street at the street's own grade, because the shoulder
  // does, and a level pad against a graded road is a step at one end of
  // the lot and a trench at the other.
  const y = at.elevation + corridorOffset(at, side * lip, at.width);
  const ahead = sampleAtS(street.samples, at.s + 6);
  const behind = sampleAtS(street.samples, at.s - 6);
  const slope =
    ahead.s > behind.s ? (ahead.elevation - behind.elevation) / (ahead.s - behind.s) : 0;
  // R39 — and a building is a box with a level floor, not a plane: a front
  // that spans the street's fall stands clear of the graded ground at one
  // end of itself and buried at the other. What the street may fall is
  // therefore whatever THIS building can carry.
  if ((Math.abs(slope) * plan.width) / 2 > T.lot.step) return null;
  const grade = { x: fwd.x * slope, z: fwd.z * slope };
  const pad = { x, z, y, radius, grade };
  /** The pad's plane at a point. */
  const planeAt = (px: number, pz: number): number => y + grade.x * (px - x) + grade.z * (pz - z);

  /** The ROUTE's corridor plus a margin: how much room every piece of the
   * lot needs from any road that is not the street. */
  const corridor = ctx.width / 2 + ROAD_CROSS.reach + 1;
  const except = street.routeSpan;
  const clear = (px: number, pz: number): boolean =>
    ctx.routeDistance(px, pz, except) >= corridor &&
    ctx.branchDistance(px, pz, street.spur) >= corridor &&
    ctx.highwayDistance(px, pz, street.highway ?? undefined) >= corridor &&
    ctx.homesteadDistance(px, pz) >= R.homestead.apart &&
    !ctx.land.flooded(px, pz, SPUR.shoreFreeboard);
  /** The points the lot is judged at: its centre and two rings. */
  const probes: { x: number; z: number }[] = [{ x, z }];
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    for (const r of [radius * 0.5, radius]) {
      probes.push({ x: x + Math.cos(a) * r, z: z + Math.sin(a) * r });
    }
  }
  // ...and the BACK GARDEN — the ground the town's PLATFORM has to grade
  // behind this building, out to a lattice cell past its deepest wall
  // (`platformFor`), the wing included, since that is what reaches
  // furthest back. Every ROAD has to be clear of it, because the terrain
  // gives a road back the ground inside its own corridor whatever the band
  // wanted (R23), and a band that narrows behind a house leaves the ground
  // under its back wall interpolated from corners out in the country —
  // which is the flying house, arrived at by another route. Only the roads:
  // the band stops at the water and at a yard too, but nothing gives THOSE
  // the ground back, so the level still reaches the wall.
  const garden = plan.depth / 2 + (plan.wing?.depth ?? 0) + GROUND_CELL + T.platform.margin;
  for (const along of [-plan.width / 2, 0, plan.width / 2]) {
    for (const back of [(plan.depth / 2 + garden) / 2, garden]) {
      const px = x + fwd.x * along + right.x * side * back;
      const pz = z + fwd.z * along + right.z * side * back;
      if (
        ctx.routeDistance(px, pz, except) < corridor ||
        ctx.branchDistance(px, pz, street.spur) < corridor ||
        ctx.highwayDistance(px, pz, street.highway ?? undefined) < corridor
      ) {
        return null;
      }
    }
  }
  /** How far out the stage's verge cone starts to have an opinion (R31):
   * its bench, plus the slack the band's strided walk carries. Inside it
   * the ground IS the street's own shelf, which is the level the pad is
   * graded to; the band there is degenerate (a graded road puts its floor
   * over its ceiling) and says nothing a lot can use. */
  const bench = Math.max(ctx.width / 2 + ROAD_CROSS.reach, R.verge.bench) + SPUR.step * 2;
  for (const p of probes) {
    if (!clear(p.x, p.z)) return null;
    const out = Math.abs((p.x - at.x) * right.x + (p.z - at.z) * right.z);
    if (out <= bench) continue;
    // Past the bench the country has its say. The cone (R31) is the most
    // the ground can stand above the pad there — a bank behind the house,
    // which may be a bank and not a cliff — and the bare land is the least
    // it can fall to, which may be a slope and not a drop.
    const band = ctx.shelfBand(p.x, p.z);
    const bank = Math.min(band.ceiling, ctx.land.heightAt(p.x, p.z)) - y;
    const drop = y - ctx.land.heightAt(p.x, p.z);
    if (bank > T.lot.level || drop > T.lot.level) return null;
  }

  const building: Building = {
    x,
    z,
    y,
    heading: at.heading - (side * Math.PI) / 2,
    plan,
  };

  // The cars outside: nosed in toward a shop, whose front yard is deep
  // enough to park across; along the street outside a house.
  const cars: ParkedCar[] = [];
  const band = T.cars[plan.kind];
  const count = rng.int(band.min, band.max);
  const noseIn = front >= T.lot.shopFront - 0.5;
  const pitch = noseIn ? T.cars.pitch : 5.8;
  const carLateral = noseIn ? lip + 3.4 : lip + 2.4;
  const spanAlong = Math.max(0, plan.width - 2);
  const most = Math.max(0, Math.floor(spanAlong / pitch));
  const placed = Math.min(count, most);
  const first = -((placed - 1) * pitch) / 2 + rng.range(-1, 1);
  for (let i = 0; i < placed; i++) {
    const along = first + i * pitch;
    const cx = x + fwd.x * along - right.x * side * (lateral - carLateral);
    const cz = z + fwd.z * along - right.z * side * (lateral - carLateral);
    cars.push({
      x: cx,
      z: cz,
      y: planeAt(cx, cz),
      heading: noseIn
        ? at.heading + (side * Math.PI) / 2 + rng.range(-0.12, 0.12)
        : at.heading + (rng.chance(0.5) ? 0 : Math.PI),
      roll: rng.next(),
    });
  }
  return { atS: at.s, side, building, lateral, pad, cars };
}

/** R39 — everything about a town the car can HIT, as solids: every
 * building's walls as a run of bays round its footprint and every parked
 * car as two. Read by the terrain field that collides them and by any test
 * that wants to know where the walls are. */
export function townSolids(
  town: Town,
  /** The ground as the terrain field shapes it once the lots are in it. */
  groundAt: (x: number, z: number) => number = (_x, _z) => NaN,
): WildObstacle[] {
  const out: WildObstacle[] = [];
  for (const lot of town.lots) {
    buildingSolids(lot.building, groundAt, out);
    parkedSolids(lot.cars, groundAt, out);
  }
  return out;
}
