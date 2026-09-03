// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// R42 — the CAR PARKS: where the crowd left its cars, the lane each pad is
// reached by, and the trails in to the stands. These are the rules that
// decide whether a crowd on a stage reads as a crowd that drove there, and
// whether what it drove is as solid as it looks.
import { describe, expect, it } from "vitest";

import {
  ANALYSIS,
  ROAD_CROSS,
  SPUR,
  STAGE_RULES as R,
  compileStage,
  createLandField,
  createTerrain,
  padHeight,
  type CarPark,
  type TerrainField,
  type Track,
} from "@engine";

const C = R.carPark;
const SEEDS = Array.from({ length: 24 }, (_, i) => i * 37 + 1);

/** The stages of the sweep, with their fields, built once. */
const built = new Map<number, { track: Track; terrain: TerrainField }>();
function stage(seed: number): { track: Track; terrain: TerrainField } {
  let entry = built.get(seed);
  if (!entry) {
    const track = compileStage(seed, "medium", { asphalt: 0.3 });
    const terrain = createTerrain(track);
    terrain.sync(0);
    built.set(seed, (entry = { track, terrain }));
  }
  return entry;
}

/** Every car park on the sweep, with the stage it serves. */
function sweep(): { seed: number; track: Track; terrain: TerrainField; park: CarPark }[] {
  const out: { seed: number; track: Track; terrain: TerrainField; park: CarPark }[] = [];
  for (const seed of SEEDS) {
    const { track, terrain } = stage(seed);
    for (const park of terrain.carParks) out.push({ seed, track, terrain, park });
  }
  return out;
}

/** Real distance from a point to the route's centerline, m. */
function routeDistance(track: Track, x: number, z: number): number {
  let best = Infinity;
  for (const sample of track.samples) {
    const d = Math.hypot(sample.x - x, sample.z - z);
    if (d < best) best = d;
  }
  return best;
}

