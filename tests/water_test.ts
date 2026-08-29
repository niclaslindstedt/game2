// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The WATER, and the rules of nature it obeys (R18) — plus the crossings
// the road makes over it (R13). The point of these is that water in a
// generated world is the thing players read as "real" or "fake" fastest: a
// river that runs uphill, or three parallel rivers where a valley would
// hold one, gives the whole landscape away.
import { describe, expect, it } from "vitest";

import {
  LAKE_Y,
  NEUTRAL_INPUT,
  PARAPET_BAY,
  PARAPET_GAP,
  PARAPET_OUT,
  SOLID_PROP_HEIGHT,
  STAGE_RULES as R,
  TUNING,
  collectAnchors,
  compileStage,
  createLandField,
  createGame,
  createTerrain,
  resolveKnobs,
  step,
  traceRivers,
  type GameEvent,
  type GameState,
} from "@engine";

const SEEDS = [1, 2, 3, 5, 8, 13, 21, 34];

describe("crossings (R13)", () => {
  it("wades the narrow ones and decks the wide ones", () => {
    for (const seed of SEEDS) {
      const track = compileStage(seed, "long", { water: 0.8 });
      for (const s of track.samples) {
        if (s.deck !== null) {
          // A deck is ROAD, not water: the wheels stay dry and the surface
          // keeps its grip.
          expect(s.surface).not.toBe("water");
        }
      }
      // A deck holds the road LEVEL across the gap — that is what makes it
      // a bridge instead of a dip with a river in it.
      let i = 0;
      while (i < track.samples.length) {
        if (track.samples[i].deck === null) {
          i++;
          continue;
        }
        let j = i;
        while (j < track.samples.length && track.samples[j].deck !== null) j++;
        const heights = track.samples.slice(i, j).map((s) => s.elevation);
        expect(Math.max(...heights) - Math.min(...heights)).toBeLessThan(0.01);
        i = j;
      }
    }
  });

  it("runs the water far enough under a deck to drown a car that goes over the side", () => {
    for (const seed of SEEDS) {
      const track = compileStage(seed, "long", { water: 0.9 });
      const anchors = collectAnchors(track, 0);
      for (const anchor of anchors.filter((a) => a.bridged)) {
        const deck = track.samples.find((s) => Math.abs(s.s - anchor.s) < 2);
        expect(deck).toBeDefined();
        const clearance = (deck?.elevation ?? 0) - anchor.waterY;
        expect(clearance).toBeGreaterThanOrEqual(R.bridge.clearance.timber - 0.01);
        expect(anchor.depth).toBeGreaterThan(0.9); // TUNING.crash.deepWater
      }
    }
  });

  it("R13 — walls a concrete deck with a parapet, unbroken and SOLID", () => {
    for (const seed of SEEDS) {
      const track = compileStage(seed, "long", { water: 0.8 });
      const terrain = createTerrain(track);
      const lat = track.width / 2 + PARAPET_OUT;
      for (const s of track.samples) {
        if (s.deck !== "concrete") continue;
        const right = { x: Math.cos(s.heading), z: -Math.sin(s.heading) };
        for (const side of [-1, 1]) {
          const x = s.x + right.x * lat * side;
          const z = s.z + right.z * lat * side;
          // A bay stands within one bay's length of every point down both
          // edges — no gap a nose could find, because behind this one is
          // the river.
          const bays = terrain.parapetsNear(x, z, PARAPET_BAY / 2);
          expect(bays.length).toBeGreaterThan(0);
          // And it is a wall, not scenery: bedded into the deck it is cast
          // onto, nothing a car carries breaks it, and it stands well over
          // the bar that separates a solid from litter.
          expect(bays[0].rooted).toBe(1);
          expect(bays[0].snap).toBe(Infinity);
          expect(bays[0].height).toBeGreaterThan(SOLID_PROP_HEIGHT);
        }
      }
      // ...and nothing stands along a road that is not a deck.
      const open = track.samples.find((s) => s.deck === null);
      if (open) expect(terrain.parapetsNear(open.x, open.z, 10)).toHaveLength(0);
    }
  });

  it("R13 — a car sliding wide on a bridge stops AT the wall, not through it", () => {
    // The one wall on a stage that is there on purpose. Everywhere else R31
    // cuts the ground back to something the car can climb; here it must not
    // be climbable, because over the side is a drowning. And it is checked
    // on the deck rather than off the road: by the time a car this far
    // sideways counts as off-road it would already be in the river.
    const track = compileStage(5, "medium", { water: 0.9 });
    const deck = track.samples.findIndex((s) => s.deck === "concrete");
    expect(deck).toBeGreaterThan(0);
    const s = track.samples[deck + 6];
    const right = { x: Math.cos(s.heading), z: -Math.sin(s.heading) };
    const state = createGame({ seed: 5, skipCountdown: true, track });
    // Halfway to the edge, thrown at the parapet at 25 m/s of pure slide.
    state.car.x = s.x + right.x * 5;
    state.car.z = s.z + right.z * 5;
    state.car.y = s.elevation;
    state.car.heading = s.heading;
    state.car.u = 2;
    state.car.w = 25;
    const events: GameEvent[] = [];
    let flank = -Infinity;
    for (let i = 0; i < 120; i++) {
      events.push(...step(state, NEUTRAL_INPUT));
      const out = (state.car.x - s.x) * right.x + (state.car.z - s.z) * right.z;
      flank = Math.max(flank, out + TUNING.collision.halfWidth);
    }
    // Never past the concrete's own inner face...
    expect(flank).toBeLessThanOrEqual(track.width / 2 + PARAPET_GAP + 0.02);
    // ...and it cost something: this is a wall, not a kerb.
    expect(state.stats.impacts).toBeGreaterThan(0);
    expect(state.car.damage.wear).toBeGreaterThan(0);
    expect(events.some((e) => e.type === "impact")).toBe(true);
    // Still on the bridge rather than in the water under it.
    expect(state.stats.crashes).toBe(0);
  });
});

