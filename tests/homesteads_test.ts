// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// R37 — the HOMESTEADS: the houses off the stage, the drives down to it and
// what stands in the yard. These are the rules that decide whether a stage
// reads as country somebody lives in, and whether the things standing in
// that country are as solid as they look.
import { describe, expect, it } from "vitest";

import {
  ROAD_CROSS,
  SPUR,
  STAGE_RULES as R,
  compileStage,
  createLandField,
  createTerrain,
  homesteadSolids,
  type Homestead,
  type Track,
} from "@engine";

const H = R.homestead;
const SEEDS = Array.from({ length: 24 }, (_, i) => i * 37 + 1);

/** The stages of the sweep, built once: every rule below reads the same
 * country, and compiling one is most of a test's time. */
const stages = new Map<number, Track>();
function stage(seed: number): Track {
  let track = stages.get(seed);
  if (!track) stages.set(seed, (track = compileStage(seed, "medium", { asphalt: 0.3 })));
  return track;
}

/** Every homestead on the sweep, with the stage it stands off. */
function sweep(): { seed: number; track: Track; homestead: Homestead }[] {
  const out: { seed: number; track: Track; homestead: Homestead }[] = [];
  for (const seed of SEEDS) {
    const track = stage(seed);
    for (const homestead of track.homesteads) out.push({ seed, track, homestead });
  }
  return out;
}

/** The route sample nearest an arc position. */
function routeAt(track: Track, s: number): Track["samples"][number] {
  let best = track.samples[0];
  for (const sample of track.samples) {
    if (Math.abs(sample.s - s) < Math.abs(best.s - s)) best = sample;
  }
  return best;
}

/** Real distance from a point to the route's centerline, m, ignoring the
 * road within `except` metres of `meet` — the honest version of the field
 * the placer steered by, which under-reports. */
function routeDistance(
  track: Track,
  x: number,
  z: number,
  meet?: { x: number; z: number },
  except = 0,
): number {
  let best = Infinity;
  for (const sample of track.samples) {
    if (meet && Math.hypot(sample.x - meet.x, sample.z - meet.z) < except) continue;
    const d = Math.hypot(sample.x - x, sample.z - z);
    if (d < best) best = d;
  }
  return best;
}

function wrap(a: number): number {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a <= -Math.PI) a += 2 * Math.PI;
  return a;
}

