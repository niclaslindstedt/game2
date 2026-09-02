// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// R37 — the HOMESTEADS. A stage runs through country somebody lives in,
// and every so often the proof stands off the road: a house on its own
// yard, a car or two outside it, a lane of trees down the drive that
// comes to the rally road and meets it square. Far between — a stage is a
// lonely place, and two houses in one view would be a village — but seen
// now and then on every stage, so the country reads as lived in rather
// than as a forest a road was drawn on.
//
// The engine places them, not the renderer, for the reason every solid
// thing in this world is placed here: the walls and the parked cars are
// things a car stops against, the drive is a road the physics gives gravel
// grip and the terrain flattens a shelf under, and the forest has to keep
// off both. The renderer only DRAWS what is decided here — which house, in
// which paint, under which roof, is a plan it reads off the record rather
// than a roll of its own.
//
// A drive is a `SpurLine`: the same shape as an abandoned branch (R17)
// minus everything a branch is about — it does not leave the map, it is
// not the far arm of a road the route turned off, and it is not shut
// because the rally goes the other way but because it is somebody's yard.
// So it lives in its own list on the track, not among the branches, and
// the analysis that judges a branch by whether it gets out of the country
// never sees one.

import { hash2, smooth } from "../lib/noise.ts";
import { createRng, type Rng } from "../lib/prng.ts";
import {
  buildingSolids,
  drawHousePlan,
  parkedSolids,
  type Building,
  type ParkedCar,
} from "./buildings.ts";
import type { BridgeDeck, Surface } from "./compile.ts";
import { farmSolids, placeFarm, type Farm } from "./farms.ts";
import type { LandField } from "./land.ts";
import { corridorOffset, ROAD_CROSS } from "./road.ts";
import { STAGE_RULES as R } from "./rules.ts";
import { standSolid, type WildObstacle } from "./solids.ts";
import {
  placeBlock,
  SPUR,
  type RoadBlock,
  type ShelfBand,
  type SpurLine,
  type SpurSample,
} from "./spurs.ts";

export type { BuildingKind, HousePlan, ParkedCar, RoofKind, WallPaint } from "./buildings.ts";
export type { Farm } from "./farms.ts";

