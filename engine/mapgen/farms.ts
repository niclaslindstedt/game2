// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// R37 — THE FARMS. Some of the homesteads are not a house with a car
// outside: they are the places the country is farmed from, and a farm is a
// different thing to drive past. The BARN is the biggest building on any
// stage — longer, wider and taller than the house beside it, red boards
// over a stone byre, a hayloft door up a ramp in the gable — and round it
// stand the things a farm has: a fenced PADDOCK with the stock grazing in
// it, a FIELD ploughed or cut for hay, a tractor and the gear it pulls left
// where they were last used, and sometimes a silo.
//
// The engine places it all, for the homestead's reason: the barn's walls,
// the silo, the tractor and the trailer are things a car stops against, the
// fence is a run of posts the car goes through, the paddock and the field
// are ground the forest keeps off and (a ploughed field) a surface of its
// own to the physics. The renderer only DRAWS what is decided here — the
// cows are the one exception: WHERE they may be is the paddock, and that is
// the engine's; where each one stands this second is nobody's business but
// the renderer's.
//
// Everything is laid out in the DRIVE's frame at the yard: `forward` is
// the way the car came in, `right` its right. The barn stands to one side
// of the yard with its long front to the yard's middle, the paddock behind
// the barn or behind the house, the field where the paddock is not.

import type { Rng } from "../lib/prng.ts";
import { buildingSolids, drawBarnPlan, type Building } from "./buildings.ts";
import type { LandField } from "./land.ts";
import { STAGE_RULES as R } from "./rules.ts";
import { SPUR } from "./spurs.ts";
import { standSolid, type WildObstacle } from "./solids.ts";

const F = R.homestead.farm;

/** A rectangle on the ground: `heading` is the direction its WIDTH runs
 * (the frame's +z), `depth` runs across it (the frame's +x, `rightOf`). */
export type FarmRect = { x: number; z: number; heading: number; width: number; depth: number };

export type Stock = "cows" | "sheep";

/** A fenced paddock with animals in it. */
export type Paddock = {
  rect: FarmRect;
  stock: Stock;
  /** How many animals graze it — the renderer stands that many up. */
  head: number;
  /** Every fence post, round the rect with the gate's gap left out. The
   * renderer strings the rails between neighbours. */
  posts: { x: number; z: number }[];
  /** The gate in the fence: where it hangs, and the direction ALONG the
   * fence line there. */
  gate: { x: number; z: number; heading: number };
  /** A roll for what the plan does not dictate — the breed, say. */
  roll: number;
};

export type Crop = "plough" | "stubble" | "hay";

/** A field: ploughed dark, cut to stubble, or standing hay with the round
 * bales the baler left across it. */
export type CropField = {
  rect: FarmRect;
  crop: Crop;
  bales: { x: number; z: number; heading: number }[];
};

export type GearKind = "tractor" | "trailer" | "plough" | "harrow" | "baler";

/** A machine standing where it was left. `roll` picks its paint and its
 * make in the app. */
export type FarmGear = {
  kind: GearKind;
  x: number;
  z: number;
  y: number;
  heading: number;
  roll: number;
};

export type Farm = {
  barn: Building;
  /** A tower silo beside the barn's gable, or none. */
  silo: { x: number; z: number; y: number; radius: number; height: number } | null;
  paddock: Paddock | null;
  field: CropField | null;
  gear: FarmGear[];
};

/** Everything the farm placer has to ask about the country and the yard it
 * is being laid on. */
export type FarmSite = {
  rng: Rng;
  yard: { x: number; z: number; y: number; radius: number };
  /** The drive's frame at the yard: the way the car arrived, and its right. */
  forward: { x: number; z: number };
  right: { x: number; z: number };
  /** The drive's heading at its end. */
  heading: number;
  /** How deep the house is, m — the paddock behind it keeps off its back wall. */
  houseDepth: number;
  land: LandField;
  /** The homestead placer's own test: may a piece of farm stand here? */
  clear: (x: number, z: number) => boolean;
};

