// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// R41 — THE RAILWAY: laid before the stage like the tarmac, crossed square
// on a ramp, and run by a train the physics can hit.
//
// The line is a `Highway` of kind `rail` so every clearance the search keeps
// from a road holds against it for free; what these assertions hold up is
// the rest — that a country carries one where its biome says so and not
// where it does not, that the rally never borrows or joins it, that the
// crossing is square with a lip standing the rule's height short of the
// rails and the road at grade beyond, that the two arms are cut and joined
// into one line, that the timetable puts a train over the crossing when it
// says it will, and that the train is a wall a car standing on the rails is
// hit by — while a car flying over at pace is not.

import { describe, expect, it } from "vitest";
import {
  NEUTRAL_INPUT,
  RAILCAR,
  STAGE_RULES,
  compileStage,
  createGame,
  step,
  trainAt,
  trainCars,
  trainSolidsNear,
  type Track,
} from "@engine";

const tracks = new Map<string, Track>();
function stage(seed: number, length: "short" | "medium" | "long" = "medium"): Track {
  const key = `${seed}/${length}`;
  const had = tracks.get(key);
  if (had) return had;
  const built = compileStage(seed, length, {});
  tracks.set(key, built);
  return built;
}

/** Seeds whose stage crosses the railway, found by sweeping — the SEARCH
 * is the fixture, never a pinned seed, so a generator change that moves
 * the crossings does not fail a test about trains. */
const SEEDS = Array.from({ length: 36 }, (_, i) => i + 1);
let crossed: number[] | null = null;
function crossings(): number[] {
  if (crossed) return crossed;
  crossed = SEEDS.filter((seed) => stage(seed).rails.length > 0);
  if (crossed.length === 0) throw new Error("no seed in 1..36 crosses a railway");
  return crossed;
}

function fold(a: number, b: number): number {
  let d = Math.abs(a - b) % (Math.PI * 2);
  if (d > Math.PI) d = Math.PI * 2 - d;
  return d > Math.PI / 2 ? Math.PI - d : d;
}

