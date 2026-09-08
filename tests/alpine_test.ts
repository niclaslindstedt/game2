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
  CLIMATE,
  DEFAULT_KNOBS,
  GROUND_CELL,
  LAKE_Y,
  ROAD_CROSS,
  STAGE_RULES,
  TUNING,
  altitudeMul,
  altitudeOf,
  NEUTRAL_INPUT,
  compileStage,
  createGame,
  createGeology,
  createTerrain,
  step,
  generateStage,
  isLoose,
  landOf,
  lapseOf,
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

// R47 — THE ALTITUDE DIAL. How high the mountain the race is on stands, in
// metres, from a worn shoulder to six thousand — and the four things that
// have to move with it for the result to be a country rather than a wall:
// the ground the crest stands on, how hard the flank is bent about it, how
// much of what is between the ridges is valley floor, and the elevation
// bands the paint and the planting read.
//
// The claims here are the ones the dial is FOR, and each of them is a thing
// the exponents in `STAGE_RULES.massif.altitude` can silently undo.
describe("R47 — how high the race is", () => {
  const at = (altitude: number) => resolveKnobs({ ...KNOBS, altitude });

  it("prints metres from a shoulder to six thousand, and rests on the row it was tuned at", () => {
    // The two ends the slider shows. These are what the row PRINTS, so they
    // are held here rather than left to the factors that make them.
    expect(Math.round(altitudeOf(at(0)))).toBe(176);
    expect(Math.round(altitudeOf(at(1)))).toBe(6000);
    // ...and the metres are the GROUND's, not the arithmetic's: what the
    // row prints is what the country actually tops out at (`summit`).
    const geology = createGeology(3, at(1));
    let summit = -Infinity;
    for (let x = -4000; x <= 4000; x += 200) {
      for (let z = -4000; z <= 4000; z += 200) {
        summit = Math.max(summit, geology.surfaceAt(x, z));
      }
    }
    expect(summit).toBeGreaterThan(0.9 * altitudeOf(at(1)));
    expect(summit).toBeLessThan(1.15 * altitudeOf(at(1)));
    expect(altitudeOf(at(0.5))).toBeGreaterThan(altitudeOf(at(0.35)));
    // ...and the DEFAULT is exactly the country the alpine's row describes,
    // multiplier 1 and nothing touched, which is what makes every seed the
    // game ever built the seed it still builds.
    expect(altitudeMul(DEFAULT_KNOBS.altitude)).toBe(1);
    expect(landOf(at(DEFAULT_KNOBS.altitude))).toEqual(BIOMES.alpine.land);
    expect(altitudeOf(at(DEFAULT_KNOBS.altitude))).toBeCloseTo(
      (BIOMES.alpine.land.massif?.height ?? 0) * STAGE_RULES.massif.altitude.summit,
      6,
    );
  });

  it("is a dial only a mountain country reads", () => {
    for (const biome of ["taiga", "desert"] as const) {
      expect(altitudeOf(resolveKnobs({ biome, altitude: 1 }))).toBe(0);
      expect(landOf(resolveKnobs({ biome, altitude: 1 }))).toEqual(BIOMES[biome].land);
      const high = compileStage(2, "short", { biome, altitude: 1 }, "sprint");
      expect(digest(high)).toBe(digest(compileStage(2, "short", { biome }, "sprint")));
    }
  });

  /** How steep this country's ground actually STANDS, m per m: the 99th
   * percentile of the local grade over the stage's own box, read across a
   * ground-lattice cell so it is the slope the world is drawn at. A
   * percentile rather than a maximum, because the maximum on a mountain is
   * one cliff and says nothing about the country around it. */
  const steepness = (knobs: ReturnType<typeof resolveKnobs>): number => {
    const geology = createGeology(1, knobs);
    const grades: number[] = [];
    for (let x = -1500; x <= 1500; x += 50) {
      for (let z = -1500; z <= 1500; z += 50) {
        const dx =
          (geology.surfaceAt(x + GROUND_CELL, z) - geology.surfaceAt(x - GROUND_CELL, z)) /
          (2 * GROUND_CELL);
        const dz =
          (geology.surfaceAt(x, z + GROUND_CELL) - geology.surfaceAt(x, z - GROUND_CELL)) /
          (2 * GROUND_CELL);
        grades.push(Math.hypot(dx, dz));
      }
    }
    grades.sort((a, b) => a - b);
    return grades[Math.round(grades.length * 0.99)];
  };

  it("stands the country up as it raises it, and never lifts the valley floor off the lake table", () => {
    let steeper = 0;
    for (const dial of [0.2, 0.35, 0.5, 0.7, 0.85, 1]) {
      const knobs = at(dial);
      // Higher is STEEPER, at every step of the travel — the whole promise
      // of the dial, and the one an exponent in `massif.altitude` can undo
      // without any other check noticing.
      const grade = steepness(knobs);
      expect(grade).toBeGreaterThan(steeper);
      steeper = grade;
      // ...and the floor stays where it always was: the mountain COMES
      // DOWN to the country the lakes and the villages are in, whatever it
      // does above.
      expect(landOf(knobs).floor).toBe(BIOMES.alpine.land.floor);
    }
    // A six-thousand-metre country stands ground the tuned one never does.
    expect(steepness(at(1))).toBeGreaterThan(5 * steepness(at(DEFAULT_KNOBS.altitude)));
  });

  it("climbs its bands more slowly than its crest, onto the real range's own lines", () => {
    const tuned = BIOMES.alpine.land.zones;
    const top = landOf(at(1)).zones;
    // Slower than the height, so a taller mountain has more of itself above
    // the treeline rather than being a taller picture of a smaller one.
    expect(top.treeline / tuned.treeline).toBeLessThan(altitudeMul(1));
    expect(top.treeline).toBeGreaterThan(tuned.treeline);
    // ...and where that lands at the top of the dial is not arbitrary: it
    // is where a real range carries them.
    expect(top.treeline).toBeGreaterThan(1400);
    expect(top.treeline).toBeLessThan(1900);
    expect(top.snow as number).toBeGreaterThan(2600);
    expect(top.snow as number).toBeLessThan(3200);
    expect(top.rock.to).toBeLessThan(top.snow as number);
    // The air's lapse rate comes down with them, so a cold dial means the
    // same thing at every position of this one (climate.ts).
    expect(lapseOf(at(1), CLIMATE.lapse)).toBeLessThan(CLIMATE.lapse);
    expect(lapseOf(at(DEFAULT_KNOBS.altitude), CLIMATE.lapse)).toBe(CLIMATE.lapse);
  });

  it("starts the stage on top of the mountain, with the mountain under it", () => {
    // R35 sites the start on the highest shoulder it can hold a grid on,
    // and at the top of this dial that shoulder is the LEDGE across the
    // summit — not the valley floor, which is the flattest ground in the
    // country and which an earlier shape put every stage on. What the
    // claim is really about is the DROP: how much mountain there is under
    // the start line to come down.
    const knobs = at(1);
    for (const seed of [3, 4, 6]) {
      const geology = createGeology(seed, knobs);
      const origin = compileStage(seed, "medium", knobs, "sprint").samples[0];
      let low = Infinity;
      let high = -Infinity;
      for (let x = -1500; x <= 1500; x += 100) {
        for (let z = -1500; z <= 1500; z += 100) {
          const y = geology.surfaceAt(origin.x + x, origin.z + z);
          low = Math.min(low, y);
          high = Math.max(high, y);
        }
      }
      // The start stands in the top tenth of the country around it...
      expect(origin.elevation).toBeGreaterThan(low + 0.9 * (high - low));
      // ...and the valley under it runs all the way back to the lake table.
      expect(low).toBeLessThan(LAKE_Y + 40);
      expect(origin.elevation - low).toBeGreaterThan(3000);
    }
  });

  it("keeps the road ON the land at every position of the dial", () => {
    // THE CHECK THIS DIAL EXISTS UNDER, and the one no other instrument
    // can stand in for. A road descends at `follow.grade` and no faster,
    // so a mountain the search cannot lay a line across is one where the
    // compiler builds the road in the AIR over it — a hundred metres up on
    // an embankment with nothing under it. Every surface check passes: the
    // ribbon on top of it is perfectly smooth. It is the single measurement
    // that decides whether a position on this dial is a stage or a ruin.
    //
    // MEASURED, seeds 1-4 at medium on these dials: the share of a stage's
    // samples standing more than 40 m off the bare land runs 0.5% at the
    // bottom of the travel, 3.3% at its default, 16.2% at its weakest point
    // just above the middle (worst sample 158 m), and 5.6% at the top
    // (184 m). The weak band is real and it is the middle: a mountain big
    // enough that the road cannot follow it down and not yet big enough to
    // have bent itself into an apron. The ruin these budgets hold the line
    // against is a different order of thing — 31% and 893 m, which is what
    // this same country comes out at with the flank left un-bent
    // (`massif.altitude.sharpen`) or the start let up onto it (`siting`).
    // Two seeds here rather than four, for the file's own minute; they run
    // 0.0%, 19.0% and 1.8% at the three positions below.
    const share = (altitude: number): number => {
      let over = 0;
      let n = 0;
      for (const seed of [1, 2]) {
        const track = compileStage(seed, "medium", { ...KNOBS, altitude }, "sprint");
        const terrain = createTerrain(track);
        for (const sample of track.samples) {
          if (sample.tunnel) continue;
          n++;
          if (Math.abs(sample.elevation - terrain.farHeightAt(sample.x, sample.z)) > 40) over++;
        }
      }
      return over / n;
    };
    // The two ends of the travel are held to the tuned country's own order
    // of magnitude...
    expect(share(DEFAULT_KNOBS.altitude)).toBeLessThan(0.08);
    expect(share(1)).toBeLessThan(0.1);
    // ...and everything between them to the ceiling under which a stage is
    // still a road on a mountain rather than a causeway over one.
    expect(share(0.7)).toBeLessThan(0.25);
  });

  it("throws a car off the side of it, and the air barely holds on", () => {
    // WHAT THE LEVEL IS FOR. A mountain is only worth six thousand metres
    // if leaving the road at speed is a FLIGHT — so this drives one off
    // the flank at rally pace and asks the physics, not the geometry, how
    // far and how far down.
    //
    // MEASURED: from the steepest ground within two kilometres of the
    // road, at 200 km/h, the car falls 845-2,346 m before it stops, with
    // single flights of 3.2 to 13.9 seconds. Off the ledge's own rim it is
    // gentler and still a jump — around 250 m out and 105 m down over five
    // seconds, and the car is still doing 164 km/h at the end of it, which
    // is the "not much friction in the air" this is really checking.
    const knobs = at(1);
    let deepest = 0;
    let longest = 0;
    for (const seed of [2, 3, 5]) {
      const track = compileStage(seed, "medium", knobs, "sprint");
      const state = createGame({ seed, carId: "classic", skipCountdown: true, track });
      const sample = track.samples[60];
      const rx = Math.cos(sample.heading);
      const rz = -Math.sin(sample.heading);
      const ground = state.terrain.groundAt;
      // The steepest ground within reach of the road, and which way it falls.
      let pitch = { x: sample.x, z: sample.z, y: sample.elevation, side: 1, grade: 0 };
      for (const side of [1, -1]) {
        for (let out = 100; out <= 2000; out += 20) {
          const x = sample.x + rx * out * side;
          const z = sample.z + rz * out * side;
          const grade = (ground(x, z) - ground(x + rx * 40 * side, z + rz * 40 * side)) / 40;
          if (grade > pitch.grade) pitch = { x, z, y: ground(x, z), side, grade };
        }
      }
      state.car.x = pitch.x;
      state.car.z = pitch.z;
      state.car.y = pitch.y;
      state.car.heading = Math.atan2(-rz * pitch.side, rx * pitch.side);
      state.car.u = 200 / 3.6;
      let floor = pitch.y;
      let flight = 0;
      for (let n = 0; n < Math.round(60 / TUNING.dt); n++) {
        step(state, { ...NEUTRAL_INPUT });
        // A respawn puts the car back up on the road; the fall is over.
        if (state.car.y > floor + 200) break;
        floor = Math.min(floor, state.car.y);
        flight = Math.max(flight, state.car.airTime);
      }
      deepest = Math.max(deepest, pitch.y - floor);
      longest = Math.max(longest, flight);
    }
    // Kilometres of fall, and seconds of it with nothing under the wheels.
    expect(deepest).toBeGreaterThan(800);
    expect(longest).toBeGreaterThan(3);
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
