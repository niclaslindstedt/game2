// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// R39 — the TOWNS: where the tarmac leads. These are the rules that decide
// whether a stage's sealed road goes somewhere, whether the somewhere reads
// as a village, and whether what stands in it is as solid as it looks.
import { describe, expect, it } from "vitest";

import {
  ANALYSIS,
  GROUND_CELL,
  ROAD_CROSS,
  STAGE_RULES as R,
  compileStage,
  createLandField,
  createTerrain,
  townSolids,
  type Building,
  type Spur,
  type TerrainField,
  type Town,
  type Track,
} from "@engine";

const T = R.town;
const SEEDS = Array.from({ length: 24 }, (_, i) => i * 37 + 1);

/** The stages of the sweep, built once: every rule below reads the same
 * country, and compiling one is most of a test's time. */
const stages = new Map<number, Track>();
function stage(seed: number): Track {
  let track = stages.get(seed);
  if (!track) stages.set(seed, (track = compileStage(seed, "medium", { asphalt: 0.3 })));
  return track;
}

/** Every town on the sweep, with the stage it stands on. */
function sweep(): { seed: number; track: Track; town: Town }[] {
  const out: { seed: number; track: Track; town: Town }[] = [];
  for (const seed of SEEDS) {
    const track = stage(seed);
    for (const town of track.towns) out.push({ seed, track, town });
  }
  return out;
}

/** The street a town stands on, as samples with a width: the route's own,
 * or the branch the record names. */
function streetOf(
  track: Track,
  town: Town,
): { samples: readonly { x: number; z: number; s: number; surface: string }[]; width: number } {
  if (town.street.kind === "route") return { samples: track.samples, width: track.width };
  const spur = track.spurs.find((s: Spur) => s.atS === town.atS && s.end === town.street.end);
  if (!spur) throw new Error(`no branch at ${town.atS} for the town's street`);
  return { samples: spur.samples, width: spur.width };
}

/** Real distance from a point to a line of samples, m — and the sample it
 * is nearest. */
function nearest<S extends { x: number; z: number }>(
  samples: readonly S[],
  x: number,
  z: number,
): { d: number; sample: S } {
  let best = samples[0];
  let d = Infinity;
  for (const sample of samples) {
    const here = Math.hypot(sample.x - x, sample.z - z);
    if (here < d) {
      d = here;
      best = sample;
    }
  }
  return { d, sample: best };
}

/** How far a building stands from the DRAWN ground under it, m: the worst
 * of the whole footprint, its wing included. `groundAt` and not `heightAt`
 * — the field between the ground lattice's corners is not the ground, and
 * the difference between the two is exactly what left a street of houses
 * hanging in the air while every other number about them read clean. */
function footingOff(building: Building, terrain: TerrainField): number {
  const { plan } = building;
  const fwd = { x: Math.sin(building.heading), z: Math.cos(building.heading) };
  const right = { x: Math.cos(building.heading), z: -Math.sin(building.heading) };
  const half = plan.width / 2;
  const blocks = [{ u0: -half, u1: half, v0: -plan.depth / 2, v1: plan.depth / 2 }];
  if (plan.wing) {
    const u1 = plan.wing.side > 0 ? half : -half + plan.wing.width;
    blocks.push({
      u0: u1 - plan.wing.width,
      u1,
      v0: -plan.depth / 2 - plan.wing.depth,
      v1: -plan.depth / 2,
    });
  }
  let worst = 0;
  for (const block of blocks) {
    for (let i = 0; i <= 8; i++) {
      for (let j = 0; j <= 8; j++) {
        const u = block.u0 + ((block.u1 - block.u0) * i) / 8;
        const v = block.v0 + ((block.v1 - block.v0) * j) / 8;
        const off = Math.abs(
          building.y -
            terrain.groundAt(
              building.x + right.x * u + fwd.x * v,
              building.z + right.z * u + fwd.z * v,
            ),
        );
        if (off > worst) worst = off;
      }
    }
  }
  return worst;
}

function wrap(a: number): number {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a <= -Math.PI) a += 2 * Math.PI;
  return a;
}

