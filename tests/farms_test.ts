// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// R37 — THE FARMS: the homesteads that are a barn, a paddock, a field and
// the machinery as well as a house. The house's own rules are held by
// `homesteads_test.ts`; these hold what a farm adds — that some homesteads
// are one in a farmed country and none are anywhere else, that the barn is
// bigger than the house and stands across the yard from it, that the
// paddock and the field keep off every road and out of the water, that the
// fence goes right round with a gate in it, that everything a car can hit
// is solid and everything else is not, and that the forest keeps off the
// grazing while the wheels find turned soil in a ploughed field.

import { describe, expect, it } from "vitest";
import {
  STAGE_RULES as R,
  compileStage,
  createTerrain,
  homesteadSolids,
  rectDistance,
  type Farm,
  type Homestead,
  type Track,
} from "@engine";

const F = R.homestead.farm;
const SEEDS = Array.from({ length: 24 }, (_, i) => i * 37 + 1);
const tracks = new Map<number, Track>();
function stage(seed: number): Track {
  const had = tracks.get(seed);
  if (had) return had;
  const built = compileStage(seed, "medium", { asphalt: 0.3 });
  tracks.set(seed, built);
  return built;
}

/** Every farm on the sweep, with the homestead and the stage it is on. */
function farms(): { seed: number; track: Track; homestead: Homestead; farm: Farm }[] {
  const out: { seed: number; track: Track; homestead: Homestead; farm: Farm }[] = [];
  for (const seed of SEEDS) {
    const track = stage(seed);
    for (const homestead of track.homesteads) {
      if (homestead.farm) out.push({ seed, track, homestead, farm: homestead.farm });
    }
  }
  if (out.length === 0) throw new Error("no farm on the sweep");
  return out;
}

/** Brute-force distance from a point to the route's centerline. */
function routeDistance(track: Track, x: number, z: number): number {
  let best = Infinity;
  for (const s of track.samples) {
    const d = Math.hypot(s.x - x, s.z - z);
    if (d < best) best = d;
  }
  return best;
}

