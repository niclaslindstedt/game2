// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// R47 — THE MOUNTAINS. The alpine is the country where the geography comes
// first and the road is made to fit it: a massif with a valley floor and a
// snowline, a stage that starts beside the snow and comes down, corners
// drawn by reading the land, tunnels where a shoulder is in the way, and
// snow on the road above the line. And the one rule that binds all of it:
// none of it touches the taiga or the desert — every seed they ever built
// is the seed they still build.
import { describe, expect, it } from "vitest";

import {
  BIOMES,
  DEFAULT_KNOBS,
  GROUND_CELL,
  LAKE_Y,
  ROAD_CROSS,
  STAGE_RULES,
  TUNING,
  compileStage,
  createTerrain,
  generateStage,
  isLoose,
  resolveKnobs,
  straightPart,
  tunnelTrench,
  type Track,
} from "@engine";

const SEEDS = [1, 3, 4];
const KNOBS = { biome: "alpine" as const, asphalt: 0.5 };

const built = new Map<number, { track: Track; terrain: ReturnType<typeof createTerrain> }>();
function stage(seed: number): { track: Track; terrain: ReturnType<typeof createTerrain> } {
  const kept = built.get(seed);
  if (kept) return kept;
  const track = compileStage(seed, "medium", KNOBS, "sprint");
  const terrain = createTerrain(track);
  terrain.sync(track.length);
  const out = { track, terrain };
  built.set(seed, out);
  return out;
}

/** A cheap digest of a built stage: its line and its heights. */
function digest(track: Track): number {
  let h = 0;
  for (const s of track.samples) {
    h = (h * 31 + Math.round((s.x + s.z * 7 + s.elevation * 13) * 100)) % 1000000007;
  }
  return h;
}

describe("R47 — the alpine row", () => {
  it("is a mountain country with water, a massif, zones and the rest of the machinery on", () => {
    const A = BIOMES.alpine;
    expect(A.land.massif).not.toBeNull();
    expect(A.land.mountains).toBe(0);
    expect(A.water).toBe(true);
    expect(A.loose).toBe("gravel");
    expect(A.land.tunnels).toBe(true);
    expect(A.land.steer).toBeGreaterThan(0);
    expect(A.land.startHigh).toBe(true);
    expect(A.land.grade).toBeGreaterThan(1);
    const Z = A.land.zones;
    expect(Z.treeline).toBeLessThan(Z.rock.from);
    expect(Z.rock.from).toBeLessThan(Z.rock.to);
    expect(Z.snow).not.toBeNull();
    expect(Z.snow as number).toBeGreaterThan(Z.rock.from);
    // ...and the other two countries carry none of it, which is what keeps
    // their seeds where they were.
    for (const id of ["taiga", "desert"] as const) {
      const L = BIOMES[id].land;
      expect(L.massif).toBeNull();
      expect(L.steer).toBe(0);
      expect(L.tunnels).toBe(false);
      expect(L.grade).toBe(1);
      expect(L.startHigh).toBe(false);
      expect(L.zones.snow).toBeNull();
    }
  });

  it("has a snow surface that is loose, softer and slipperier than gravel", () => {
    const S = TUNING.surfaces;
    expect(isLoose("snow")).toBe(true);
    expect(S.grip.snow).toBeLessThan(S.grip.sand);
    expect(S.breakaway.snow).toBeGreaterThan(S.breakaway.gravel);
    expect(S.give.snow).toBeGreaterThan(S.give.gravel);
    expect(S.power.snow).toBeLessThan(S.power.gravel);
  });

  it("offers a peaks dial that only a massif reads, resting at the row", () => {
    expect(DEFAULT_KNOBS.peaks).toBe(0.5);
    expect(resolveKnobs({ peaks: 3 }).peaks).toBe(1);
    // The taiga at any peaks position is the taiga.
    const flat = compileStage(2, "short", { peaks: 0 }, "sprint");
    const range = compileStage(2, "short", { peaks: 1 }, "sprint");
    expect(digest(flat)).toBe(digest(compileStage(2, "short", {}, "sprint")));
    expect(digest(range)).toBe(digest(flat));
    // ...and the alpine at 0 and 1 is two different countries.
    const one = compileStage(2, "short", { ...KNOBS, peaks: 0 }, "sprint");
    const many = compileStage(2, "short", { ...KNOBS, peaks: 1 }, "sprint");
    expect(digest(one)).not.toBe(digest(many));
  });
});