/** The world point of a rect-local (u across, v along). */
function rectPoint(rect: FarmRect, u: number, v: number): { x: number; z: number } {
  const fwd = { x: Math.sin(rect.heading), z: Math.cos(rect.heading) };
  const right = { x: Math.cos(rect.heading), z: -Math.sin(rect.heading) };
  return { x: rect.x + right.x * u + fwd.x * v, z: rect.z + right.z * u + fwd.z * v };
}

/** Signed distance from a point to a rect's edge, m: negative inside. */
export function rectDistance(rect: FarmRect, x: number, z: number): number {
  const dx = x - rect.x;
  const dz = z - rect.z;
  const u = dx * Math.cos(rect.heading) - dz * Math.sin(rect.heading);
  const v = dx * Math.sin(rect.heading) + dz * Math.cos(rect.heading);
  const du = Math.abs(u) - rect.depth / 2;
  const dv = Math.abs(v) - rect.width / 2;
  if (du > 0 || dv > 0) return Math.hypot(Math.max(du, 0), Math.max(dv, 0));
  return Math.max(du, dv);
}

/** Is this rect somewhere a paddock or a field could be: clear of every
 * road and the water at its corners, its edges and its middle, and not so
 * far out of level across it that a fence would be a staircase. */
function rectFits(site: FarmSite, rect: FarmRect, slope: number): boolean {
  let lo = Infinity;
  let hi = -Infinity;
  for (const u of [-0.5, 0, 0.5]) {
    for (const v of [-0.5, 0, 0.5]) {
      const p = rectPoint(rect, u * rect.depth, v * rect.width);
      if (!site.clear(p.x, p.z)) return false;
      if (site.land.flooded(p.x, p.z, SPUR.shoreFreeboard)) return false;
      const h = site.land.heightAt(p.x, p.z);
      if (h < lo) lo = h;
      if (h > hi) hi = h;
    }
  }
  return hi - lo <= slope;
}

/** The two places a paddock or a field may lie: past the barn, across the
 * yard from the house; or behind the house. Each is a rect standing `gap`
 * off whatever it is behind, its width running along the thing it is
 * behind so it reads as belonging to the yard. */
function siteRect(
  site: FarmSite,
  where: "pastBarn" | "behindHouse",
  barnSide: 1 | -1,
  barnDepth: number,
  width: number,
  depth: number,
  gap: number,
): FarmRect {
  const { yard, forward, right } = site;
  if (where === "pastBarn") {
    const out = F.barn.setIn * yard.radius + barnDepth + gap + depth / 2;
    // Its width runs AWAY from the road: the near end level with the
    // yard's own back half, the rest out into the country behind, so a
    // long field never reaches back into the stage's corridor.
    const along = width / 2 - yard.radius * 0.4;
    return {
      x: yard.x + right.x * barnSide * out + forward.x * along,
      z: yard.z + right.z * barnSide * out + forward.z * along,
      heading: site.heading,
      width,
      depth,
    };
  }
  const out = R.homestead.house.setBack * yard.radius + site.houseDepth / 2 + gap + depth / 2;
  return {
    x: yard.x + forward.x * out,
    z: yard.z + forward.z * out,
    heading: site.heading + Math.PI / 2,
    width,
    depth,
  };
}

/** The fence round a paddock: a post every `postPitch` metres of perimeter
 * from one corner round to it again, with the gate's gap left in the side
 * nearest the yard. */