function clamp01(t: number): number {
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

/** One of the lane trees along the drive. Solid — it is a tree — and `roll`
 * picks the species in the app, from the short list of what somebody
 * plants along a drive. */
export type LaneTree = {
  x: number;
  z: number;
  y: number;
  size: number;
  roll: number;
};

export type Homestead = {
  /** Arc position on the stage where the drive leaves it. */
  atS: number;
  /** Which side of the road the house is on: +1 right of travel. */
  side: -1 | 1;
  /** The drive, from the stage's centerline to the middle of the yard. */
  drive: SpurLine;
  /** The yard: a disc of graded gravel the drive runs onto and the house
   * stands on. The terrain flattens the ground to `y` inside `radius`. */
  yard: { x: number; z: number; y: number; radius: number };
  /** The house: where it stands, which way its FRONT faces, and what it is. */
  house: Building;
  cars: ParkedCar[];
  trees: LaneTree[];
  /** Where the drive is shut, just off the stage. Null on the rare drive
   * that leaves no room for a barrier to stand clear of the route. */
  block: RoadBlock | null;
  /** R37 — what makes this homestead a FARM: the barn, the paddock and
   * its stock, the field, the machinery. Null on a house that is only a
   * house, and everywhere in a country that is not farmed. */
  farm: Farm | null;
};

/** Everything the placer has to ask about the country. Functions rather
 * than the compiler's own state so the module can be driven from a test
 * with a flat rig as easily as from a compiled stage. */
export type HomesteadContext = {
  seed: number;
  /** The stage's nominal full width, m. */
  width: number;
  /** R40 — what a bladed road in this country is made of: the drive is one. */
  loose: Surface;
  /** R40 — whether the country is FARMED: whether a homestead may be a
   * farm at all. */
  farms: boolean;
  /** The route's samples, in stage order. */
  samples: readonly HomesteadSample[];
  /** Half-open range of sample indices whose slots may be placed on this
   * call: everything before `from` was decided on an earlier call, and
   * everything from `to` on is still moving. */
  from: number;
  to: number;
  /** R25 — where the finish gate stands, or null. */
  finishS: number | null;
  land: LandField;
  /** Distance from a point to the nearest piece of ROUTE, exempting the
   * road within a junction's parting of `meet` when `ignoring` is set —
   * the same field a branch is steered by. */
  routeDistance: (meet: {
    x: number;
    z: number;
  }) => (x: number, z: number, ignoring?: boolean) => number;
  /** Distance to the nearest abandoned branch, m (Infinity when none). */
  branchDistance: (x: number, z: number) => number;
  /** Distance to the nearest public road's centerline, m (Infinity when none). */
  highwayDistance: (x: number, z: number) => number;
  /** R23 + R31 — the band a road may stand in here without its shelf
   * becoming a wall beside the stage. */
  shelfBand: (x: number, z: number) => ShelfBand;
  /** R39 — distance to the nearest town lot's pad, m (Infinity when the
   * stage has no town). A homestead is a house on its own; one standing at
   * the end of a village street is a house in the village. */
  townDistance: (x: number, z: number) => number;
  /** The homesteads already standing — this stage's own, from every
   * earlier call. */
  placed: readonly Homestead[];
};

/** The slice of a track sample the placer reads — a `RoadShape` with a
 * position, so the drive's mouth can be laid on the road's own
 * cross-section. */
export type HomesteadSample = {
  x: number;
  z: number;
  heading: number;
  elevation: number;
  s: number;
  curvature: number;
  bank: number;
  flat: number;
  jump: boolean;
  deck: BridgeDeck | null;
  surface: Surface;
  lift: number;
  width: number;
  shift?: number;
};

const H = R.homestead;

/** Place every homestead whose slot falls in `[from, to)`. Deterministic in
 * the seed and the route; an endless stage calls it once per append with a
 * moving window and gets the same houses it would have got in one call,
 * because a slot is decided by its own arc position and by what stands
 * before it, never by how the road was chunked. */
export function placeHomesteads(ctx: HomesteadContext): Homestead[] {
  const { samples } = ctx;
  if (ctx.to <= ctx.from || samples.length === 0) return [];
  const out: Homestead[] = [];
  const gate = (ctx.seed ^ 0x6d0a7c3b) >>> 0;
  /** The last homestead's arc position — the spacing floor is measured
   * from whichever is nearer: one placed on an earlier call, or one placed
   * a moment ago on this one. */
  let lastAtS = ctx.placed.length > 0 ? ctx.placed[ctx.placed.length - 1].atS : -Infinity;
  const all: Homestead[] = [...ctx.placed];
  const firstSlot = Math.ceil(samples[ctx.from].s / H.slot);
  const endS = samples[Math.min(ctx.to, samples.length) - 1].s;
  let index = ctx.from;
  for (let slot = firstSlot; slot * H.slot < endS; slot++) {
    const s = slot * H.slot;
    // The dice first, and cheaply: most slots roll nothing.
    if (hash2(slot, 0, gate) >= H.slot / H.spacing.mean) continue;
    if (s - lastAtS < H.spacing.min) continue;
    if (s < H.keepOff.start) continue;
    if (ctx.finishS !== null && s > ctx.finishS - H.keepOff.finish) continue;
    while (index + 1 < samples.length && samples[index + 1].s <= s) index++;
    // A drive leaves a STRAIGHT, from open gravel or tarmac: not off a
    // corner, not off a bridge, not off a jump's ramp, not out of a
    // junction's platform (R17) and not out of a ford. The slot is a
    // window, not a point — the straightest piece of road in it is where
    // the drive comes down, and a slot that is all corner rolls nothing.
    let at: HomesteadSample | null = null;
    const last = Math.min(ctx.to, samples.length) - 1;
    const finishLimit = ctx.finishS === null ? Infinity : ctx.finishS - H.keepOff.finish;
    for (let i = index; i <= last && samples[i].s < s + H.slot; i++) {
      const here = samples[i];
      if (here.s > finishLimit) break;
      if (Math.abs(here.curvature) > 1 / H.straight) continue;
      if (here.flat > 0 || here.jump) continue;
      if (Math.abs(here.bank) > 0.02) continue;
      if (nearCrossing(samples, i)) continue;
      if (!at || Math.abs(here.curvature) < Math.abs(at.curvature)) at = here;
    }
    if (!at) continue;
    const rng = createRng((ctx.seed ^ 0x3b9a4f11 ^ Math.imul(slot, 2654435761)) >>> 0);
    const first: 1 | -1 = rng.chance(0.5) ? 1 : -1;
    const length = rng.range(H.drive.length.min, H.drive.length.max);
    // R37 — a FARM or a house: rolled off the slot's own dice so a country
    // that is not farmed draws the same houses in the same places.
    const farm = ctx.farms && hash2(slot, 1, gate) < H.farm.chance;
    // Both sides get a try, the dice's first, and then both again with the
    // shortest drive there is: a house is where the country lets one stand,
    // the far side of the road is as good a place as the near one, and a
    // yard that will not fit at the end of a long lane often fits at the
    // end of a short one.
    const homestead =
      tryHomestead(ctx, at, first, rng, all, length, farm) ??
      tryHomestead(ctx, at, -first as 1 | -1, rng, all, length, farm) ??
      tryHomestead(ctx, at, first, rng, all, H.drive.length.min, farm) ??
      tryHomestead(ctx, at, -first as 1 | -1, rng, all, H.drive.length.min, farm);
    if (!homestead) continue;
    out.push(homestead);
    all.push(homestead);
    // Where it actually STANDS, not the slot it was rolled in. The drive
    // comes down at the straightest sample in the slot's window, which is
    // up to `slot` metres past `s` — so gating the next roll on `s` let two
    // houses end up `slot` closer together than `spacing.min` allows. It is
    // what `lastAtS` is initialised from a few lines up, and the rule reads
    // on the built stage rather than on the dice.
    lastAtS = homestead.atS;
  }
  return out;
}

/** Is there a ford or a bridge within `keepOff.water` of this sample along
 * the stage? A drive's shelf beside the road there would fill the channel
 * the water runs through (R18). */
function nearCrossing(samples: readonly HomesteadSample[], index: number): boolean {
  const s = samples[index].s;
  for (let i = index; i < samples.length && samples[i].s - s <= H.keepOff.water; i++) {
    if (samples[i].surface === "water" || samples[i].deck !== null) return true;
  }
  for (let i = index; i >= 0 && s - samples[i].s <= H.keepOff.water; i--) {
    if (samples[i].surface === "water" || samples[i].deck !== null) return true;
  }
  return false;
}

/** Drive the lane out from the road on one side and see whether a yard
 * fits at the end of it. Null where the country says no. */
function tryHomestead(
  ctx: HomesteadContext,
  at: HomesteadSample,
  side: 1 | -1,
  rng: Rng,
  standing: readonly Homestead[],
  /** How far the drive runs before the yard, m. */
  length: number,
  /** R37 — whether this is to be a farm, with the bigger yard a barn needs. */
  farm = false,
): Homestead | null {
  const drive = H.drive;
  // The drive leaves SQUARE: a right turn off the road is the road's
  // heading plus a quarter turn (`rightOf` in the renderer says the same).
  let heading = at.heading + (side * Math.PI) / 2;
  const yardBand = farm ? H.farm.yard.radius : H.yard.radius;
  const yardRadius = rng.range(yardBand.min, yardBand.max);
  const routeNear = ctx.routeDistance({ x: at.x, z: at.z });
  /** The ROUTE's corridor plus the drive's own: how much room a piece of
   * drive needs from any route that is not the road it is leaving. */
  const corridor = ctx.width / 2 + ROAD_CROSS.reach + drive.width / 2 + ROAD_CROSS.reach;
  const clear = (x: number, z: number): boolean =>
    routeNear(x, z, true) >= corridor &&
    ctx.branchDistance(x, z) >= drive.clear + drive.width &&
    ctx.highwayDistance(x, z) >= drive.clear + ctx.width &&
    !ctx.land.flooded(x, z, SPUR.shoreFreeboard) &&
    ctx.townDistance(x, z) >= H.apart &&
    standing.every((h) => Math.hypot(h.yard.x - x, h.yard.z - z) >= H.apart);

  const follow = 1 - Math.exp(-SPUR.step / R.elevation.follow.lag);
  const samples: SpurSample[] = [];
  let x = at.x;
  let z = at.z;
  let y = at.elevation;
  let curvature = 0;
  let nextBend = drive.straight;
  /** How far out the road's own cross-section reaches: its mat, then the
   * shoulder and the verge the ribbon draws (R16). */
  const lip = at.width / 2 + ROAD_CROSS.reach;
  /** How far out the stage's verge cone starts to have an opinion (R31):
   * its bench, plus the slack the band's strided walk carries. */
  const bench = Math.max(ctx.width / 2 + ROAD_CROSS.reach, R.verge.bench) + SPUR.step * 2;
  for (let s = 0; s <= length; s += SPUR.step) {
    // Across the road's own corridor the drive is not a road of its own: it
    // lies ON the road's cross-section, crown to shoulder to verge, so the
    // mouth is the stage's camber and not a flat mat laid over it with a
    // lip where the two disagree.
    if (s <= lip) y = at.elevation + corridorOffset(at, side * s, at.width);
    samples.push({ x, z, heading, elevation: y, s, surface: ctx.loose, lift: 0, flat: 0 });
    // Past the road's own shoulder the drive is on its own, and every
    // metre of it has to be somewhere a road could go.
    if (s > ctx.width / 2 + ROAD_CROSS.reach && !clear(x, z)) return null;
    if (s >= nextBend) {
      curvature = rng.range(-1 / drive.minRadius, 1 / drive.minRadius);
      nextBend = s + drive.bend;
    }
    heading += curvature * SPUR.step;
    x += Math.sin(heading) * SPUR.step;
    z += Math.cos(heading) * SPUR.step;
    // R34 — and it follows the country at the route's own lag, inside a
    // track's grade, and never outside the stage's verge cone (R31).
    const want = y + (ctx.land.heightAt(x, z) - y) * follow;
    const cap = drive.maxGrade * SPUR.step;
    y = Math.max(y - cap, Math.min(y + cap, want));
    // ...but only once it is PAST the stage's bench. Inside it the band is
    // degenerate — the cone has no swing there, so the road's own grade
    // puts its floor over its ceiling — and clamping to it snapped the
    // drive three quarters of a metre down one step past the lip, onto the
    // lowest nearby crown: a step across the rank the analysis could see
    // from a kilometre up. Inside the bench the ground IS the stage's
    // cross-section, and the drive has just been laid on it.
    if (s > bench) {
      const band = ctx.shelfBand(x, z);
      if (y > band.ceiling) y = band.ceiling;
      if (y < band.floor) y = Math.min(band.floor, band.ceiling);
    }
  }

  // The yard is centred on the drive's end, at the height the drive
  // arrived at — and it has to be a place a yard could be graded: the bare
  // ground all over it near enough to that level that the pad is neither a
  // cliff nor a pit, none of it wet, and none of it another road's.
  const end = samples[samples.length - 1];
  const forward = { x: Math.sin(end.heading), z: Math.cos(end.heading) };
  const right = { x: Math.cos(end.heading), z: -Math.sin(end.heading) };
  /** The points the yard is judged at: its centre, and two rings. */
  const probes: { x: number; z: number; h: number }[] = [
    { x: end.x, z: end.z, h: ctx.land.heightAt(end.x, end.z) },
  ];
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    for (const r of [yardRadius * 0.55, yardRadius]) {
      const px = end.x + Math.cos(a) * r;
      const pz = end.z + Math.sin(a) * r;
      probes.push({ x: px, z: pz, h: ctx.land.heightAt(px, pz) });
    }
  }
  // The yard is graded to the country's own mean level across it, not to
  // whatever height the drive happened to arrive at — a pad cut into the
  // middle of the ground it sits on is half a metre of fill and half a
  // metre of cut, where a pad held at the lane's height is all one or the
  // other. Within the grade the last stretch of drive can make up, that is.
  const mean = probes.reduce((sum, p) => sum + p.h, 0) / probes.length;
  const reach = drive.maxGrade * (yardRadius + H.yard.blend);
  const level = Math.max(end.elevation - reach, Math.min(end.elevation + reach, mean));
  const yard = { x: end.x, z: end.z, y: level, radius: yardRadius };
  for (const p of probes) {
    if (!clear(p.x, p.z)) return null;
    if (Math.abs(p.h - yard.y) > H.yard.level) return null;
    const band = ctx.shelfBand(p.x, p.z);
    if (yard.y > band.ceiling || yard.y < band.floor) return null;
  }
  // The drive runs ONTO the yard: its last stretch is eased onto the pad's
  // level so the two are one piece of ground rather than a ramp meeting a
  // table. The ease is the same width the terrain fades the pad's rim over.
  for (const sample of samples) {
    const d = Math.hypot(sample.x - yard.x, sample.z - yard.z);
    if (d <= yardRadius) sample.elevation = yard.y;
    else if (d < yardRadius + H.yard.blend) {
      const t = smooth(clamp01((d - yardRadius) / H.yard.blend));
      sample.elevation = yard.y * (1 - t) + sample.elevation * t;
    }
  }

  const plan = drawHousePlan(rng);
  // The house stands at the back of the yard facing the way the car comes
  // in, its front wall set back from the drive's end so the yard in front
  // of it is a yard and not a step.
  const back = yardRadius * H.house.setBack;
  const house = {
    x: yard.x + forward.x * back,
    z: yard.z + forward.z * back,
    y: yard.y,
    heading: end.heading + Math.PI,
    plan,
  };

  // The cars: beside the drive's last stretch, nosed toward the house the
  // way a car is left in a yard, one on the near side and the second, when
  // there is one, on the far.
  const cars: ParkedCar[] = [];
  const count = rng.chance(H.cars.two) ? 2 : 1;
  const bay = drive.width / 2 + 2.4;
  const firstSide = rng.chance(0.5) ? 1 : -1;
  for (let i = 0; i < count; i++) {
    const lateral = i === 0 ? firstSide : -firstSide;
    const backOff = -yardRadius * 0.15 - rng.range(0, 3);
    const nose = rng.range(-0.35, 0.35);
    cars.push({
      x: yard.x + right.x * bay * lateral + forward.x * backOff,
      z: yard.z + right.z * bay * lateral + forward.z * backOff,
      y: yard.y,
      heading: end.heading + nose,
      roll: rng.next(),
    });
  }

  // R37 — the farm, when this is one: the barn across the yard from the
  // house, and the paddock, the field and the machinery round it. A yard
  // the barn will not fit on is a house after all.
  const farmed = farm
    ? placeFarm({
        rng,
        yard,
        forward,
        right,
        heading: end.heading,
        houseDepth: plan.depth,
        land: ctx.land,
        clear,
      })
    : null;

  // The barrier across the drive's mouth: the first place up the drive
  // where the whole line of it clears the route — measured against the
  // WHOLE route, junction exemption and all, exactly as a branch's is.
  const line: SpurLine = { atS: at.s, samples, width: drive.width };
  const whole = ctx.routeDistance({ x: 0, z: 0 });
  const block = placeBlock(line, (px, pz) => whole(px, pz, false), ctx.width / 2, ctx.seed, 7);

  // The lane: a tree every so many metres down both sides, from just past
  // the barrier to the yard's rim — never inside the route's corridor,
  // never in the water. Past the barrier, because a barrier is a sign and a
  // tree in front of a sign is a sign nobody reads.
  const trees: LaneTree[] = [];
  const treeFrom = (block ? block.s : SPUR.block.from) + 8;
  for (const flank of [-1, 1] as const) {
    let s = treeFrom + rng.range(0, H.trees.spacing.min * 0.5);
    while (s < length) {
      const sample = sampleAtS(samples, s);
      const offset = drive.width / 2 + rng.range(H.trees.offset.min, H.trees.offset.max);
      const rx = Math.cos(sample.heading);
      const rz = -Math.sin(sample.heading);
      const tx = sample.x + rx * offset * flank;
      const tz = sample.z + rz * offset * flank;
      s += rng.range(H.trees.spacing.min, H.trees.spacing.max);
      if (Math.hypot(tx - yard.x, tz - yard.z) < yardRadius + 1.5) break;
      if (routeNear(tx, tz, false) < ctx.width / 2 + ROAD_CROSS.reach + 2) continue;
      if (ctx.land.flooded(tx, tz, 0.5)) continue;
      trees.push({
        x: tx,
        z: tz,
        y: ctx.land.heightAt(tx, tz),
        size: rng.range(H.trees.size.min, H.trees.size.max),
        roll: rng.next(),
      });
    }
  }

  return { atS: at.s, side, drive: line, yard, house, cars, trees, block, farm: farmed };
}