describe("the river (R18)", () => {
  it("never runs uphill", () => {
    for (const seed of SEEDS) {
      const track = compileStage(seed, "long", { water: 0.8 });
      const terrain = createTerrain(track);
      const rivers = traceRivers(track.seed, collectAnchors(track, 0), terrain.heightAt, LAKE_Y);
      for (const river of rivers) {
        for (let i = 1; i < river.points.length; i++) {
          expect(river.points[i].y).toBeLessThanOrEqual(river.points[i - 1].y + 1e-9);
        }
      }
    }
  });

  it("gathers as it goes: a river is wider at its mouth than at its spring", () => {
    for (const seed of SEEDS) {
      const track = compileStage(seed, "long", { water: 0.8 });
      const terrain = createTerrain(track);
      for (const river of traceRivers(
        track.seed,
        collectAnchors(track, 0),
        terrain.heightAt,
        LAKE_Y,
      )) {
        const spring = river.points[0];
        const mouth = river.points[river.points.length - 1];
        expect(mouth.halfWidth).toBeGreaterThan(spring.halfWidth);
      }
    }
  });

  it("crosses the road at the level the road was built for", () => {
    for (const seed of SEEDS) {
      const track = compileStage(seed, "medium", { water: 0.8 });
      const terrain = createTerrain(track);
      for (const anchor of collectAnchors(track, 0)) {
        const water = terrain.waterAt(anchor.x, anchor.z);
        expect(water).not.toBeNull();
        // ...unless the crossing stands in country already under the water
        // table, where the lake IS the water the road crosses.
        const level = water ?? 0;
        expect(Math.abs(level - anchor.waterY) < 1.2 || level === LAKE_Y).toBe(true);
      }
    }
  });

  it("meets each crossing ONCE: the road's water is one course, not a fan of them", () => {
    // Every crossing belongs to exactly one traced watercourse, and a
    // stage's crossings collapse into far fewer courses than crossings —
    // which is the difference between a river a road meets three times and
    // three rivers that happen to be parallel.
    let crossings = 0;
    let courses = 0;
    for (const seed of SEEDS) {
      const track = compileStage(seed, "long", { water: 0.9 });
      const terrain = createTerrain(track);
      const anchors = collectAnchors(track, 0);
      const rivers = traceRivers(track.seed, anchors, terrain.heightAt, LAKE_Y);
      const claimed = rivers.flatMap((r) => r.anchors);
      expect(claimed.length).toBe(anchors.length);
      crossings += anchors.length;
      courses += rivers.length;
    }
    expect(crossings).toBeGreaterThan(courses);
  });

  it("crosses a road where the road crosses it, and nowhere else", () => {
    // A watercourse routed under the corridor between two crossings carves
    // the ground out from under the ribbon and draws a sheet of water
    // through it — the road standing on a bank of nothing, which is what
    // "the water is below the road" looks like from the driver's seat.
    let flooded = 0;
    let dry = 0;
    for (const seed of SEEDS) {
      const track = compileStage(seed, "long", { water: 0.9 });
      const terrain = createTerrain(track);
      const anchors = collectAnchors(track, 0);
      for (const s of track.samples) {
        // The crossings themselves are water at the road ON PURPOSE, and
        // so is the last of the road that eases down into a ford.
        if (s.surface === "water" || s.deck !== null) continue;
        const toCrossing = Math.min(
          ...anchors.map((a) => Math.hypot(a.x - s.x, a.z - s.z)),
          Infinity,
        );
        if (toCrossing < 60) continue;
        if (terrain.waterAt(s.x, s.z) !== null) flooded += 1;
        else dry += 1;
      }
    }
    expect(dry).toBeGreaterThan(1000);
    expect(flooded).toBe(0);
  });

  it("keeps the water under the ground the car rides, never over it", () => {
    // The physics and the renderer both ask the field what is water. A
    // channel too narrow for the ground lattice to hold runs UNDER a
    // hillside the tiles never dip into: answering "water" up there drowns
    // a car driving over a mountain, and draws a slab of water on it.
    for (const seed of SEEDS) {
      const track = compileStage(seed, "long", { water: 0.9 });
      const terrain = createTerrain(track);
      const b = track.bounds;
      for (let i = 0; i < 40; i++) {
        for (let j = 0; j < 40; j++) {
          const x = b.minX + ((b.maxX - b.minX) * i) / 39;
          const z = b.minZ + ((b.maxZ - b.minZ) * j) / 39;
          const water = terrain.waterAt(x, z);
          if (water === null) continue;
          // Out in the country, where the ground the car rides IS the
          // ground: over a road the surface under the wheels is the
          // ribbon, and a bridge deck stands metres over the river it
          // spans on purpose (R13).
          if (terrain.roadDistanceAt(x, z) < track.width / 2 + 12) continue;
          expect(terrain.groundAt(x, z)).toBeLessThan(water + 0.25);
        }
      }
    }
  });

  it("answers the water dial, from dry country to lakeland", () => {
    // Measured on the BARE LANDSCAPE over a fixed box, which is what the
    // claim is about. Sampling `terrain.heightAt` inside `track.bounds`
    // instead asks a different question: the bounds move with the dial —
    // a wetter seed generates a differently shaped stage — so the window
    // slides over different country at every dial position and the trend
    // it reports is partly the stage moving rather than the water rising.
    const wetness = (water: number): number => {
      let wet = 0;
      let n = 0;
      for (const seed of [1, 3, 5]) {
        const land = createLandField(seed, resolveKnobs({ water }));
        for (let i = 0; i < 40; i++) {
          for (let j = 0; j < 40; j++) {
            const x = -1500 + (3000 * i) / 39;
            const z = -1500 + (3000 * j) / 39;
            n += 1;
            if (land.heightAt(x, z) < LAKE_Y) wet += 1;
          }
        }
      }
      return wet / n;
    };
    const dry = wetness(0);
    const middling = wetness(0.5);
    const lakeland = wetness(1);
    expect(dry).toBeLessThan(middling);
    expect(middling).toBeLessThan(lakeland);
  });
});

