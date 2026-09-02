// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE BUILDINGS — what stands on a yard (R37) or along a village street
// (R39), as PLANS. A plan is dimensions and choices, never geometry: which
// kind of building, how big its footprint is, how many storeys, what roof,
// what paint, whether there is a porch or a wing. The renderer turns a plan
// into boards, panes and tiles; the engine turns the same plan into the run
// of wall bays a car stops against. One record, both sides, so the wall the
// physics puts up is the wall the player sees.
//
// Everything here is shared by the homestead placer and the town placer.
// The two draw DIFFERENT distributions from the same vocabulary — a farm is
// a house, a village is houses and the buildings a village has that a farm
// does not — which is why the draws live here beside the type rather than
// with either placer.

import type { Rng } from "../lib/prng.ts";
import { PARKED_HALF, standSolid, WALL_BAY, WALL_RADIUS, type WildObstacle } from "./solids.ts";

/** What a building IS. `house` is the timber house every farm and every
 * village street is mostly made of; `villa` the bigger two-storey one on a
 * village's best plot; the rest are what a small town has that a farm does
 * not — a block of flats, a grocery with a shop front, the post office, and
 * the workshop that fixes the cars. */
export type BuildingKind = "house" | "villa" | "apartments" | "grocery" | "post" | "workshop";

/** What the roof is made of — the three a Nordic house actually has, and
 * the flat felt roof a shop or a block of flats gets instead of any of them. */
export type RoofKind = "tile" | "metal" | "slate" | "flat";

/** What the boards are painted: falu red with white trim, ochre yellow with
 * white trim, or white throughout — plus the grey render, the yellow brick
 * and the green a village's bigger buildings are done in. */
export type WallPaint = "red" | "yellow" | "white" | "grey" | "brick" | "green";

/** THE PLAN of a building — everything the renderer needs to build it,
 * decided in the engine so the same seed stands the same building on both
 * sides of the wire. */
export type HousePlan = {
  kind: BuildingKind;
  /** Footprint of the main block, m: `width` along the front (the wall that
   * faces the yard or the street), `depth` back from it. */
  width: number;
  depth: number;
  storeys: 1 | 2 | 3;
  roof: RoofKind;
  walls: WallPaint;
  /** A porch over the front door, with its own little roof on posts. */
  porch: boolean;
  /** An L: a second, lower block off one end of the back wall. `side` is
   * which end, looking at the front; its `width` runs along the front's
   * line and its `depth` back from the main block's rear wall. */
  wing: { side: -1 | 1; width: number; depth: number } | null;
  /** A roll for the details the plan does not dictate — where the windows
   * fall, which way the door is offset, whether there is a chimney, what
   * the sign over a shop says. */
  detail: number;
};

/** A car parked outside. `roll` picks its body and paint in the app. */
export type ParkedCar = {
  x: number;
  z: number;
  y: number;
  /** Which way the nose points. */
  heading: number;
  roll: number;
};

/** A building standing somewhere: where, which way its FRONT faces, and
 * what it is. */
export type Building = { x: number; z: number; y: number; heading: number; plan: HousePlan };

function roofRoll(rng: Rng): Exclude<RoofKind, "flat"> {
  const r = rng.next();
  return r < 0.42 ? "tile" : r < 0.76 ? "metal" : "slate";
}

/** Draw a FARMHOUSE (R37). The proportions are a Nordic timber house's: a
 * block a room or two deep under a pitched roof, one storey more often than
 * two, red more often than anything, and a porch on about half of them. */
export function drawHousePlan(rng: Rng): HousePlan {
  const storeys: 1 | 2 = rng.chance(0.38) ? 2 : 1;
  const width = rng.range(7.5, 12.5);
  const depth = rng.range(6, 8.5);
  const roof = roofRoll(rng);
  const wallRoll = rng.next();
  const walls: WallPaint = wallRoll < 0.48 ? "red" : wallRoll < 0.72 ? "yellow" : "white";
  const porch = rng.chance(0.5);
  const wing = rng.chance(0.34)
    ? {
        side: (rng.chance(0.5) ? 1 : -1) as 1 | -1,
        width: rng.range(4, Math.max(4.5, width * 0.55)),
        depth: rng.range(3.5, 5.5),
      }
    : null;
  return { kind: "house", width, depth, storeys, roof, walls, porch, wing, detail: rng.next() };
}

/** Draw a building of a given KIND for a village street (R39). The village
 * house is the farmhouse's cousin — a shade smaller, more often white or
 * yellow, because a street is where the paint gets looked at — and the
 * rest are what they are: a villa is two storeys with a wing, a block of
 * flats is three under a flat roof, a grocery and a post office are one
 * wide storey with the shop front along the street, and a workshop is a
 * long low shed with the doors in the gable. */