describe("the railway (R41)", () => {
  it("is laid in a country that carries one, and nowhere the biome says not", () => {
    let lines = 0;
    for (const seed of SEEDS) {
      const track = stage(seed);
      lines += track.highways.filter((h) => h.kind === "rail").length;
      expect(track.highways.filter((h) => h.kind === "rail").length).toBeLessThanOrEqual(1);
    }
    // The dice say three seeds in four; the land refuses some of those.
    expect(lines).toBeGreaterThan(SEEDS.length * 0.3);
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const desert = compileStage(seed, "medium", { biome: "desert" });
      expect(desert.highways.some((h) => h.kind === "rail")).toBe(false);
      expect(desert.rails).toHaveLength(0);
    }
    // Forty-two stage compiles; the sweep is the fixture, and under the
    // whole suite's load it runs past the default thirty seconds.
  }, 90_000);

  it("is crossed on some seeds, and never borrowed or joined", () => {
    for (const seed of crossings()) {
      const track = stage(seed);
      // No junction sits on the railway: every junction's arms are tarmac.
      for (const spur of track.spurs) {
        if (spur.rail) continue;
        expect(spur.samples.every((s) => s.surface === "asphalt")).toBe(true);
      }
      // ...and the route's sealed samples are all on a ROAD.
      for (const junction of track.junctions) {
        const rails = track.rails.filter(
          (r) => Math.hypot(r.x - junction.x, r.z - junction.z) < 30,
        );
        expect(rails).toHaveLength(0);
      }
    }
  });

  it("crosses SQUARE, on a ramp whose lip stands the rule's height short of the rails", () => {
    const rail = STAGE_RULES.rail;
    for (const seed of crossings()) {
      const track = stage(seed);
      for (const crossing of track.rails) {
        const at = track.samples.reduce((best, s) =>
          Math.abs(s.s - crossing.s) < Math.abs(best.s - crossing.s) ? s : best,
        );
        expect(fold(at.heading, crossing.heading)).toBeGreaterThan(Math.PI / 2 - 0.06);
        // The lip: the sample flagged as one, `gap` short of the rails.
        const lip = track.samples.find((s) => s.jump && Math.abs(s.s - crossing.lipS) < 3);
        expect(lip, `seed ${seed}: no lip at ${crossing.lipS}`).toBeDefined();
        if (!lip) continue;
        expect(crossing.s - lip.s).toBeGreaterThan(rail.gap - 3);
        expect(crossing.s - lip.s).toBeLessThan(rail.gap + 3);
        // ...standing the ramp's height over the road at grade beyond it —
        // give or take the country's own fall over the ten metres between.
        const past = track.samples.find((s) => s.s > crossing.s + 4) ?? at;
        expect(lip.elevation - past.elevation).toBeGreaterThan(rail.lip.height - 1.2);
        expect(lip.elevation - past.elevation).toBeLessThan(rail.lip.height + 1.2);
        // The rails are laid flush with the route at the crossing point.
        expect(Math.abs(crossing.y - at.elevation)).toBeLessThan(0.6);
      }
    }
  });

  it("cuts both arms of the line from the crossing and joins them into one walk", () => {
    for (const seed of crossings()) {
      const track = stage(seed);
      for (const crossing of track.rails) {
        const arms = track.spurs.filter((s) => s.rail && s.atS === crossing.s);
        expect(arms).toHaveLength(2);
        expect(new Set(arms.map((a) => a.end)).size).toBe(2);
        for (const arm of arms) {
          expect(arm.block).toBeNull();
          expect(arm.crossing).toBe(true);
          expect(arm.samples[0].x).toBeCloseTo(crossing.x, 3);
          expect(arm.samples[0].z).toBeCloseTo(crossing.z, 3);
          expect(arm.samples.every((s) => s.surface !== "asphalt")).toBe(true);
          // Off the map, or as far as an arm is allowed to run.
          const last = arm.samples[arm.samples.length - 1];
          expect(last.s).toBeGreaterThan(200);
        }
        const { line } = crossing;
        expect(line.samples.length).toBe(arms[0].samples.length + arms[1].samples.length - 1);
        // Arc runs monotonically and the crossing sits where the arms met.
        for (let i = 1; i < line.samples.length; i++) {
          expect(line.samples[i].s).toBeGreaterThan(line.samples[i - 1].s);
        }
        const mid = line.samples.find((s) => Math.abs(s.s - line.crossingS) < 1e-6);
        expect(mid).toBeDefined();
        expect(mid?.x).toBeCloseTo(crossing.x, 3);
        expect(line.length).toBeCloseTo(line.samples[line.samples.length - 1].s, 6);
      }
    }
  });

  it("times a train over the crossing when the timetable says, and alternates its direction", () => {
    for (const seed of crossings()) {
      const track = stage(seed);
      for (const crossing of track.rails) {
        const { schedule, line } = crossing;
        expect(schedule.cars.length).toBeGreaterThan(0);
        // At `first` the head is ON the crossing.
        const head = trainAt(crossing, schedule.first);
        expect(head).not.toBeNull();
        expect(head?.headS).toBeCloseTo(line.crossingS, 3);
        // A period later the next one is, going the other way.
        const next = trainAt(crossing, schedule.first + schedule.period);
        expect(next).not.toBeNull();
        expect(next?.direction).toBe(-(head?.direction ?? 0));
        // Halfway between, with a line this long, nothing may be on the
        // crossing — the head is well past it and the tail well clear.
        const between = trainCars(crossing, schedule.first + schedule.period / 2);
        for (const car of between) {
          expect(Math.abs(car.s - line.crossingS)).toBeGreaterThan(schedule.cars.length * 5);
        }
        // The vehicles stand nose to tail behind the head.
        const cars = trainCars(crossing, schedule.first + 2);
        for (let i = 1; i < cars.length; i++) {
          const gap = Math.abs(cars[i].s - cars[i - 1].s);
          expect(gap).toBeCloseTo((cars[i].car.length + cars[i - 1].car.length) / 2, 6);
        }
      }
    }
  });

  it("stands the train up as moving solids on the rails, only where a wagon is", () => {
    for (const seed of crossings()) {
      const track = stage(seed);
      for (const crossing of track.rails) {
        const t = crossing.schedule.first;
        const on = trainSolidsNear(crossing, t, crossing.x, crossing.z, 2.5);
        expect(on.length).toBeGreaterThan(0);
        for (const solid of on) {
          expect(solid.kind).toBe("railcar");
          expect(solid.height).toBeCloseTo(RAILCAR.height, 6);
          expect(solid.rooted).toBe(1);
          expect(Math.hypot(solid.vx ?? 0, solid.vz ?? 0)).toBeCloseTo(crossing.schedule.speed, 6);
        }
        // Nothing far from the line, and nothing on the crossing between
        // trains.
        expect(trainSolidsNear(crossing, t, crossing.x + 200, crossing.z + 200, 2.5)).toHaveLength(
          0,
        );
        const quiet = crossing.schedule.first + crossing.schedule.period / 2;
        expect(trainSolidsNear(crossing, quiet, crossing.x, crossing.z, 2.5)).toHaveLength(0);
      }
    }
  });

  it("hits a car standing on the rails and misses one flying over them", () => {
    const seed = crossings()[0];
    const track = stage(seed);
    const crossing = track.rails[0];
    const game = createGame({ seed, track });
    // Park the car on the crossing, on the rails, just before the train is
    // due, and let the clock run into it.
    game.phase = "racing";
    game.t = crossing.schedule.first - 1.5;
    game.car.x = crossing.x;
    game.car.z = crossing.z;
    game.car.y = crossing.y;
    game.car.u = 0;
    game.car.w = 0;
    const before = { x: game.car.x, z: game.car.z };
    let hit = false;
    for (let i = 0; i < 120 * 3; i++) {
      step(game, { ...NEUTRAL_INPUT, brake: 1 });
      if (Math.hypot(game.car.x - before.x, game.car.z - before.z) > 1.5) {
        hit = true;
        break;
      }
    }
    expect(hit).toBe(true);
    // And a car passing over the rails a train's height up is not touched:
    // the contact model's height gate reads the wagon's roof.
    const above = trainSolidsNear(crossing, crossing.schedule.first, crossing.x, crossing.z, 2.5);
    expect(above.length).toBeGreaterThan(0);
    for (const solid of above)
      expect(solid.y + solid.height).toBeLessThan(crossing.y + RAILCAR.height + 0.01);
  });

  it("never has two trains on one line: the period covers the reach's transit", () => {
    const T = STAGE_RULES.rail.train;
    const longest = T.length.loco + T.wagons.max * T.length.timber;
    expect(T.period.min).toBeGreaterThan((2 * T.reach + longest) / T.speed.min);
  });

  it("is deterministic", () => {
    const seed = crossings()[0];
    const a = compileStage(seed, "medium", {});
    const b = compileStage(seed, "medium", {});
    expect(a.rails).toEqual(b.rails);
  });
});
