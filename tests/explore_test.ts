// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The open world: the terrain the car rides once it leaves the road, the
// speeds the surfaces allow, the crashes that end an excursion (deep water,
// the wild's solid props), and the reset that is the only other way home —
// exploring never times out on its own. Terrain scenarios that need an
// exact landscape override the state's terrain field with a synthetic one;
// the determinism and clearance checks run against the real field.

import { describe, expect, it } from "vitest";

import {
  LAKE_Y,
  NEUTRAL_INPUT,
  TUNING,
  compileTrack,
  createGame,
  createTerrain,
  step,
  type CarInput,
  type GameEvent,
  type GameState,
  type SegmentPlan,
} from "@engine";

const LONG_STRAIGHT: SegmentPlan[] = [{ kind: "straight", length: 9000, feature: "none" }];

const drive = (overrides: Partial<CarInput> = {}): CarInput => ({
  ...NEUTRAL_INPUT,
  throttle: 1,
  ...overrides,
});

/** Step with the auto-shift the manual box needs to reach its top end. */
function stepShifting(state: GameState, input: CarInput): GameEvent[] {
  const shiftUp =
    state.spec.gearbox === "manual" &&
    state.car.gear < state.spec.gearTop.length - 1 &&
    state.car.u > state.spec.gearTop[state.car.gear] * TUNING.gearbox.upAt;
  return step(state, { ...input, shiftUp });
}

/** A run on a flat, dry, empty landscape — terrain scenarios override the
 * field so the scenario is exactly what the test says it is. */
function flatWild(state: GameState, heightAt: (x: number, z: number) => number): void {
  state.terrain = {
    ...state.terrain,
    heightAt,
    waterAt: () => null,
    obstaclesNear: () => [],
  };
}

describe("top speed", () => {
  it("the classic holds about 230 km/h flat out on gravel", () => {
    const state = createGame({
      seed: 3,
      carId: "classic",
      skipCountdown: true,
      track: compileTrack(3, LONG_STRAIGHT),
    });
    for (let i = 0; i < 120 * 120; i++) stepShifting(state, drive());
    expect(state.stats.topSpeed * 3.6).toBeGreaterThan(224);
    expect(state.stats.topSpeed * 3.6).toBeLessThan(238);
  });

  it("the compact's auto box reaches its top gear and ~215 km/h", () => {
    const state = createGame({
      seed: 3,
      carId: "compact",
      skipCountdown: true,
      track: compileTrack(3, LONG_STRAIGHT),
    });
    for (let i = 0; i < 120 * 120; i++) step(state, drive());
    expect(state.car.gear).toBe(state.spec.gearTop.length - 1);
    expect(state.stats.topSpeed * 3.6).toBeGreaterThan(205);
  });

  it("open nature allows about 150 km/h — fast, but not road pace", () => {
    const state = createGame({
      seed: 3,
      carId: "classic",
      skipCountdown: true,
      track: compileTrack(3, LONG_STRAIGHT),
    });
    flatWild(state, () => -0.35);
    state.car.x = 200;
    state.car.y = -0.35;
    let top = 0;
    for (let i = 0; i < 120 * 90; i++) {
      stepShifting(state, drive());
      if (state.offRoad) top = Math.max(top, state.car.u);
    }
    expect(state.offRoad).toBe(true);
    expect(top * 3.6).toBeGreaterThan(135);
    expect(top * 3.6).toBeLessThan(165);
  });
});

describe("exploring", () => {
  it("never respawns a car for merely being far off the road", () => {
    const state = createGame({
      seed: 3,
      skipCountdown: true,
      track: compileTrack(3, LONG_STRAIGHT),
    });
    flatWild(state, () => -0.35);
    state.car.x = 60; // far beyond the old 16 m lost-car offset
    state.car.y = -0.35;
    const events: GameEvent[] = [];
    for (let i = 0; i < 120 * 6; i++) events.push(...step(state, drive()));
    expect(state.offRoad).toBe(true);
    expect(events.filter((e) => e.type === "respawn")).toHaveLength(0);
    expect(state.stats.offRoadTime).toBeGreaterThan(5);
  });

  it("the reset input is the way home: back on the track at last progress", () => {
    const state = createGame({
      seed: 3,
      skipCountdown: true,
      track: compileTrack(3, LONG_STRAIGHT),
    });
    flatWild(state, () => -0.35);
    state.car.x = 80;
    state.car.y = -0.35;
    for (let i = 0; i < 120; i++) step(state, drive());
    const events = step(state, drive({ reset: true }));
    expect(events.some((e) => e.type === "respawn")).toBe(true);
    expect(Math.abs(state.car.x)).toBeLessThan(1);
    expect(state.offRoad).toBe(false);
    expect(state.stats.crashes).toBe(0);
  });

  it("a sharp cliff edge at pace throws the car with no road lip anywhere", () => {
    const state = createGame({
      seed: 3,
      skipCountdown: true,
      track: compileTrack(3, LONG_STRAIGHT),
    });
    // A plateau beside the road that ends in a 10 m drop across z = 400.
    flatWild(state, (_x, z) => (z < 400 ? -0.35 : -10.35));
    state.car.x = 100;
    state.car.z = 300;
    state.car.y = -0.35;
    state.car.u = 40;
    const events: GameEvent[] = [];
    for (let i = 0; i < 120 * 8; i++) events.push(...step(state, drive()));
    const takeoff = events.find((e) => e.type === "takeoff");
    const landing = events.find((e) => e.type === "landing");
    expect(takeoff).toBeDefined();
    expect(landing).toBeDefined();
    expect(state.stats.airTime).toBeGreaterThan(0.3);
  });
});