describe("R47 — the stage is made to fit the mountain", () => {
  it("is deterministic per seed", () => {
    for (const seed of SEEDS) {
      expect(generateStage(seed, "medium", KNOBS)).toEqual(generateStage(seed, "medium", KNOBS));
    }
  });

  it("starts beside the snow and mostly comes down", () => {
    const snow = BIOMES.alpine.land.zones.snow as number;
    let down = 0;
    for (const seed of SEEDS) {
      const { track } = stage(seed);
      const start = track.samples[0].elevation;
      expect(start).toBeGreaterThan(snow - 90);
      expect(start).toBeLessThan(snow + 70);
      expect(start).toBeGreaterThan(LAKE_Y + 100);
      const end = track.samples[track.samples.length - 1].elevation;
      if (end < start - 40) down++;
    }
    expect(down).toBeGreaterThanOrEqual(2);
  });

  it("puts snow on the road above the snowline and nowhere else", () => {
    const snow = BIOMES.alpine.land.zones.snow as number;
    let snowy = 0;
    for (const seed of SEEDS) {
      const { track } = stage(seed);
      for (const s of track.samples) {
        if (s.surface === "snow") {
          snowy++;
          expect(s.elevation).toBeGreaterThan(snow - 0.5);
          expect(s.tunnel).toBe(false);
          expect(s.deck).toBeNull();
        } else if (s.surface !== "water" && s.deck === null && !s.tunnel) {
          expect(s.elevation).toBeLessThanOrEqual(snow + 0.5);
        }
      }
    }
    expect(snowy).toBeGreaterThan(0);
  });

  it("bores a tunnel through a shoulder: level inside, the country over it, walls beside it", () => {
    const T = STAGE_RULES.tunnel;
    let tunnels = 0;
    for (const seed of SEEDS) {
      const { track, terrain } = stage(seed);
      for (const plan of track.segments) {
        if (plan.feature !== "tunnel") continue;
        tunnels++;
        expect(plan.kind).toBe("straight");
        const bore = (plan.featureEnd ?? 0) - (plan.featureStart ?? 0);
        expect(bore).toBeGreaterThanOrEqual(T.minLength);
        expect(bore).toBeLessThanOrEqual(T.maxLength + 1);
        // R38 — the bored run is not straight run.
        expect(straightPart(plan)).toBeLessThanOrEqual(plan.length - bore + 1e-6);
        expect(plan.length).toBeGreaterThanOrEqual((plan.featureEnd ?? 0) + T.portal - 1e-6);
      }
      // The samples: a run of them flagged, gentle inside, the bare land a
      // bore's depth over the middle, and a wall of solids either side.
      const runs: number[][] = [];
      for (let i = 0; i < track.samples.length; i++) {
        if (!track.samples[i].tunnel) continue;
        const last = runs[runs.length - 1];
        if (last && last[1] === i - 1) last[1] = i;
        else runs.push([i, i]);
      }
      for (const [a, b] of runs) {
        const mid = track.samples[Math.floor((a + b) / 2)];
        const country = terrain.geology.surfaceAt(mid.x, mid.z);
        expect(country - mid.elevation).toBeGreaterThan(T.depth - 3);
        // ...and a MOUNTAIN over it somewhere along the run: a bore is
        // what the search chose over blasting a shoulder open, so the
        // country stands `cover` over the road at its deepest (the search
        // measured it on its own coarser walk; a few metres of slack).
        let deepest = 0;
        for (let i = a; i <= b; i++) {
          const s = track.samples[i];
          deepest = Math.max(deepest, terrain.farHeightAt(s.x, s.z) - s.elevation);
        }
        expect(deepest).toBeGreaterThan(T.cover - 5);
        // The lattice under a bore is a TRENCH: the corridor shelf at road
        // level along the bore, the bare mountain beyond the lip — the lid
        // over it is the renderer's (tunnel.ts). So the analytic field over
        // the centreline is the road's own level, and a road's width and a
        // lattice cell out it is the country again.
        expect(Math.abs(terrain.heightAt(mid.x, mid.z) - mid.elevation)).toBeLessThan(1.5);
        // ...and the lid the lining draws over it is the mountain inside
        // the lip and the lattice itself beyond, so it never floats.
        expect(Math.abs(terrain.lidAt(mid.x, mid.z) - country)).toBeLessThan(0.75);
        const out =
          track.width / 2 + ROAD_CROSS.reach + tunnelTrench(track.width) + GROUND_CELL + 2;
        const nx = Math.cos(mid.heading);
        const nz = -Math.sin(mid.heading);
        for (const side of [-1, 1]) {
          const x = mid.x + side * out * nx;
          const z = mid.z + side * out * nz;
          expect(terrain.lidAt(x, z)).toBe(terrain.heightAt(x, z));
        }
        // Level inside, give or take the road's own roll (R34), which is
        // continuous through the bore and a few per cent at most.
        for (let i = a + 1; i <= b; i++) {
          const run = track.samples[i].s - track.samples[i - 1].s;
          const grade = (track.samples[i].elevation - track.samples[i - 1].elevation) / run;
          expect(Math.abs(grade)).toBeLessThan(T.level + 0.06);
        }
        const walls = terrain.fixturesNear(mid.x, mid.z, track.width);
        expect(walls.filter((w) => w.kind === "wall").length).toBeGreaterThanOrEqual(2);
        // ...and no split board stands inside.
        for (const cp of track.checkpoints) expect(cp.index < a || cp.index > b).toBe(true);
      }
    }
    expect(tunnels).toBeGreaterThan(0);
  });
});

describe("R47 — the other countries are untouched", () => {
  it("builds the taiga and the desert exactly as before the mountains existed", () => {
    // Digests of seeds 1 and 2 at medium on the tree before R47, taken by
    // the same arithmetic. A change here is a re-roll of every stage in the
    // campaign and every fixture in the suite, and is a bug unless a
    // generator change meant it.
    expect(digest(compileStage(1, "medium", {}, "sprint"))).toBe(772086305);
    expect(digest(compileStage(2, "medium", {}, "sprint"))).toBe(136010527);
    expect(digest(compileStage(1, "medium", { biome: "desert" }, "sprint"))).toBe(
      digest(compileStage(1, "medium", { biome: "desert", peaks: 1 }, "sprint")),
    );
  });
});