function fence(
  site: FarmSite,
  rect: FarmRect,
): { posts: { x: number; z: number }[]; gate: Paddock["gate"] } {
  const P = F.paddock;
  const hw = rect.width / 2;
  const hd = rect.depth / 2;
  const corners: [number, number][] = [
    [-hd, -hw],
    [hd, -hw],
    [hd, hw],
    [-hd, hw],
  ];
  // Which side faces the yard: the one whose midpoint is nearest it.
  let gateSide = 0;
  let nearest = Infinity;
  for (let k = 0; k < 4; k++) {
    const a = corners[k];
    const b = corners[(k + 1) % 4];
    const mid = rectPoint(rect, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
    const d = Math.hypot(mid.x - site.yard.x, mid.z - site.yard.z);
    if (d < nearest) {
      nearest = d;
      gateSide = k;
    }
  }
  const posts: { x: number; z: number }[] = [];
  let gate: Paddock["gate"] = { x: rect.x, z: rect.z, heading: rect.heading };
  for (let k = 0; k < 4; k++) {
    const a = corners[k];
    const b = corners[(k + 1) % 4];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n = Math.max(1, Math.round(len / P.postPitch));
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const u = a[0] + (b[0] - a[0]) * t;
      const v = a[1] + (b[1] - a[1]) * t;
      // The gate: a gap of `gate` metres about the side's middle.
      const along = t * len;
      if (k === gateSide && Math.abs(along - len / 2) < P.gate / 2 && i > 0) continue;
      posts.push(rectPoint(rect, u, v));
    }
    if (k === gateSide) {
      const mid = rectPoint(rect, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
      const wa = rectPoint(rect, a[0], a[1]);
      const wb = rectPoint(rect, b[0], b[1]);
      gate = { x: mid.x, z: mid.z, heading: Math.atan2(wb.x - wa.x, wb.z - wa.z) };
    }
  }
  return { posts, gate };
}

/** R37 — lay out the farm on a yard. Null where not even the barn fits;
 * otherwise a farm with whatever else the country allowed — a paddock
 * or a field can each be refused on their own. */
export function placeFarm(site: FarmSite): Farm | null {
  const { rng, yard, forward, right } = site;
  const plan = drawBarnPlan(rng);
  const barnSide: 1 | -1 = rng.chance(0.5) ? 1 : -1;
  // The barn: to one side of the yard with its long front to the middle,
  // set in from the rim so its back corners still stand on the pad.
  const setIn = F.barn.setIn * yard.radius + plan.depth / 2;
  const slide = rng.range(-0.12, 0.12) * yard.radius;
  const barn: Building = {
    x: yard.x + right.x * barnSide * setIn + forward.x * slide,
    z: yard.z + right.z * barnSide * setIn + forward.z * slide,
    y: yard.y,
    heading: site.heading - (barnSide * Math.PI) / 2,
    plan,
  };
  // Its back corners have to be somewhere a wall can stand.
  for (const v of [-1, 1]) {
    const cx = barn.x + right.x * barnSide * (plan.depth / 2) + forward.x * v * (plan.width / 2);
    const cz = barn.z + right.z * barnSide * (plan.depth / 2) + forward.z * v * (plan.width / 2);
    if (!site.clear(cx, cz)) return null;
    if (Math.abs(site.land.heightAt(cx, cz) - yard.y) > R.homestead.yard.level) return null;
  }

  // The silo, off the barn's far gable — the one away from the drive.
  let silo: Farm["silo"] = null;
  if (rng.chance(F.silo.chance)) {
    const radius = rng.range(F.silo.radius.min, F.silo.radius.max);
    const gable = plan.width / 2 + radius + 1.6;
    const x = barn.x + forward.x * gable;
    const z = barn.z + forward.z * gable;
    if (site.clear(x, z)) {
      silo = { x, z, y: yard.y, radius, height: rng.range(F.silo.height.min, F.silo.height.max) };
    }
  }

  // The paddock and the field, each in whichever of the two sites takes
  // it, the paddock choosing first.
  const P = F.paddock;
  const Fd = F.field;
  const sites: ("pastBarn" | "behindHouse")[] = rng.chance(0.5)
    ? ["pastBarn", "behindHouse"]
    : ["behindHouse", "pastBarn"];
  let paddock: Paddock | null = null;
  let field: CropField | null = null;
  const taken = new Set<string>();
  /** Where a rect of the rolled size fits: tried at each site, and at
   * each site smaller and smaller — a hillside that will not take a
   * hectare often takes half of one. */
  const fit = (
    band: { width: { min: number; max: number }; depth: { min: number; max: number } },
    gap: number,
    slope: number,
  ): { rect: FarmRect; where: "pastBarn" | "behindHouse" } | null => {
    const width = rng.range(band.width.min, band.width.max);
    const depth = rng.range(band.depth.min, band.depth.max);
    for (const scale of F.shrink) {
      for (const where of sites) {
        if (taken.has(where)) continue;
        const rect = siteRect(site, where, barnSide, plan.depth, width * scale, depth * scale, gap);
        if (rectFits(site, rect, slope)) return { rect, where };
      }
    }
    return null;
  };
  const grazing = fit(P, P.gap, P.slope);
  if (grazing) {
    const { rect, where } = grazing;
    const stock: Stock = rng.chance(P.cows) ? "cows" : "sheep";
    const band = P.head[stock];
    const { posts, gate } = fence(site, rect);
    paddock = {
      rect,
      stock,
      head: Math.round(rng.range(band.min, band.max)),
      posts,
      gate,
      roll: rng.next(),
    };
    taken.add(where);
  }
  const arable = fit(Fd, Fd.gap, Fd.slope);
  if (arable) {
    const { rect } = arable;
    const roll = rng.next();
    const crop: Crop = roll < 0.4 ? "plough" : roll < 0.7 ? "stubble" : "hay";
    const bales: CropField["bales"] = [];
    if (crop === "hay") {
      const n = Math.round(rng.range(Fd.bales.min, Fd.bales.max));
      for (let i = 0; i < n; i++) {
        const p = rectPoint(
          rect,
          rng.range(-rect.depth / 2 + 4, rect.depth / 2 - 4),
          rng.range(-rect.width / 2 + 4, rect.width / 2 - 4),
        );
        bales.push({ ...p, heading: rng.range(0, Math.PI * 2) });
      }
    }
    field = { rect, crop, bales };
  }

  // The machinery. The tractor stands on the yard in front of the barn,
  // nosed along it; the trailer behind the tractor or beside the gable;
  // what it pulls is left at the field's near edge when there is a field,
  // and beside the barn when there is not.
  const gear: FarmGear[] = [];
  const front = F.barn.setIn * yard.radius - F.gear.apron;
  const tx = yard.x + right.x * barnSide * front + forward.x * rng.range(-6, 6);
  const tz = yard.z + right.z * barnSide * front + forward.z * rng.range(-6, 6);
  gear.push({
    kind: "tractor",
    x: tx,
    z: tz,
    y: yard.y,
    heading: site.heading + rng.range(-0.35, 0.35) + (rng.chance(0.5) ? Math.PI : 0),
    roll: rng.next(),
  });
  if (rng.chance(F.gear.trailer)) {
    const gable = plan.width / 2 + 3.5;
    const side = silo ? -1 : rng.chance(0.5) ? 1 : -1;
    gear.push({
      kind: "trailer",
      x: barn.x + forward.x * side * gable + right.x * barnSide * rng.range(-2, 2),
      z: barn.z + forward.z * side * gable + right.z * barnSide * rng.range(-2, 2),
      y: yard.y,
      heading: site.heading + rng.range(-0.3, 0.3),
      roll: rng.next(),
    });
  }
  const pulled: GearKind[] = [];
  if (field?.crop === "plough") pulled.push("plough");
  if (field?.crop === "stubble") pulled.push("harrow");
  if (field?.crop === "hay") pulled.push("baler");
  if (pulled.length === 0 && rng.chance(0.5)) pulled.push(rng.chance(0.5) ? "plough" : "harrow");
  for (const kind of pulled) {
    if (field) {
      // Just inside the field's edge nearest the yard, parked along it.
      const edge = rectPoint(field.rect, 0, 0);
      const toYard = Math.atan2(yard.x - edge.x, yard.z - edge.z);
      const d = rectDistance(field.rect, yard.x, yard.z);
      const inset = Math.max(0, d) + 5;
      const x = edge.x + Math.sin(toYard) * (Math.hypot(yard.x - edge.x, yard.z - edge.z) - inset);
      const z = edge.z + Math.cos(toYard) * (Math.hypot(yard.x - edge.x, yard.z - edge.z) - inset);
      gear.push({
        kind,
        x,
        z,
        y: site.land.heightAt(x, z),
        heading: toYard + Math.PI / 2 + rng.range(-0.2, 0.2),
        roll: rng.next(),
      });
    } else {
      const gable = plan.width / 2 + 4.5;
      const x = barn.x - forward.x * gable + right.x * barnSide * rng.range(-3, 1);
      const z = barn.z - forward.z * gable + right.z * barnSide * rng.range(-3, 1);
      if (!site.clear(x, z)) continue;
      gear.push({
        kind,
        x,
        z,
        y: yard.y,
        heading: site.heading + rng.range(-0.4, 0.4),
        roll: rng.next(),
      });
    }
  }

  return { barn, silo, paddock, field, gear };
}

/** R37 — everything about a farm the car can HIT, as solids: the barn's
 * walls, the silo as a ring of bays, the tractor and the trailer as a
 * parked car is (two each), the plough and the baler as one, and every
 * fence post as the pole it is. The harrow lies under the ride-over bar. */
export function farmSolids(
  farm: Farm,
  groundAt: (x: number, z: number) => number = (_x, _z) => NaN,
  out: WildObstacle[] = [],
): WildObstacle[] {
  const foot = (x: number, z: number, fallback: number): number => {
    const y = groundAt(x, z);
    return Number.isNaN(y) ? fallback : y;
  };
  buildingSolids(farm.barn, groundAt, out);
  if (farm.silo) {
    const s = farm.silo;
    const n = Math.max(6, Math.round((2 * Math.PI * s.radius) / 1));
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      const x = s.x + Math.cos(a) * (s.radius - 0.3);
      const z = s.z + Math.sin(a) * (s.radius - 0.3);
      out.push(
        standSolid({ x, z, y: foot(x, z, s.y), kind: "wall", size: s.height / 2.7, spin: a }),
      );
    }
  }
  for (const g of farm.gear) {
    const fwd = { x: Math.sin(g.heading), z: Math.cos(g.heading) };
    const halves =
      g.kind === "tractor"
        ? [-1.3, 1.3]
        : g.kind === "trailer"
          ? [-1.6, 1.6]
          : g.kind === "harrow"
            ? []
            : [0];
    const size = g.kind === "tractor" ? 1.15 : g.kind === "trailer" ? 0.95 : 0.85;
    for (const along of halves) {
      const x = g.x + fwd.x * along;
      const z = g.z + fwd.z * along;
      out.push(standSolid({ x, z, y: foot(x, z, g.y), kind: "parked", size, spin: g.heading }));
    }
  }
  if (farm.paddock) {
    for (const p of farm.paddock.posts) {
      out.push(
        standSolid({
          x: p.x,
          z: p.z,
          y: foot(p.x, p.z, farm.barn.y),
          kind: "post",
          size: 1,
          spin: 0,
        }),
      );
    }
  }
  return out;
}

/** The ground a farm keeps the forest off and, for a ploughed field, gives
 * a surface of its own: its paddock and its field. */
export function farmClearings(farm: Farm): { rect: FarmRect; surface: "sand" | null }[] {
  const out: { rect: FarmRect; surface: "sand" | null }[] = [];
  if (farm.paddock) out.push({ rect: farm.paddock.rect, surface: null });
  if (farm.field)
    out.push({ rect: farm.field.rect, surface: farm.field.crop === "plough" ? "sand" : null });
  return out;
}