describe("crashes", () => {
  it("driving into deep water crashes and puts the car back on the track", () => {
    const state = createGame({
      seed: 3,
      skipCountdown: true,
      track: compileTrack(3, LONG_STRAIGHT),
    });
    // Dry shelf out to x = 40, then the seabed far under the water table.
    state.terrain = {
      ...state.terrain,
      heightAt: (x) => (Math.abs(x) < 40 ? -0.35 : LAKE_Y - 6),
      waterAt: (x) => (Math.abs(x) < 40 ? null : LAKE_Y),
      obstaclesNear: () => [],
    };
    state.car.heading = Math.PI / 2; // straight off the road, toward the water
    state.car.u = 30;
    const events: GameEvent[] = [];
    for (let i = 0; i < 120 * 8; i++) events.push(...step(state, drive()));
    const crash = events.find((e) => e.type === "crash");
    expect(crash).toMatchObject({ type: "crash", into: "water" });
    expect(events.some((e) => e.type === "splash")).toBe(true);
    expect(events.some((e) => e.type === "respawn")).toBe(true);
    expect(state.stats.crashes).toBeGreaterThan(0);
    expect(Math.abs(state.car.x)).toBeLessThan(1);
  });

  it("a boulder at speed is a crash; at a crawl it just stops the car", () => {
    const boulder = {
      x: 30,
      z: 250,
      y: -0.35,
      kind: "boulder" as const,
      size: 1,
      spin: 0,
      radius: 2,
      height: 2,
    };
    const run = (speed: number): { events: GameEvent[]; state: GameState } => {
      const state = createGame({
        seed: 3,
        skipCountdown: true,
        track: compileTrack(3, LONG_STRAIGHT),
      });
      state.terrain = {
        ...state.terrain,
        heightAt: () => -0.35,
        waterAt: () => null,
        obstaclesNear: (x, z, r) =>
          Math.hypot(boulder.x - x, boulder.z - z) < r + boulder.radius ? [boulder] : [],
      };
      state.car.x = 30;
      state.car.z = speed > 10 ? 200 : 244;
      state.car.y = -0.35;
      state.car.u = speed;
      const events: GameEvent[] = [];
      for (let i = 0; i < 120 * 5; i++) {
        events.push(...step(state, { ...NEUTRAL_INPUT, throttle: speed > 10 ? 1 : 0.3 }));
      }
      return { events, state };
    };

    const fast = run(30);
    expect(fast.events.find((e) => e.type === "crash")).toMatchObject({ into: "boulder" });
    expect(fast.events.some((e) => e.type === "respawn")).toBe(true);

    const slow = run(4);
    expect(slow.events.filter((e) => e.type === "crash")).toHaveLength(0);
    expect(slow.state.car.u).toBeLessThan(4);
    expect(Math.hypot(slow.state.car.x - boulder.x, slow.state.car.z - boulder.z)).toBeGreaterThan(
      boulder.radius - 0.1,
    );
  });
});

describe("the terrain field", () => {
  it("is deterministic: two fields from one track agree everywhere", () => {
    const track = compileTrack(11);
    const a = createTerrain(track);
    const b = createTerrain(track);
    for (let i = 0; i < 200; i++) {
      const x = ((i * 373) % 2000) - 1000;
      const z = ((i * 761) % 3000) - 500;
      expect(a.heightAt(x, z)).toBe(b.heightAt(x, z));
    }
    const oa = a.obstaclesNear(500, 500, 300);
    const ob = b.obstaclesNear(500, 500, 300);
    expect(oa).toEqual(ob);
    expect(oa.length).toBeGreaterThan(0);
  });

  it("keeps its solid props off the road", () => {
    const track = compileTrack(11);
    const terrain = createTerrain(track);
    for (let i = 0; i < track.samples.length; i += 10) {
      const s = track.samples[i];
      for (const ob of terrain.obstaclesNear(s.x, s.z, 30)) {
        const d = Math.hypot(ob.x - s.x, ob.z - s.z);
        expect(d).toBeGreaterThan(track.width / 2 + ob.radius);
      }
    }
  });

  it("holds a flat shelf under the road and open landscape beyond it", () => {
    const track = compileTrack(11);
    const terrain = createTerrain(track);
    const s = track.samples[100];
    // Under the road the shelf sits pinned just below grade.
    expect(terrain.heightAt(s.x, s.z)).toBeCloseTo(s.elevation - 0.35, 1);
    // Far away the landscape is its own: finite and varied.
    const far = terrain.heightAt(s.x + 2000, s.z + 2000);
    expect(Number.isFinite(far)).toBe(true);
  });
});