/** The sample at arc position `s`, or the last one past the end. */
function sampleAtS(samples: SpurSample[], s: number): SpurSample {
  const i = Math.min(samples.length - 1, Math.max(0, Math.round(s / SPUR.step)));
  return samples[i];
}

/** R37 — everything about a homestead the car can HIT, as solids: the
 * house's walls as a run of bays round its footprint, a parked car as two,
 * and the lane trees as the trunks they are. One function, read by the
 * terrain field that collides them and by any test that wants to know where
 * the walls are. */
export function homesteadSolids(
  h: Homestead,
  /** The ground as the terrain field shapes it, once the yard and the drive
   * are in it — where the solids' feet actually stand. The record's own
   * heights are the bare country's, which the yard has since flattened. */
  groundAt: (x: number, z: number) => number = (_x, _z) => NaN,
): WildObstacle[] {
  const out: WildObstacle[] = [];
  buildingSolids(h.house, groundAt, out);
  parkedSolids(h.cars, groundAt, out);
  if (h.farm) farmSolids(h.farm, groundAt, out);
  for (const tree of h.trees) {
    const y = groundAt(tree.x, tree.z);
    out.push(
      standSolid({
        x: tree.x,
        z: tree.z,
        y: Number.isNaN(y) ? tree.y : y,
        kind: "tree",
        size: tree.size,
        spin: 0,
        roll: tree.roll,
      }),
    );
  }
  return out;
}
