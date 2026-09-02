// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// R43 — THE ENERGY: the wind farms on the high ground and the solar farms
// on the flat. These hold that a modern country has them and a desert has
// none, that a wind farm is a string of huge machines standing OVER the
// road it is seen from and off every road by more than a rotor, that a
// solar farm is a fenced rectangle of tables on level ground facing the
// sun, that both keep off the water and the settled places, that
// everything a car can hit is solid and the forest keeps off the ground
// they take, and that a seed builds the same farms every time — chunked or
// not.

import { describe, expect, it } from "vitest";
import {
  STAGE_RULES as R,
  compileStage,
  createTerrain,
  rectDistance,
  solarFarmSolids,
  solarTables,
  windFarmSolids,
  type SolarFarm,
  type Track,
  type WindFarm,
} from "@engine";

import { SUN_AZIMUTH } from "../pwa/src/game/sky.ts";

const W = R.energy.wind;
const S = R.energy.solar;
const SEEDS = Array.from({ length: 24 }, (_, i) => i * 37 + 1);
const tracks = new Map<number, Track>();
function stage(seed: number): Track {
  const had = tracks.get(seed);
  if (had) return had;
  const built = compileStage(seed, "medium", { asphalt: 0.3 });
  tracks.set(seed, built);
  return built;
}

function windFarms(): { seed: number; track: Track; farm: WindFarm }[] {
  const out: { seed: number; track: Track; farm: WindFarm }[] = [];
  for (const seed of SEEDS) {
    const track = stage(seed);
    for (const farm of track.windFarms) out.push({ seed, track, farm });
  }
  if (out.length === 0) throw new Error("no wind farm on the sweep");
  return out;
}

function solarFarms(): { seed: number; track: Track; farm: SolarFarm }[] {
  const out: { seed: number; track: Track; farm: SolarFarm }[] = [];
  for (const seed of SEEDS) {
    const track = stage(seed);
    for (const farm of track.solarFarms) out.push({ seed, track, farm });
  }
  if (out.length === 0) throw new Error("no solar farm on the sweep");
  return out;
}

/** Brute-force distance from a point to the route's centerline, and the
 * route's elevation at the nearest sample. */
function nearestRoute(track: Track, x: number, z: number): { d: number; elevation: number } {
  let best = Infinity;
  let elevation = 0;
  for (const s of track.samples) {
    const d = Math.hypot(s.x - x, s.z - z);
    if (d < best) {
      best = d;
      elevation = s.elevation;
    }
  }
  return { d: best, elevation };
}

/** The four corners and the middle of a rect. */
function rectProbes(rect: SolarFarm["rect"]): { x: number; z: number }[] {
  const fwd = { x: Math.sin(rect.heading), z: Math.cos(rect.heading) };
  const right = { x: Math.cos(rect.heading), z: -Math.sin(rect.heading) };
  const out: { x: number; z: number }[] = [];
  for (const u of [-0.5, 0, 0.5]) {
    for (const v of [-0.5, 0, 0.5]) {
      out.push({
        x: rect.x + right.x * u * rect.depth + fwd.x * v * rect.width,
        z: rect.z + right.z * u * rect.depth + fwd.z * v * rect.width,
      });
    }
  }
  return out;
}