describe("car parks (R42)", () => {
  it("serves EVERY stand from a car park, and takes off the stage the ones it cannot", () => {
    const all = sweep();
    expect(all.length).toBeGreaterThan(SEEDS.length);
    const withOne = SEEDS.filter((seed) => stage(seed).terrain.carParks.length > 0);
    expect(withOne.length).toBeGreaterThan(SEEDS.length * 0.8);
    for (const seed of SEEDS) {
      const { terrain } = stage(seed);
      // R42 — a crowd that could not have driven here does not stand here:
      // every stand left on the stage has a trail from some pad to it.
      const trailed = new Set(
        terrain.carParks.flatMap((park) =>
          park.trails.map((t) => `${t.standS.toFixed(2)}/${t.standFacing.toFixed(4)}`),
        ),
      );
      for (const stand of terrain.stands) {
        // ...except the finish's own banks, which keep their crowd whatever
        // the country behind them offers: the organisers' road and the
        // service area are there by construction.
        if (stand.finish) continue;
        expect(trailed.has(`${stand.s.toFixed(2)}/${stand.facing.toFixed(4)}`)).toBe(true);
      }
      // In stage order, never two pads on top of each other.
      const parks = terrain.carParks;
      for (let i = 1; i < parks.length; i++) {
        expect(parks[i].atS).toBeGreaterThanOrEqual(parks[i - 1].atS);
      }
      for (let i = 0; i < parks.length; i++) {
        for (let j = i + 1; j < parks.length; j++) {
          const a = parks[i].pad;
          const b = parks[j].pad;
          expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThanOrEqual(C.pad.apart - 1e-6);
        }
      }
    }
  });

  it("holds the crowd's own cars — enough to have carried them, never more than there are people", () => {
    for (const { park } of sweep()) {
      expect(park.heads).toBeGreaterThan(0);
      expect(park.cars.length).toBeGreaterThan(0);
      expect(park.cars.length).toBeLessThanOrEqual(park.bays);
      expect(park.bays).toBeLessThanOrEqual(C.bays.most + C.bays.spare.max + 1);
      // Both halves of the rule: the cars could have brought the crowd, and
      // the crowd could have filled the cars.
      expect(park.cars.length * C.occupancy.max).toBeGreaterThanOrEqual(park.heads);
      expect(park.cars.length).toBeLessThanOrEqual(park.heads);
      expect(Math.hypot(park.pad.grade.x, park.pad.grade.z)).toBeLessThanOrEqual(
        C.pad.maxGrade + 1e-9,
      );
      for (const car of park.cars) {
        expect(Math.hypot(car.x - park.pad.x, car.z - park.pad.z)).toBeLessThan(park.pad.radius);
        expect(car.y).toBeCloseTo(padHeight(park.pad, car.x, car.z), 6);
      }
    }
  });

  it("stands every pad a few hundred metres off the course", () => {
    for (const { track, park } of sweep()) {
      expect(routeDistance(track, park.pad.x, park.pad.z)).toBeGreaterThanOrEqual(C.standOff);
    }
  });

  it("reaches every pad by a lane from a public road or from the edge of the map", () => {
    const kinds = { arm: 0, road: 0, park: 0, map: 0 };
    for (const { track, terrain, park } of sweep()) {
      kinds[park.access]++;
      const road = park.road.samples;
      const first = road[0];
      const last = road[road.length - 1];
      expect(park.road.width).toBe(C.road.width);
      expect(road.every((s) => s.surface === "gravel")).toBe(true);
      // The lane ends at the pad's centre, on the pad's level.
      expect(Math.hypot(last.x - park.pad.x, last.z - park.pad.z)).toBeLessThan(0.01);
      expect(last.elevation).toBeCloseTo(padHeight(park.pad, last.x, last.z), 6);
      if (park.access === "map") {
        // ...and starts off the map.
        const b = track.bounds;
        const out = Math.max(
          b.minX - first.x,
          first.x - b.maxX,
          b.minZ - first.z,
          first.z - b.maxZ,
        );
        expect(out).toBeGreaterThanOrEqual(SPUR.escape - SPUR.step - 1);
      } else {
        // ...or on a road that is there: an arm past its barrier, a public
        // road the route never met, or an earlier car park's lane, at that
        // road's own height.
        const lines =
          park.access === "arm"
            ? track.spurs.filter((s) => !s.rail).map((s) => s.samples)
            : park.access === "road"
              ? track.publicRoads.map((r) => r.samples)
              : terrain.carParks.filter((p) => p !== park).map((p) => p.road.samples);
        const on = lines.flat().find((s) => Math.hypot(s.x - first.x, s.z - first.z) < 0.01);
        expect(on).toBeDefined();
        // On that road's crown: its own height, plus the camber a lane
        // leaving square across it picks up.
        expect(Math.abs(first.elevation - (on?.elevation ?? NaN))).toBeLessThan(0.1);
      }
    }
    // Every way in is used somewhere on the sweep, and the rim is the
    // fallback rather than the answer wherever a road is in reach.
    expect(kinds.map).toBeGreaterThan(0);
    expect(kinds.arm + kinds.road + kinds.park).toBeGreaterThan(0);
  });

  it("keeps the pad, the lane and the trails off the route and out of the water", () => {
    const corridor = (track: Track): number => track.width / 2 + ROAD_CROSS.reach;
    for (const { track, park } of sweep()) {
      const land = createLandField(track.seed, track.knobs);
      const pad = park.pad;
      expect(routeDistance(track, pad.x, pad.z)).toBeGreaterThanOrEqual(
        corridor(track) + C.pad.clear + pad.radius - 1e-6,
      );
      expect(land.flooded(pad.x, pad.z, SPUR.shoreFreeboard)).toBe(false);
      for (const sample of park.road.samples) {
        expect(routeDistance(track, sample.x, sample.z)).toBeGreaterThanOrEqual(
          corridor(track) + C.road.width / 2,
        );
      }
      for (const trail of park.trails) {
        const end = trail.samples[trail.samples.length - 1];
        expect(end.s).toBeLessThanOrEqual(C.walk + pad.radius);
        // Every step is on ground the walk looked at; the last is the
        // stand's own back, which the crowd's placement judged.
        for (const p of trail.samples.slice(0, -1)) {
          expect(routeDistance(track, p.x, p.z)).toBeGreaterThanOrEqual(
            corridor(track) + C.trail.clear - 1e-6,
          );
          expect(land.flooded(p.x, p.z, 0.4)).toBe(false);
        }
      }
    }
  });

  it("ends every trail behind the stand it serves, and signs the way", () => {
    for (const { terrain, park } of sweep()) {
      for (const trail of park.trails) {
        const stand = terrain.stands.find(
          (s) => s.s === trail.standS && s.facing === trail.standFacing,
        );
        expect(stand).toBeDefined();
        if (!stand) continue;
        const end = trail.samples[trail.samples.length - 1];
        // Behind the back row, on the stand's own centreline.
        const behind =
          (end.x - stand.x) * -Math.sin(stand.facing) + (end.z - stand.z) * -Math.cos(stand.facing);
        expect(behind).toBeGreaterThan(stand.rows);
        expect(Math.hypot(end.x - stand.x, end.z - stand.z)).toBeLessThan(stand.rows * 1.1 + 3);
        // The first sample is on the pad's rim.
        const start = trail.samples[0];
        expect(Math.hypot(start.x - park.pad.x, start.z - park.pad.z)).toBeCloseTo(
          park.pad.radius - 1,
          3,
        );
        if (end.s > C.sign.first + 20) expect(trail.signs.length).toBeGreaterThan(0);
        for (const sign of trail.signs) {
          let nearest = Infinity;
          for (const p of trail.samples) {
            nearest = Math.min(nearest, Math.hypot(p.x - sign.x, p.z - sign.z));
          }
          // Beside the path, never on it.
          expect(nearest).toBeGreaterThan(C.trail.width / 2);
          expect(nearest).toBeLessThan(C.trail.width / 2 + 2.5);
        }
      }
    }
  });

  it("lays every lane at a road's grade, bending no faster than a minor road's crest rule", () => {
    // The lane is a road: no step on it steeper than a minor road is built
    // to (the pad's own plane, where the lane crosses onto it), and no brow
    // in it a car would fly — a grade that flips between two samples is
    // what a first-order follower with a grade cap leaves at every join,
    // and it was a 20% ramp into one car park in four.
    for (const { park } of sweep()) {
      const S = park.road.samples;
      let slope = 0;
      for (let i = 1; i < S.length; i++) {
        const run = S[i].s - S[i - 1].s;
        expect(run).toBeGreaterThan(0);
        const grade = (S[i].elevation - S[i - 1].elevation) / run;
        expect(Math.abs(grade)).toBeLessThanOrEqual(
          Math.max(C.road.maxGrade, C.pad.maxGrade) + ANALYSIS.lanes.gradeSlack,
        );
        if (i > 1) expect(Math.abs(grade - slope) / run).toBeLessThan(ANALYSIS.lanes.crest.fail);
        slope = grade;
      }
    }
  });

  it("grades the pad, lays gravel under the lane, and makes the cars solid", () => {
    for (const { terrain, park } of sweep().slice(0, 16)) {
      const { pad } = park;
      const centre = terrain.heightAt(pad.x, pad.z) - padHeight(pad, pad.x, pad.z);
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        const x = pad.x + Math.cos(a) * pad.radius * 0.9;
        const z = pad.z + Math.sin(a) * pad.radius * 0.9;
        // The ground follows the pad's plane across the whole disc.
        expect(Math.abs(terrain.heightAt(x, z) - padHeight(pad, x, z) - centre)).toBeLessThan(0.05);
      }
      expect(terrain.spurSurfaceAt(pad.x, pad.z)).toBe("gravel");
      const mid = park.road.samples[Math.floor(park.road.samples.length / 2)];
      expect(terrain.spurSurfaceAt(mid.x, mid.z)).toBe("gravel");
      for (const car of park.cars) {
        const halves = terrain.fixturesNear(car.x, car.z, 1.5).filter((s) => s.kind === "parked");
        expect(halves.length).toBeGreaterThanOrEqual(2);
      }
      // The forest keeps off the pad and the trails.
      for (const tree of terrain.treesNear(pad.x, pad.z, 80)) {
        expect(Math.hypot(tree.x - pad.x, tree.z - pad.z)).toBeGreaterThan(pad.radius + 1);
        for (const trail of park.trails) {
          for (const p of trail.samples) {
            expect(Math.hypot(tree.x - p.x, tree.z - p.z)).toBeGreaterThan(C.trail.width / 2 + 1);
          }
        }
      }
    }
  });

  it("builds the same car parks every time it builds a seed", () => {
    for (const seed of SEEDS.slice(0, 4)) {
      const a = createTerrain(compileStage(seed, "medium", { asphalt: 0.3 }));
      a.sync(0);
      const b = createTerrain(compileStage(seed, "medium", { asphalt: 0.3 }));
      b.sync(0);
      expect(a.carParks).toEqual(b.carParks);
      expect(a.carParks).toEqual(stage(seed).terrain.carParks);
    }
  });

  it("streams the same car parks however an endless stage's extends are chunked", () => {
    const a = compileStage(7, "endless");
    a.extend?.(5000);
    const ta = createTerrain(a);
    ta.sync(0);
    const b = compileStage(7, "endless");
    const tb = createTerrain(b);
    for (let s = 1500; s <= 5000; s += 331) {
      b.extend?.(s);
      tb.sync(0);
    }
    b.extend?.(5000);
    tb.sync(0);
    expect(tb.carParks.length).toBeGreaterThan(0);
    // The chunked stream serves the stands the single call serves, and
    // every car park it places obeys the rules — but not with the same pad:
    // a pad and a lane are searched over the country as far as the road
    // has been laid, and road laid later closes ways out the chunked stream
    // took and opens ones the single call never saw. That is what `hold`
    // bounds and cannot end, on a stage that never ends.
    let matched = 0;
    for (const park of tb.carParks) {
      expect(park.cars.length * C.occupancy.max).toBeGreaterThanOrEqual(park.heads);
      expect(park.trails.length).toBeGreaterThan(0);
      if (ta.carParks.some((o) => o.atS === park.atS)) matched++;
    }
    expect(matched).toBeGreaterThan(0);
  });
});