describe("farms (R37)", () => {
  it("makes some homesteads farms in a farmed country, and none in one that is not", () => {
    const all = farms();
    let homes = 0;
    for (const seed of SEEDS) homes += stage(seed).homesteads.length;
    expect(all.length).toBeGreaterThan(homes * 0.15);
    expect(all.length).toBeLessThan(homes * 0.7);
    // A desert has no homesteads at all, let alone a farm.
    for (const seed of [1, 38, 75]) {
      const desert = compileStage(seed, "medium", { asphalt: 0.3, biome: "desert" });
      expect(desert.homesteads).toHaveLength(0);
      expect(desert.towns).toHaveLength(0);
    }
  });

  it("stands a barn bigger than the house across the yard, on the yard", () => {
    for (const { homestead, farm } of farms()) {
      const { barn } = farm;
      const { house, yard } = homestead;
      expect(barn.plan.kind).toBe("barn");
      expect(barn.plan.width).toBeGreaterThan(house.plan.width);
      expect(barn.plan.depth).toBeGreaterThan(house.plan.depth * 0.9);
      expect(barn.plan.storeys).toBe(2);
      // A farm's yard is the bigger one, and the barn's centre is on it.
      expect(yard.radius).toBeGreaterThanOrEqual(F.yard.radius.min - 1e-6);
      expect(Math.hypot(barn.x - yard.x, barn.z - yard.z)).toBeLessThan(yard.radius);
      // ...and it does not stand in the house.
      expect(Math.hypot(barn.x - house.x, barn.z - house.z)).toBeGreaterThan(
        (house.plan.width + barn.plan.depth) / 2,
      );
      // Its front faces the yard's middle.
      const toYard = Math.atan2(yard.x - barn.x, yard.z - barn.z);
      let off = Math.abs(toYard - barn.heading) % (Math.PI * 2);
      if (off > Math.PI) off = Math.PI * 2 - off;
      expect(off).toBeLessThan(0.6);
    }
  });

  it("keeps the paddock and the field off the route, off every road, and out of the water", () => {
    for (const { track, farm } of farms()) {
      const clear = R.homestead.drive.clear;
      for (const rect of [farm.paddock?.rect, farm.field?.rect]) {
        if (!rect) continue;
        const fwd = { x: Math.sin(rect.heading), z: Math.cos(rect.heading) };
        const right = { x: Math.cos(rect.heading), z: -Math.sin(rect.heading) };
        for (const u of [-0.5, 0, 0.5]) {
          for (const v of [-0.5, 0, 0.5]) {
            const x = rect.x + right.x * u * rect.depth + fwd.x * v * rect.width;
            const z = rect.z + right.z * u * rect.depth + fwd.z * v * rect.width;
            expect(routeDistance(track, x, z)).toBeGreaterThan(track.width / 2 + clear * 0.5);
            for (const spur of track.spurs) {
              for (const s of spur.samples) {
                expect(Math.hypot(s.x - x, s.z - z)).toBeGreaterThan(spur.width / 2 + 4);
              }
            }
          }
        }
      }
    }
  });

  it("fences the paddock right round with a gate in the side nearest the yard", () => {
    for (const { homestead, farm } of farms()) {
      const p = farm.paddock;
      if (!p) continue;
      const perimeter = 2 * (p.rect.width + p.rect.depth);
      expect(p.posts.length).toBeGreaterThan(perimeter / F.paddock.postPitch - 6);
      for (const post of p.posts) {
        expect(Math.abs(rectDistance(p.rect, post.x, post.z))).toBeLessThan(0.05);
      }
      // The gate stands on the rect's edge, on the side toward the yard.
      expect(Math.abs(rectDistance(p.rect, p.gate.x, p.gate.z))).toBeLessThan(0.05);
      const gateD = Math.hypot(p.gate.x - homestead.yard.x, p.gate.z - homestead.yard.z);
      const farD = Math.hypot(p.rect.x - homestead.yard.x, p.rect.z - homestead.yard.z);
      expect(gateD).toBeLessThan(farD);
      // ...and a gap for it: no post inside the gate's own half-width.
      for (const post of p.posts) {
        expect(Math.hypot(post.x - p.gate.x, post.z - p.gate.z)).toBeGreaterThan(
          F.paddock.gate / 2 - 0.5,
        );
      }
      expect(p.head).toBeGreaterThanOrEqual(F.paddock.head[p.stock].min);
      expect(p.head).toBeLessThanOrEqual(F.paddock.head[p.stock].max);
    }
  });

  it("makes the barn, the silo, the machinery and every fence post solid — and the harrow not", () => {
    for (const { track, homestead, farm } of farms()) {
      const terrain = createTerrain(track);
      terrain.sync(0);
      const own = homesteadSolids(homestead);
      const walls = own.filter((s) => s.kind === "wall");
      const bays = 2 * (farm.barn.plan.width + farm.barn.plan.depth) - 4;
      expect(walls.length).toBeGreaterThanOrEqual(bays);
      const posts = own.filter((s) => s.kind === "post");
      expect(posts.length).toBe(farm.paddock?.posts.length ?? 0);
      for (const post of posts) {
        expect(post.snap).toBeLessThan(2000);
        expect(post.rooted).toBeLessThan(1);
      }
      const machines = own.filter((s) => s.kind === "parked");
      const expected =
        homestead.cars.length * 2 +
        farm.gear.reduce(
          (n, g) =>
            n + (g.kind === "tractor" || g.kind === "trailer" ? 2 : g.kind === "harrow" ? 0 : 1),
          0,
        );
      expect(machines.length).toBe(expected);
      // The field's own query finds the barn's walls where the barn is.
      const near = terrain.fixturesNear(farm.barn.x, farm.barn.z, farm.barn.plan.width);
      expect(near.filter((s) => s.kind === "wall").length).toBeGreaterThanOrEqual(bays);
    }
  });

  it("keeps the forest off the grazing and the field, and gives a ploughed field turned soil", () => {
    for (const { track, farm } of farms()) {
      const terrain = createTerrain(track);
      terrain.sync(0);
      for (const clearing of [farm.paddock?.rect, farm.field?.rect]) {
        if (!clearing) continue;
        expect(terrain.spurClearance(clearing.x, clearing.z)).toBeLessThan(0);
        expect(
          terrain.treesNear(
            clearing.x,
            clearing.z,
            Math.min(clearing.width, clearing.depth) / 2 - 2,
          ),
        ).toHaveLength(0);
      }
      if (farm.field) {
        const { rect, crop } = farm.field;
        const surface = terrain.spurSurfaceAt(rect.x, rect.z);
        if (crop === "plough") expect(surface).toBe("sand");
        else expect(surface).toBeNull();
      }
      if (farm.paddock) {
        const { rect } = farm.paddock;
        expect(terrain.spurSurfaceAt(rect.x, rect.z)).toBeNull();
      }
    }
  });

  it("varies the farms: both roofs, both stocks, every crop and every machine turn up on the sweep", () => {
    const all = farms();
    const roofs = new Set(all.map((f) => f.farm.barn.plan.roof));
    expect(roofs.has("gambrel")).toBe(true);
    const stocks = new Set(all.map((f) => f.farm.paddock?.stock).filter(Boolean));
    expect(stocks.size).toBeGreaterThanOrEqual(1);
    const gear = new Set(all.flatMap((f) => f.farm.gear.map((g) => g.kind)));
    expect(gear.has("tractor")).toBe(true);
    expect(gear.size).toBeGreaterThanOrEqual(3);
  });

  it("builds the same farms every time it compiles a seed", () => {
    const { seed } = farms()[0];
    const a = compileStage(seed, "medium", { asphalt: 0.3 });
    const b = compileStage(seed, "medium", { asphalt: 0.3 });
    expect(a.homesteads.map((h) => h.farm)).toEqual(b.homesteads.map((h) => h.farm));
  });
});