describe("energy (R43)", () => {
  it("builds wind farms and solar farms in the taiga, and none in the desert", () => {
    const wind = windFarms();
    const solar = solarFarms();
    // About one of each per stage over the sweep: a landmark, not a row of
    // them, and not a rarity either.
    expect(wind.length).toBeGreaterThan(SEEDS.length * 0.5);
    expect(wind.length).toBeLessThan(SEEDS.length * 2);
    expect(solar.length).toBeGreaterThan(SEEDS.length * 0.4);
    expect(solar.length).toBeLessThan(SEEDS.length * 2);
    for (const seed of [1, 38, 75]) {
      const desert = compileStage(seed, "medium", { asphalt: 0.3, biome: "desert" });
      expect(desert.windFarms).toHaveLength(0);
      expect(desert.solarFarms).toHaveLength(0);
    }
  });

  it("strings three to seven huge machines along a rise, over the road and off every road by more than a rotor", () => {
    for (const { track, farm } of windFarms()) {
      expect(farm.turbines.length).toBeGreaterThanOrEqual(W.count.min);
      expect(farm.turbines.length).toBeLessThanOrEqual(W.count.max);
      expect(farm.hub).toBeGreaterThanOrEqual(W.hub.min);
      expect(farm.rotor).toBeGreaterThanOrEqual(W.rotor.min);
      // Two hundred metres to the tip, give or take: this is the biggest
      // thing on the stage by an order of magnitude.
      expect(farm.hub + farm.rotor / 2).toBeGreaterThan(160);
      let highest = -Infinity;
      let roadUnder = Infinity;
      for (const t of farm.turbines) {
        const near = nearestRoute(track, t.x, t.z);
        expect(near.d).toBeGreaterThanOrEqual(W.clear.route - 1);
        expect(near.d).toBeGreaterThan(farm.rotor / 2 + track.width);
        for (const spur of track.spurs) {
          for (const s of spur.samples) {
            expect(Math.hypot(s.x - t.x, s.z - t.z)).toBeGreaterThan(W.clear.road - 1);
          }
        }
        for (const h of track.highways) {
          for (const p of h.points) {
            expect(Math.hypot(p.x - t.x, p.z - t.z)).toBeGreaterThan(W.clear.road - 1);
          }
        }
        if (t.y > highest) {
          highest = t.y;
          roadUnder = near.elevation;
        }
      }
      // The string stands ON the high ground: its top tower over the road
      // nearest it.
      expect(highest - roadUnder).toBeGreaterThan(W.rise - W.pad.level);
      // Every tower a pitch from the next along the string, near enough.
      for (let i = 1; i < farm.turbines.length; i++) {
        const a = farm.turbines[i - 1];
        const b = farm.turbines[i];
        expect(Math.hypot(b.x - a.x, b.z - a.z)).toBeGreaterThan(W.pitch.min * 0.6);
      }
    }
  });

  it("fences the solar farms on level ground beside the stage, every table facing the sun", () => {
    // The panels face the sun the sky actually lights the world from: the
    // engine's number and the renderer's are one number in two files.
    expect(S.facing).toBeCloseTo(SUN_AZIMUTH, 6);
    for (const { track, farm } of solarFarms()) {
      const { rect } = farm;
      expect(Math.abs(rect.heading - (S.facing + Math.PI / 2))).toBeLessThan(1e-9);
      for (const p of rectProbes(rect)) {
        expect(nearestRoute(track, p.x, p.z).d).toBeGreaterThan(track.width / 2 + 4);
        for (const spur of track.spurs) {
          for (const s of spur.samples) {
            expect(Math.hypot(s.x - p.x, s.z - p.z)).toBeGreaterThan(spur.width / 2 + 4);
          }
        }
      }
      expect(farm.rows).toBeGreaterThanOrEqual(1);
      expect(farm.perRow).toBeGreaterThanOrEqual(1);
      const tables = solarTables(farm);
      expect(tables).toHaveLength(farm.rows * farm.perRow);
      // Every table inside the fence, its row along the fence's width.
      for (const t of tables) {
        expect(rectDistance(rect, t.x, t.z)).toBeLessThan(-S.row.depth / 2);
        expect(Math.abs(t.heading - rect.heading)).toBeLessThan(1e-9);
      }
      // The fence goes right round, with a gap for the gate.
      const perimeter = 2 * (rect.width + rect.depth);
      expect(farm.posts.length).toBeGreaterThan(perimeter / S.fence.postPitch - 6);
      for (const post of farm.posts)
        expect(Math.abs(rectDistance(rect, post.x, post.z))).toBeLessThan(0.5);
      // The cabin inside the fence, and no table's end inside the cabin.
      const { cabin } = farm;
      if (cabin) {
        expect(rectDistance(rect, cabin.x, cabin.z)).toBeLessThan(-1);
        for (const t of tables) {
          const fwd = { x: Math.sin(t.heading), z: Math.cos(t.heading) };
          for (const end of [-1, 1]) {
            const ex = t.x + fwd.x * end * (S.row.table / 2);
            const ez = t.z + fwd.z * end * (S.row.table / 2);
            expect(rectDistance(cabin, ex, ez)).toBeGreaterThan(0.2);
          }
        }
      }
    }
  });

  it("rolls big farms and small ones, and most of them get a cabin", () => {
    const all = solarFarms();
    const areas = all.map((f) => f.farm.rect.width * f.farm.rect.depth);
    expect(Math.min(...areas)).toBeLessThan(45 * 30);
    expect(Math.max(...areas)).toBeGreaterThan(90 * 60);
    expect(all.filter((f) => f.farm.cabin !== null).length).toBeGreaterThan(all.length / 2);
  });

  it("keeps both off the water and off the settled places", () => {
    for (const { track, farm } of windFarms()) {
      const terrain = createTerrain(track);
      terrain.sync(0);
      for (const t of farm.turbines) {
        expect(terrain.waterAt(t.x, t.z)).toBeNull();
        for (const h of track.homesteads) {
          expect(Math.hypot(h.yard.x - t.x, h.yard.z - t.z)).toBeGreaterThan(W.clear.settled - 1);
        }
      }
    }
    for (const { track, farm } of solarFarms()) {
      const terrain = createTerrain(track);
      terrain.sync(0);
      for (const p of rectProbes(farm.rect)) {
        expect(terrain.waterAt(p.x, p.z)).toBeNull();
        for (const h of track.homesteads) {
          expect(Math.hypot(h.yard.x - p.x, h.yard.z - p.z)).toBeGreaterThan(S.clear.settled - 1);
        }
      }
    }
  });

  it("makes the towers, the tables, the posts and the cabin solid, and keeps the forest off the pads and the fence", () => {
    for (const { track, farm } of windFarms().slice(0, 8)) {
      const terrain = createTerrain(track);
      terrain.sync(0);
      for (const t of farm.turbines) {
        const walls = terrain.fixturesNear(t.x, t.z, 4).filter((s) => s.kind === "wall");
        expect(walls.length).toBeGreaterThanOrEqual(6);
        for (const w of walls) {
          expect(w.height).toBeGreaterThan(farm.hub - 1);
          expect(w.rooted).toBe(1);
        }
        // The pad is graded gravel with nothing growing on it.
        expect(terrain.spurClearance(t.x, t.z)).toBeLessThan(0);
        expect(terrain.spurSurfaceAt(t.x, t.z)).toBe("gravel");
        expect(terrain.treesNear(t.x, t.z, W.pad.radius - 1)).toHaveLength(0);
        // ...and level: the tower's foot stands on ground the terrain flattened.
        const y = terrain.groundAt(t.x, t.z);
        for (let k = 0; k < 4; k++) {
          const a = (k / 4) * Math.PI * 2;
          const r = W.pad.radius * 0.6;
          expect(
            Math.abs(terrain.groundAt(t.x + Math.cos(a) * r, t.z + Math.sin(a) * r) - y),
          ).toBeLessThan(0.6);
        }
      }
      const own = windFarmSolids(farm);
      expect(own.length).toBeGreaterThanOrEqual(farm.turbines.length * 6);
    }
    for (const { track, farm } of solarFarms().slice(0, 8)) {
      const terrain = createTerrain(track);
      terrain.sync(0);
      const tables = solarTables(farm);
      const t = tables[0];
      const bays = terrain.fixturesNear(t.x, t.z, S.row.table / 2).filter((s) => s.kind === "wall");
      expect(bays.length).toBeGreaterThanOrEqual(3);
      const p = farm.posts[0];
      expect(terrain.fixturesNear(p.x, p.z, 0.3).filter((s) => s.kind === "post")).toHaveLength(1);
      if (farm.cabin) {
        const cabinWalls = terrain
          .fixturesNear(farm.cabin.x, farm.cabin.z, farm.cabin.width)
          .filter((s) => s.kind === "wall");
        expect(cabinWalls.length).toBeGreaterThanOrEqual(
          2 * (farm.cabin.width + farm.cabin.depth) - 4,
        );
      }
      expect(terrain.spurClearance(farm.rect.x, farm.rect.z)).toBeLessThan(0);
      expect(terrain.spurSurfaceAt(farm.rect.x, farm.rect.z)).toBeNull();
      expect(
        terrain.treesNear(
          farm.rect.x,
          farm.rect.z,
          Math.min(farm.rect.width, farm.rect.depth) / 2 - 2,
        ),
      ).toHaveLength(0);
      const own = solarFarmSolids(farm);
      expect(own.filter((s) => s.kind === "post")).toHaveLength(farm.posts.length);
    }
  });

  it("builds the same farms every time it compiles a seed", () => {
    for (const seed of SEEDS.slice(0, 6)) {
      const a = compileStage(seed, "medium", { asphalt: 0.3 });
      const b = compileStage(seed, "medium", { asphalt: 0.3 });
      expect(a.windFarms).toEqual(b.windFarms);
      expect(a.solarFarms).toEqual(b.solarFarms);
    }
  });

  it("streams farms on an endless stage that obey the rules however the extends are chunked", () => {
    // A farm is placed against the road as far as it has been laid, and a
    // string of towers reaches half a kilometre off it: the road the stream
    // lays later can fold back toward a tower the single call would have
    // refused. So the chunked stream is held to the RULES on the finished
    // road — never on it, never in the water — not to the metre.
    for (const seed of [7, 23]) {
      const b = compileStage(seed, "endless");
      for (let s = 1500; s <= 7000; s += 331) b.extend?.(s);
      b.extend?.(7000);
      expect(b.windFarms.length + b.solarFarms.length).toBeGreaterThan(0);
      for (const farm of b.windFarms) {
        for (const t of farm.turbines) {
          expect(nearestRoute(b, t.x, t.z).d).toBeGreaterThan(W.pad.radius + b.width / 2);
        }
      }
      for (const farm of b.solarFarms) {
        for (const p of rectProbes(farm.rect)) {
          expect(nearestRoute(b, p.x, p.z).d).toBeGreaterThan(b.width / 2 + 4);
        }
      }
    }
  });
});