/** Off the road under full throttle and hard lock, until the car is in
 * water deep enough to be drowning in it. Returns the step that put it
 * there. The lakeland dial is turned up so there IS water to find, and the
 * lock decides WHICH side of the road it is found on — the two answer with
 * different shorelines, and both beats the water has are wanted. */
function plunge(seed: number, steer: number): { state: GameState; entry: GameEvent[] } | null {
  const state = createGame({ seed, length: "long", skipCountdown: true, knobs: { water: 1 } });
  const input = { ...NEUTRAL_INPUT, throttle: 1, steer };
  for (let i = 0; i < 120 * 60; i++) {
    const entry = step(state, input);
    if (state.drowning) return { state, entry };
  }
  return null;
}

describe("going under (TUNING.crash.drown)", () => {
  /** Seeds to look for a lake in, in order — these lead with ones whose
   * water is known to be deep enough to submerge a car, so the search below
   * usually stops at the first. It is an ORDER and not a guarantee:
   * `crash.deepWater` is a low bar a car meets in a puddle at a lakeshore,
   * and which shelf it ends up on is decided by the handling that carried
   * it there. `swallows` is what actually holds the scenario still. */
  const DROWNING_SEEDS = [34, 26, ...SEEDS];

  /** ...and does that water actually close over the roof? The car sinks to
   * the BED (step.ts), so a shelf shallower than the roof leaves it settled
   * with its cabin in the air — a real outcome, and not the one these tests
   * are about. WHICH shelf it ends up on is decided by the handling that
   * carried it in there, so a scenario that does not check this silently
   * becomes a different scenario every time the car's cornering changes,
   * and "it went under, roof and all" starts failing on a car sitting in a
   * puddle. Run on a throwaway state; the drive is deterministic, so the
   * real one replays it exactly. */
  function swallows(seed: number): boolean {
    const attempt = plunge(seed, 1);
    if (!attempt) return false;
    const { state } = attempt;
    for (let i = 0; i < Math.round(TUNING.crash.drown.duration / TUNING.dt); i++) {
      if (state.drowning?.under) return true;
      step(state, NEUTRAL_INPUT);
    }
    return false;
  }

  /** Found once and reused — the answer cannot change within a run. */
  let deepSeed: number | undefined;

  function driveIntoDeepWater(): { state: GameState; entry: GameEvent[] } {
    deepSeed ??= DROWNING_SEEDS.find(swallows);
    if (deepSeed === undefined) throw new Error("no seed put deep enough water beside the road");
    const attempt = plunge(deepSeed, 1);
    if (!attempt) throw new Error(`seed ${deepSeed} no longer drowns the car`);
    return attempt;
  }

  it("holds the car in the water instead of teleporting it off the lake", () => {
    const { state, entry } = driveIntoDeepWater();
    const types = entry.map((e) => e.type);
    // The entry is a crash and a deep splash — and NOT a respawn, which is
    // the whole change: the run is lost, the car is still in the lake.
    expect(types).toContain("crash");
    expect(types).not.toContain("respawn");
    // A car that wades in off a shore books the shallows' splash and the
    // deep one on the SAME step, so the deep one is the one to look for
    // rather than the first one in the list.
    const splashes = entry.filter((e) => e.type === "splash");
    expect(splashes.some((e) => e.deep)).toBe(true);
    expect(state.drowning).not.toBeNull();
  });

  it("floats it at the waterline, then sinks it, and only then brings it home", () => {
    const { state } = driveIntoDeepWater();
    const D = TUNING.crash.drown;
    const waterY = state.drowning?.waterY ?? 0;
    const since = state.drowning?.since ?? 0;

    let sank = 0;
    let respawned = 0;
    let floatDepth = -Infinity;
    let deepest = Infinity;
    for (let i = 0; i < Math.round((D.duration + 0.5) / TUNING.dt); i++) {
      const age = state.t - since;
      // Through the float the hull rides its waterline: within half a metre
      // of the surface, bobbing, never gone.
      if (state.drowning && age > 0.9 && age < D.float) {
        floatDepth = Math.max(floatDepth, waterY - state.car.y);
      }
      if (state.drowning) deepest = Math.min(deepest, state.car.y);
      for (const ev of step(state, { ...NEUTRAL_INPUT, throttle: 1, steer: -1 })) {
        if (ev.type === "sink") sank += 1;
        if (ev.type === "respawn") respawned += 1;
      }
    }
    // Under the surface, but only just: sills awash, not gone. The lower
    // bound also keeps the assertion from passing on a window the loop
    // never actually visited.
    expect(floatDepth).toBeGreaterThan(0);
    expect(floatDepth).toBeLessThan(D.draft + 0.5);
    // It went under once, roof and all...
    expect(sank).toBe(1);
    expect(deepest).toBeLessThan(waterY - D.roof);
    // ...and the crew arrived exactly once, at the far end.
    expect(respawned).toBe(1);
    expect(state.drowning).toBeNull();
  });

  it("ignores the driver for the whole penalty — the seconds are the point", () => {
    const { state } = driveIntoDeepWater();
    const D = TUNING.crash.drown;
    const raceAtEntry = state.raceTime;
    // Everything the panicking driver can reach, including the reset that
    // normally drags a wandering car home on the spot.
    const mashing = {
      ...NEUTRAL_INPUT,
      throttle: 1,
      brake: 1,
      handbrake: true,
      reset: true,
    };
    // Run the penalty out by STEPS rather than by comparing the clock to
    // it. Both the engine's own `age` and `state.t - since` out here are
    // differences of two accumulated floats, and after a stage's worth of
    // simulated seconds the last step of the penalty lands either side of
    // the bar depending on how far the car drove before it went in.
    let home = 0;
    let steps = 0;
    const bail = Math.round((D.duration + 1) / TUNING.dt);
    while (state.drowning && steps++ < bail) {
      for (const ev of step(state, mashing)) if (ev.type === "respawn" && state.drowning) home += 1;
    }
    // Not once in the whole penalty did the reset bring the car home: the
    // only respawn is the crew's, on the step the water finally let go.
    expect(home).toBe(0);
    expect(state.drowning).toBeNull();
    expect(steps).toBeLessThan(bail);
    // ...and the clock never stopped while it was ignoring them: the whole
    // penalty is charged to the run, which is what makes it one.
    expect(state.raceTime - raceAtEntry).toBeCloseTo(D.duration, 1);
  });
});

