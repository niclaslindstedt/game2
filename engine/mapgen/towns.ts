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

export type Town = {
  /** Arc position on the STAGE where the town is met: where the route
   * enters the street, or the junction the arm leaves from. */
  atS: number;
  street: TownStreet;
  /** In street order, each side interleaved as they were placed. */
  lots: Lot[];
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
  const lots = walkStreet(ctx, street, rng, { fromS, toS, n, pending: drawKinds(rng) });
  if (lots.length < T.size.min) return null;
  return {
    atS: street.atS,
    street: {
      kind: street.kind,
      end: street.end,
      fromS: street.kind === "route" ? (street.routeSpan?.fromS ?? street.fromS) : street.fromS,
      toS: street.kind === "route" ? (street.routeSpan?.toS ?? street.toS) : street.toS,
    },
    lots,
    roll,
  };
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
      const progress = lots.length / n;
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
    const lot = usable(ctx, street, at) ? tryLot(ctx, street, at, side, built, rng) : null;
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
  return { atS: at.s, side, building, pad, cars };
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