describe("homesteads (R37)", () => {
  it("stands homesteads on the sweep — far between, never two in sight of each other", () => {
    const all = sweep();
    // Seen now and then on every stage: not every seed has the country for
    // one, but most do, and the sweep as a whole has plenty.
    expect(all.length).toBeGreaterThan(SEEDS.length);
    const withOne = SEEDS.filter((seed) => stage(seed).homesteads.length > 0);
    expect(withOne.length).toBeGreaterThan(SEEDS.length / 2);
    for (const seed of SEEDS) {
      const track = stage(seed);
      const list = track.homesteads;
      for (let i = 1; i < list.length; i++) {
        expect(list[i].atS - list[i - 1].atS).toBeGreaterThanOrEqual(H.spacing.min);
      }
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const a = list[i].yard;
          const b = list[j].yard;
          expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThanOrEqual(H.apart);
        }
        expect(list[i].atS).toBeGreaterThanOrEqual(H.keepOff.start);
        if (track.finishS !== null) {
          expect(list[i].atS).toBeLessThanOrEqual(track.finishS - H.keepOff.finish);
        }
      }
    }
  });

  it("leaves the stage SQUARE, from a straight, on the side the house is", () => {
    for (const { track, homestead } of sweep()) {
      const at = routeAt(track, homestead.atS);
      expect(Math.abs(at.curvature)).toBeLessThanOrEqual(1 / H.straight + 1e-9);
      expect(at.flat).toBe(0);
      expect(at.deck).toBeNull();
      const mouth = homestead.drive.samples[0];
      expect(Math.hypot(mouth.x - at.x, mouth.z - at.z)).toBeLessThan(0.01);
      // A quarter turn off the road's heading, toward the house's side.
      const turn = wrap(mouth.heading - at.heading);
      expect(Math.abs(Math.abs(turn) - Math.PI / 2)).toBeLessThan(1e-6);
      expect(Math.sign(turn)).toBe(homestead.side);
      // ...and it goes on straight for its first stretch, so the junction
      // reads as a junction.
      for (const sample of homestead.drive.samples) {
        if (sample.s > H.drive.straight) break;
        expect(Math.abs(wrap(sample.heading - mouth.heading))).toBeLessThan(1e-6);
      }
      expect(homestead.drive.width).toBe(H.drive.width);
      expect(homestead.drive.samples.every((s) => s.surface === "gravel")).toBe(true);
    }
  });

  it("runs the drive over dry ground and keeps it, and the yard, off every other road", () => {
    for (const { track, homestead } of sweep()) {
      const land = createLandField(track.seed, track.knobs);
      const meet = homestead.drive.samples[0];
      const corridor = track.width / 2 + ROAD_CROSS.reach + H.drive.width / 2 + ROAD_CROSS.reach;
      for (const sample of homestead.drive.samples) {
        if (sample.s <= track.width / 2 + ROAD_CROSS.reach) continue;
        expect(land.flooded(sample.x, sample.z)).toBe(false);
        expect(
          routeDistance(track, sample.x, sample.z, meet, R.junction.parting),
        ).toBeGreaterThanOrEqual(corridor - 1e-6);
      }
      const yard = homestead.yard;
      expect(routeDistance(track, yard.x, yard.z)).toBeGreaterThanOrEqual(
        yard.radius + corridor - 1,
      );
      // The drive ends in the middle of the yard, on its level.
      const end = homestead.drive.samples[homestead.drive.samples.length - 1];
      expect(Math.hypot(end.x - yard.x, end.z - yard.z)).toBeLessThan(0.01);
      expect(end.elevation).toBeCloseTo(yard.y, 6);
      // The house stands on the yard, facing back down the drive.
      const house = homestead.house;
      expect(Math.hypot(house.x - yard.x, house.z - yard.z)).toBeLessThan(yard.radius);
      expect(Math.abs(wrap(house.heading - (end.heading + Math.PI)))).toBeLessThan(1e-6);
      for (const car of homestead.cars) {
        expect(Math.hypot(car.x - yard.x, car.z - yard.z)).toBeLessThan(yard.radius);
      }
    }
  });

  it("stands the barrier across the drive's mouth, clear of the road the stage takes", () => {
    let placed = 0;
    for (const { seed, track, homestead } of sweep()) {
      const block = homestead.block;
      if (!block) continue;
      placed++;
      expect(block.width).toBeCloseTo(homestead.drive.width, 6);
      expect(block.s).toBeGreaterThanOrEqual(SPUR.block.from);
      const rx = Math.cos(block.heading);
      const rz = -Math.sin(block.heading);
      for (const k of [-1, -0.5, 0, 0.5, 1]) {
        const x = block.x + rx * k * (block.width / 2);
        const z = block.z + rz * k * (block.width / 2);
        expect(
          routeDistance(track, x, z),
          `${block.kind} at s=${block.s} on seed ${seed}`,
        ).toBeGreaterThan(track.width / 2 + SPUR.block.least - 0.01);
      }
      // And the lane trees start past it, so it is seen.
      for (const tree of homestead.trees) {
        const along = Math.hypot(
          tree.x - homestead.drive.samples[0].x,
          tree.z - homestead.drive.samples[0].z,
        );
        expect(along).toBeGreaterThan(block.s);
      }
    }
    expect(placed).toBeGreaterThan(sweep().length * 0.8);
  });

  it("grades the yard flat, lays gravel under the drive, and keeps the forest off both", () => {
    for (const { track, homestead } of sweep().slice(0, 12)) {
      const terrain = createTerrain(track);
      terrain.sync(0);
      const yard = homestead.yard;
      const centre = terrain.heightAt(yard.x, yard.z);
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        const x = yard.x + Math.cos(a) * yard.radius * 0.9;
        const z = yard.z + Math.sin(a) * yard.radius * 0.9;
        expect(Math.abs(terrain.heightAt(x, z) - centre)).toBeLessThan(0.05);
      }
      expect(terrain.spurSurfaceAt(yard.x, yard.z)).toBe("gravel");
      const mid = homestead.drive.samples[Math.floor(homestead.drive.samples.length / 2)];
      expect(terrain.spurSurfaceAt(mid.x, mid.z)).toBe("gravel");
      // The forest's trunks stay off the drive's mat and the yard's gravel.
      for (const tree of terrain.treesNear(yard.x, yard.z, 90)) {
        expect(Math.hypot(tree.x - yard.x, tree.z - yard.z)).toBeGreaterThan(yard.radius + 2);
        for (const sample of homestead.drive.samples) {
          expect(Math.hypot(tree.x - sample.x, tree.z - sample.z)).toBeGreaterThan(
            H.drive.width / 2 + 2,
          );
        }
      }
    }
  });

  it("makes the walls, the parked cars and the lane trees solid", () => {
    for (const { track, homestead } of sweep().slice(0, 12)) {
      const terrain = createTerrain(track);
      terrain.sync(0);
      const { house, cars, trees } = homestead;
      const plan = house.plan;
      const walls = terrain
        .fixturesNear(house.x, house.z, plan.width + plan.depth)
        .filter((s) => s.kind === "wall");
      // A bay every metre round the footprint, at least.
      expect(walls.length).toBeGreaterThanOrEqual(2 * (plan.width + plan.depth) - 4);
      // A storey tall at least (a wing is one storey whatever the house is),
      // and the main block's bays stand every storey of it.
      for (const wall of walls) {
        expect(wall.rooted).toBe(1);
        expect(wall.snap).toBe(Infinity);
        expect(wall.height).toBeGreaterThan(2.5);
      }
      expect(walls.some((w) => w.height > 2.5 * plan.storeys)).toBe(true);
      for (const car of cars) {
        const halves = terrain.fixturesNear(car.x, car.z, 1.5).filter((s) => s.kind === "parked");
        expect(halves.length).toBeGreaterThanOrEqual(2);
        expect(halves[0].mass).toBeGreaterThan(400);
      }
      for (const tree of trees) {
        const trunks = terrain.fixturesNear(tree.x, tree.z, 0.3).filter((s) => s.kind === "tree");
        expect(trunks.length).toBeGreaterThanOrEqual(1);
      }
      // The same solids, from the record alone, in the same places.
      const own = homesteadSolids(homestead);
      expect(own.filter((s) => s.kind === "wall").length).toBe(walls.length);
      expect(own.filter((s) => s.kind === "tree").length).toBe(trees.length);
      expect(own.filter((s) => s.kind === "parked").length).toBe(cars.length * 2);
    }
  });

  it("draws every house from the same handful of choices, and varies them", () => {
    const all = sweep();
    const roofs = new Set(all.map((h) => h.homestead.house.plan.roof));
    const paints = new Set(all.map((h) => h.homestead.house.plan.walls));
    expect(roofs.size).toBe(3);
    expect(paints.size).toBe(3);
    expect(all.some((h) => h.homestead.house.plan.storeys === 2)).toBe(true);
    expect(all.some((h) => h.homestead.house.plan.porch)).toBe(true);
    expect(all.some((h) => h.homestead.house.plan.wing !== null)).toBe(true);
    expect(all.some((h) => h.homestead.cars.length === 2)).toBe(true);
    for (const { homestead } of all) {
      expect(homestead.cars.length).toBeGreaterThanOrEqual(1);
      // A lane, wherever there is drive left past the barrier to plant one
      // along: a short drive whose barrier had to stand well out may have
      // none, and a tree in front of the barrier would be worse.
      const length = homestead.drive.samples[homestead.drive.samples.length - 1].s;
      const from = (homestead.block?.s ?? SPUR.block.from) + 8;
      if (length - from > H.trees.spacing.max * 2) {
        expect(homestead.trees.length).toBeGreaterThan(0);
      }
    }
  });

  it("builds the same homesteads every time it compiles a seed", () => {
    for (const seed of SEEDS.slice(0, 6)) {
      const a = compileStage(seed, "medium", { asphalt: 0.3 });
      const b = compileStage(seed, "medium", { asphalt: 0.3 });
      expect(a.homesteads).toEqual(b.homesteads);
    }
  });

  it("streams the same homesteads however an endless stage's extends are chunked", () => {
    const a = compileStage(7, "endless");
    a.extend?.(6000);
    const b = compileStage(7, "endless");
    for (let s = 1500; s <= 6000; s += 331) b.extend?.(s);
    b.extend?.(6000);
    expect(b.homesteads.length).toBeGreaterThan(0);
    // Every homestead the chunked stream settled is one the single call
    // built, in the same place; the single call may hold a few more that
    // the chunked one's last frontier has not yet committed.
    for (const h of b.homesteads) {
      const match = a.homesteads.find((o) => o.atS === h.atS);
      expect(match).toBeDefined();
      expect(match).toEqual(h);
    }
  });
});