describe("towns (R39)", () => {
  it("stands a town wherever the tarmac has room for one, and never more than one", () => {
    const all = sweep();
    expect(all.length).toBeGreaterThanOrEqual(4);
    for (const seed of SEEDS) {
      const track = stage(seed);
      expect(track.towns.length).toBeLessThanOrEqual(T.perStage);
      // A borrowed run long enough for a village always carries one.
      let start = -1;
      let longest = 0;
      for (let i = 0; i <= track.samples.length; i++) {
        const paved = i < track.samples.length && track.samples[i].surface === "asphalt";
        if (paved && start < 0) start = i;
        if (!paved && start >= 0) {
          longest = Math.max(longest, track.samples[i - 1].s - track.samples[start].s);
          start = -1;
        }
      }
      if (longest >= T.street.min + 2 * R.junction.parting + 60) {
        expect(track.towns.length, `seed ${seed} has ${longest.toFixed(0)} m of tarmac`).toBe(1);
      }
    }
    // Both kinds of street turn up on the sweep: the run the rally drives
    // through, and the arm it looks down.
    expect(all.some(({ town }) => town.street.kind === "route")).toBe(true);
    expect(all.some(({ town }) => town.street.kind === "arm")).toBe(true);
  });

  it("is ten to twenty buildings, on both sides of a sealed street, facing it", () => {
    for (const { seed, track, town } of sweep()) {
      expect(town.lots.length).toBeGreaterThanOrEqual(T.size.min);
      expect(town.lots.length).toBeLessThanOrEqual(T.size.max);
      const street = streetOf(track, town);
      const sides = new Set(town.lots.map((lot) => lot.side));
      expect(sides.size, `seed ${seed}`).toBe(2);
      for (const lot of town.lots) {
        const { building, pad } = lot;
        const near = nearest(street.samples, building.x, building.z);
        expect(near.sample.surface).toBe("asphalt");
        // The front wall stands past the verge by the front yard, never on
        // the road and never out in the country.
        const frontWall = near.d - building.plan.depth / 2;
        const lip = street.width / 2 + ROAD_CROSS.reach;
        expect(frontWall).toBeGreaterThanOrEqual(lip + T.lot.front.min - 0.5);
        expect(frontWall).toBeLessThanOrEqual(lip + T.lot.front.max + pad.radius);
        // ...and the building faces the street: its front points at the
        // nearest sample, within the bend of a village street.
        const toRoad = Math.atan2(near.sample.x - building.x, near.sample.z - building.z);
        expect(Math.abs(wrap(toRoad - building.heading))).toBeLessThan(0.35);
        // The pad is under the building and level with it.
        expect(Math.hypot(pad.x - building.x, pad.z - building.z)).toBeLessThan(0.01);
        expect(pad.y).toBe(building.y);
        expect(pad.radius).toBeGreaterThan(
          Math.hypot(building.plan.width / 2, building.plan.depth / 2),
        );
        for (const car of lot.cars) {
          expect(Math.hypot(car.x - pad.x, car.z - pad.z)).toBeLessThan(pad.radius + 4);
          // Off the road, on the yard.
          expect(nearest(street.samples, car.x, car.z).d).toBeGreaterThan(lip + 1);
        }
      }
    }
  });

  it("keeps every lot dry and off every other road, and no two buildings on one ground", () => {
    for (const { track, town } of sweep()) {
      const land = createLandField(track.seed, track.knobs);
      const corridor = track.width / 2 + ROAD_CROSS.reach;
      for (const lot of town.lots) {
        const { pad } = lot;
        expect(land.flooded(pad.x, pad.z)).toBe(false);
        // Off the ROUTE — except the street, when the street is the route.
        for (const sample of track.samples) {
          if (
            town.street.kind === "route" &&
            sample.s >= town.street.fromS &&
            sample.s <= town.street.toS
          ) {
            continue;
          }
          const d = Math.hypot(sample.x - pad.x, sample.z - pad.z);
          expect(d).toBeGreaterThanOrEqual(pad.radius + corridor - 0.5);
        }
        // Off every branch that is not the street.
        for (const spur of track.spurs) {
          if (town.street.kind === "arm" && spur.atS === town.atS && spur.end === town.street.end) {
            continue;
          }
          for (const sample of spur.samples) {
            const d = Math.hypot(sample.x - pad.x, sample.z - pad.z);
            expect(d).toBeGreaterThanOrEqual(pad.radius + corridor - 0.5);
          }
        }
        // Clear of every junction's own ground.
        for (const junction of track.junctions) {
          const d = Math.hypot(junction.x - pad.x, junction.z - pad.z);
          expect(d).toBeGreaterThan(R.junction.parting - pad.radius);
        }
      }
      // Two footprints never overlap: along the street the lots are spaced
      // by their widths, and across it they are on opposite sides.
      for (let i = 0; i < town.lots.length; i++) {
        for (let j = i + 1; j < town.lots.length; j++) {
          const a = town.lots[i];
          const b = town.lots[j];
          if (a.side !== b.side) continue;
          const d = Math.hypot(a.building.x - b.building.x, a.building.z - b.building.z);
          expect(d).toBeGreaterThan((a.building.plan.width + b.building.plan.width) / 2);
        }
      }
      // ...and the homesteads keep their distance from the village.
      for (const h of track.homesteads) {
        for (const lot of town.lots) {
          const d = Math.hypot(h.yard.x - lot.pad.x, h.yard.z - lot.pad.z);
          expect(d).toBeGreaterThan(R.homestead.apart - 1);
        }
      }
    }
  });

  it("is a village: mostly houses, with the shops in the middle", () => {
    const all = sweep();
    const kinds = new Set(all.flatMap(({ town }) => town.lots.map((l) => l.building.plan.kind)));
    for (const kind of ["house", "villa", "apartments", "grocery", "post", "workshop"]) {
      expect(kinds.has(kind as never), kind).toBe(true);
    }
    for (const { town } of all) {
      const lots = town.lots;
      const houses = lots.filter((l) => l.building.plan.kind === "house").length;
      expect(houses).toBeGreaterThanOrEqual(lots.length / 2);
      for (const kind of ["grocery", "post", "workshop", "apartments", "villa"] as const) {
        const count = lots.filter((l) => l.building.plan.kind === kind).length;
        expect(count).toBeLessThanOrEqual(T.kinds[kind].max);
      }
      // A shop stands in the middle of the town, never at either end.
      const from = Math.min(...lots.map((l) => l.atS));
      const to = Math.max(...lots.map((l) => l.atS));
      for (const lot of lots) {
        if (lot.building.plan.kind !== "grocery" && lot.building.plan.kind !== "post") continue;
        const t = (lot.atS - from) / Math.max(1, to - from);
        expect(t).toBeGreaterThan(0.2);
        expect(t).toBeLessThan(0.8);
      }
    }
  });

  it("grades every lot level with the street, and keeps the forest off it", () => {
    for (const { track, town } of sweep().slice(0, 4)) {
      const terrain = createTerrain(track);
      terrain.sync(0);
      for (const lot of town.lots) {
        const { pad } = lot;
        // On the pad's own plane — level across the street, falling along
        // it with the road. Not sunk under it the way the tiles under a
        // road's ribbon are: a lot's gravel is PAINTED on the village's own
        // graded ground (R39), so that ground is the surface, and anything
        // standing on the pad's level is standing on it.
        const centre = terrain.heightAt(pad.x, pad.z);
        expect(Math.abs(centre - pad.y)).toBeLessThan(0.12);
        expect(Math.hypot(pad.grade.x, pad.grade.z)).toBeLessThan(0.12);
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * Math.PI * 2;
          const dx = Math.cos(a) * pad.radius * 0.8;
          const dz = Math.sin(a) * pad.radius * 0.8;
          const plane = centre + pad.grade.x * dx + pad.grade.z * dz;
          expect(Math.abs(terrain.heightAt(pad.x + dx, pad.z + dz) - plane)).toBeLessThan(0.15);
        }
        expect(terrain.spurSurfaceAt(pad.x, pad.z)).toBe("gravel");
        for (const tree of terrain.treesNear(pad.x, pad.z, 40)) {
          expect(Math.hypot(tree.x - pad.x, tree.z - pad.z)).toBeGreaterThan(pad.radius + 2);
        }
      }
    }
  });

  it("grades one band for the whole village, level with its street", () => {
    for (const { seed, track, town } of sweep()) {
      const { spine, right, left, blend } = town.platform;
      expect(spine.length).toBeGreaterThan(2);
      expect(blend).toBe(T.platform.blend);
      const street = streetOf(track, town);
      for (const point of spine) {
        // Every point of the spine is ON the street, and its two levels are
        // the street's own verge levels there.
        const { d } = nearest(street.samples, point.x, point.z);
        expect(d).toBeLessThan(1.5);
        expect(Math.abs(point.right - point.left)).toBeLessThan(1);
        expect(point.outRight).toBeLessThanOrEqual(right + 1e-6);
        expect(point.outLeft).toBeLessThanOrEqual(left + 1e-6);
        // A side may be cut back to nothing where a road it must keep off
        // runs alongside, but never past nothing.
        expect(Math.min(point.outRight, point.outLeft)).toBeGreaterThanOrEqual(0);
      }
      // ...and it reaches a lattice cell past the back of every lot on it,
      // which is the whole mechanism: anything narrower than a cell never
      // reaches the ground the world draws.
      for (const lot of town.lots) {
        const back =
          lot.lateral + lot.building.plan.depth / 2 + (lot.building.plan.wing?.depth ?? 0);
        let out = 0;
        for (const point of spine) {
          const along = Math.hypot(point.x - lot.building.x, point.z - lot.building.z);
          if (along > lot.lateral + lot.building.plan.width) continue;
          out = Math.max(out, lot.side > 0 ? point.outRight : point.outLeft);
        }
        expect(out, `seed ${seed}: the band behind a ${lot.building.plan.kind}`).toBeGreaterThan(
          back + GROUND_CELL,
        );
      }
    }
  });

  it("stands every building on the ground the world DRAWS, not the field between its corners", () => {
    for (const { seed, track, town } of sweep().slice(0, 6)) {
      const terrain = createTerrain(track);
      terrain.sync(0);
      for (const lot of town.lots) {
        const off = footingOff(lot.building, terrain);
        expect(
          off,
          `seed ${seed}: a ${lot.building.plan.kind} @${lot.atS.toFixed(0)} m stands ` +
            `${off.toFixed(2)} m off the ground under it`,
        ).toBeLessThan(ANALYSIS.roads.townFooting);
        for (const car of lot.cars) {
          expect(Math.abs(terrain.groundAt(car.x, car.z) - car.y)).toBeLessThan(
            ANALYSIS.roads.townFooting,
          );
        }
      }
    }
  });

  it("makes the walls and the parked cars solid", () => {
    for (const { track, town } of sweep().slice(0, 4)) {
      const terrain = createTerrain(track);
      terrain.sync(0);
      for (const lot of town.lots) {
        const { building, cars } = lot;
        const plan = building.plan;
        const walls = terrain
          .fixturesNear(building.x, building.z, plan.width + plan.depth)
          .filter((s) => s.kind === "wall");
        expect(walls.length).toBeGreaterThanOrEqual(2 * (plan.width + plan.depth) - 4);
        expect(walls.some((w) => w.height > 2.5 * plan.storeys)).toBe(true);
        for (const car of cars) {
          const halves = terrain.fixturesNear(car.x, car.z, 1.5).filter((s) => s.kind === "parked");
          expect(halves.length).toBeGreaterThanOrEqual(2);
        }
      }
      // The same solids, from the record alone.
      const own = townSolids(town);
      const lots = town.lots.length;
      expect(own.filter((s) => s.kind === "parked").length).toBe(
        town.lots.reduce((n, l) => n + l.cars.length, 0) * 2,
      );
      expect(own.filter((s) => s.kind === "wall").length).toBeGreaterThan(lots * 20);
    }
  });

  it("builds the same town every time it compiles a seed", () => {
    const withTown = SEEDS.filter((seed) => stage(seed).towns.length > 0).slice(0, 3);
    for (const seed of withTown) {
      const again = compileStage(seed, "medium", { asphalt: 0.3 });
      expect(again.towns).toEqual(stage(seed).towns);
    }
  });

  it("streams the same towns however an endless stage's extends are chunked", () => {
    const a = compileStage(7, "endless");
    a.extend?.(9000);
    const b = compileStage(7, "endless");
    for (let s = 1500; s <= 9000; s += 331) b.extend?.(s);
    b.extend?.(9000);
    for (const town of b.towns) {
      const match = a.towns.find((o) => o.atS === town.atS && o.street.kind === town.street.kind);
      expect(match).toBeDefined();
      expect(match?.lots.length).toBe(town.lots.length);
    }
  });
});