describe("driving out again (TUNING.crash.drown.shallows)", () => {
  /** Not every splash is a drowning. A car that clips a shore at pace
   * carries that entry back out of the water, and the failure these hold
   * off is the water keeping it anyway: the body held down at a waterline
   * the car has already driven past, which finishes the beat buried in the
   * beach it is standing on. */
  const SHORE_SEEDS = [3, ...SEEDS];

  /** Take a seed's plunge and run the drowning out. Reports the seed whose
   * shoreline the car drives back out of — which one that is depends on the
   * handling that carried it in, exactly as `swallows` does above, so this
   * searches rather than naming one. */
  function scrambles(seed: number): boolean {
    const attempt = plunge(seed, -1);
    if (!attempt) return false;
    const { state } = attempt;
    // The lock that found the water has already been driving off-road for
    // up to a minute, and the wedge rule may well have fetched the car
    // once on the way: what marks a car driving ITSELF out is a drowning
    // that ends without the crew, not a run with no respawns in it.
    const fetched = state.stats.respawns;
    for (let i = 0; i < Math.round(TUNING.crash.drown.duration / TUNING.dt); i++) {
      step(state, NEUTRAL_INPUT);
      if (!state.drowning) return state.stats.respawns === fetched;
    }
    return false;
  }

  let shoreSeed: number | undefined;

  function driveIntoTheShallows(): GameState {
    shoreSeed ??= SHORE_SEEDS.find(scrambles);
    if (shoreSeed === undefined)
      throw new Error("no seed put a shore the car could drive back out of");
    const attempt = plunge(shoreSeed, -1);
    if (!attempt) throw new Error(`seed ${shoreSeed} no longer puts the car in the water`);
    return attempt.state;
  }

  it("gives the car back to the driver instead of the crew", () => {
    const state = driveIntoTheShallows();
    const D = TUNING.crash.drown;
    const respawnsAtEntry = state.stats.respawns;
    const progressAtEntry = state.progressS;

    let out = 0;
    let sank = 0;
    let steps = 0;
    const bail = Math.round(D.float / TUNING.dt);
    while (state.drowning && steps++ < bail) {
      for (const ev of step(state, { ...NEUTRAL_INPUT, throttle: 1 })) {
        if (ev.type === "respawn") out += 1;
        if (ev.type === "sink") sank += 1;
      }
    }
    // It got out while it was still afloat, on its own momentum: no crew,
    // no gulp, and the run is standing exactly where it left it rather than
    // back at the last split board.
    expect(state.drowning).toBeNull();
    expect(steps).toBeLessThan(bail);
    expect(out).toBe(0);
    expect(sank).toBe(0);
    expect(state.stats.respawns).toBe(respawnsAtEntry);
    expect(state.progressS).toBe(progressAtEntry);
  });

  it("stands it on the ground it beached on, not under it", () => {
    const state = driveIntoTheShallows();
    while (state.drowning) step(state, { ...NEUTRAL_INPUT, throttle: 1 });

    // The one that reads as a broken game: a car that drove out and then
    // spends the rest of the beat sinking through the bank it is standing
    // on. Give it a second of driving and it must be ON the ground the
    // whole way — the seat can stand it above a dip under its middle, never
    // below it.
    let buried = -Infinity;
    for (let i = 0; i < Math.round(1 / TUNING.dt); i++) {
      step(state, { ...NEUTRAL_INPUT, throttle: 1 });
      buried = Math.max(buried, state.terrain.groundAt(state.car.x, state.car.z) - state.car.y);
    }
    expect(buried).toBeLessThan(0.05);
    // ...and it is DRIVING: the throttle reaches it again, which is the one
    // thing the drowning takes away.
    expect(state.car.u).toBeGreaterThan(1);
    expect(state.drowning).toBeNull();
  });

  it("asks for shallower water than the depth that took the car", () => {
    // The bar to get out sits UNDER the bar that put the car in, and it has
    // to: on the same bar a hull bobbing at the deep-water line would beach
    // and drown again on alternate steps.
    expect(TUNING.crash.drown.shallows).toBeGreaterThan(0);
    expect(TUNING.crash.drown.shallows).toBeLessThan(TUNING.crash.deepWater);
  });
});