export function drawTownPlan(rng: Rng, kind: BuildingKind): HousePlan {
  const detail = rng.next();
  switch (kind) {
    case "house": {
      const wallRoll = rng.next();
      return {
        kind,
        width: rng.range(7, 11),
        depth: rng.range(6, 8),
        storeys: rng.chance(0.3) ? 2 : 1,
        roof: roofRoll(rng),
        walls: wallRoll < 0.34 ? "red" : wallRoll < 0.64 ? "yellow" : "white",
        porch: rng.chance(0.55),
        wing: null,
        detail,
      };
    }
    case "villa":
      return {
        kind,
        width: rng.range(11, 14),
        depth: rng.range(8, 10),
        storeys: 2,
        roof: roofRoll(rng),
        walls: rng.chance(0.5) ? "white" : "yellow",
        porch: true,
        wing: {
          side: (rng.chance(0.5) ? 1 : -1) as 1 | -1,
          width: rng.range(5, 7),
          depth: rng.range(4, 6),
        },
        detail,
      };
    case "apartments":
      return {
        kind,
        width: rng.range(16, 24),
        depth: rng.range(10, 12),
        storeys: 3,
        roof: rng.chance(0.6) ? "flat" : "metal",
        walls: rng.chance(0.55) ? "grey" : rng.chance(0.5) ? "brick" : "white",
        porch: false,
        wing: null,
        detail,
      };
    case "grocery":
      return {
        kind,
        width: rng.range(14, 20),
        depth: rng.range(10, 14),
        storeys: 1,
        roof: "flat",
        walls: rng.chance(0.5) ? "white" : "grey",
        porch: false,
        wing: null,
        detail,
      };
    case "post":
      return {
        kind,
        width: rng.range(10, 13),
        depth: rng.range(8, 10),
        storeys: rng.chance(0.5) ? 2 : 1,
        roof: rng.chance(0.5) ? "tile" : "metal",
        walls: rng.chance(0.6) ? "yellow" : "brick",
        porch: false,
        wing: null,
        detail,
      };
    case "workshop":
      return {
        kind,
        width: rng.range(12, 18),
        depth: rng.range(9, 12),
        storeys: 1,
        roof: rng.chance(0.5) ? "metal" : "flat",
        walls: rng.chance(0.5) ? "grey" : "green",
        porch: false,
        wing: null,
        detail,
      };
  }
}

/** The height of a block's walls, storeys: what the solids stand to and
 * what the renderer builds to, so a wall is hit where it is drawn. A flat
 * roof carries a parapet, which is the top of the wall for the physics. */
export function wallStoreys(plan: HousePlan): number {
  return plan.roof === "flat" ? plan.storeys + 0.25 : plan.storeys;
}

/** Everything about a building the car can HIT, as solids: its walls as a
 * run of bays round the footprint (the same construction as a bridge
 * parapet, and for the same reason — a run of circles with a gap in it is a
 * wall with a door a car can find) and its wing's walls likewise. `groundAt`
 * is the ground as the terrain field shapes it once the pad is in it; the
 * record's own height is a fallback for a caller with no field. */
export function buildingSolids(
  building: Building,
  groundAt: (x: number, z: number) => number = (_x, _z) => NaN,
  out: WildObstacle[] = [],
): WildObstacle[] {
  const { plan } = building;
  const fwd = { x: Math.sin(building.heading), z: Math.cos(building.heading) };
  const right = { x: Math.cos(building.heading), z: -Math.sin(building.heading) };
  const foot = (x: number, z: number): number => {
    const y = groundAt(x, z);
    return Number.isNaN(y) ? building.y : y;
  };
  /** A wall bay at building-local (u right, v forward). */
  const wall = (u: number, v: number, storeys: number): void => {
    const x = building.x + right.x * u + fwd.x * v;
    const z = building.z + right.z * u + fwd.z * v;
    out.push(
      standSolid({ x, z, y: foot(x, z), kind: "wall", size: storeys, spin: building.heading }),
    );
  };
  /** The four walls of a block whose front-left corner is at (u0, v0) and
   * back-right at (u1, v1), one bay per metre, inset so the bays' faces
   * stand on the drawn wall. */
  const block = (u0: number, v0: number, u1: number, v1: number, storeys: number): void => {
    const inset = WALL_RADIUS * 0.5;
    const a = u0 + inset;
    const b = u1 - inset;
    const c = v0 + inset;
    const d = v1 - inset;
    const along = (from: number, to: number, place: (t: number) => void): void => {
      const n = Math.max(1, Math.ceil((to - from) / WALL_BAY));
      for (let i = 0; i <= n; i++) place(from + ((to - from) * i) / n);
    };
    along(a, b, (u) => wall(u, c, storeys));
    along(a, b, (u) => wall(u, d, storeys));
    along(c, d, (v) => wall(a, v, storeys));
    along(c, d, (v) => wall(b, v, storeys));
  };
  const hw = plan.width / 2;
  block(-hw, -plan.depth / 2, hw, plan.depth / 2, wallStoreys(plan));
  if (plan.wing) {
    // The wing hangs off the BACK wall, flush with one end.
    const w = plan.wing;
    const u1 = w.side > 0 ? hw : -hw + w.width;
    block(u1 - w.width, -plan.depth / 2 - w.depth, u1, -plan.depth / 2, 1);
  }
  return out;
}

/** A parked car as two solids, nose and tail — a rally car that arrives
 * sideways stops against either half. */
export function parkedSolids(
  cars: readonly ParkedCar[],
  groundAt: (x: number, z: number) => number = (_x, _z) => NaN,
  out: WildObstacle[] = [],
): WildObstacle[] {
  for (const car of cars) {
    const cf = { x: Math.sin(car.heading), z: Math.cos(car.heading) };
    for (const along of [-PARKED_HALF, PARKED_HALF]) {
      const x = car.x + cf.x * along;
      const z = car.z + cf.z * along;
      const y = groundAt(x, z);
      out.push(
        standSolid({
          x,
          z,
          y: Number.isNaN(y) ? car.y : y,
          kind: "parked",
          size: 1,
          spin: car.heading,
        }),
      );
    }
  }
  return out;
}
