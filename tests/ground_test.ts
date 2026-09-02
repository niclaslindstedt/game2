// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Where the car STANDS (engine/game/ground.ts): the road and the country as
// one surface, the bump a step in the ground puts into the springs, the kink
// the wheels cannot follow, and the wheels' own speed read along the path.

import { describe, expect, it } from "vitest";

import {
  NEUTRAL_INPUT,
  TUNING,
  compileStage,
  compileTrack,
  createGame,
  createTerrain,
  locate,
  step,
  type CarInput,
  type GameEvent,
  type GameState,
  type SegmentPlan,
} from "@engine";

const LONG_STRAIGHT: SegmentPlan[] = [{ kind: "straight", length: 9000, feature: "none" }];

const drive = (overrides: Partial<CarInput> = {}): CarInput => ({
  ...NEUTRAL_INPUT,
  ...overrides,
});

function freshState(): GameState {
  return createGame({
    seed: 3,
    carId: "compact",
    skipCountdown: true,
    track: compileTrack(3, LONG_STRAIGHT),
  });
}

/** A synthetic landscape with no water and no solids: the scenario is
 * exactly the shape handed in. */
function wild(state: GameState, heightAt: (x: number, z: number) => number): void {
  state.terrain = {
    ...state.terrain,
    heightAt,
    groundAt: heightAt,
    waterAt: () => null,
    obstaclesNear: () => [],
    treesNear: () => [],
  };
}

/** Put the car well out beside the road, pointed along +x, on a landscape
 * built around where it ends up. Returns that x. */
function intoTheWild(state: GameState, ground: (from: number) => (x: number) => number): number {
  const car = state.car;
  car.x += 200;
  car.heading = Math.PI / 2;
  const height = ground(car.x);
  wild(state, (x) => height(x));
  car.y = height(car.x);
  return car.x;
}

describe("the road and the country", () => {
  it("agree on the ground at the verge line, on a graded road", () => {
    // The car is on the road out to `offTrack.verge` past the mat's edge and
    // on the terrain beyond it; the two readers have to hand over at a
    // shared height, or every crossing of that line is a step the car is
    // dropped down — and on a graded road the nearest sample's elevation
    // alone is a sawtooth of the road's own grade.
    const track = compileStage(3, "medium");
    const terrain = createTerrain(track);
    let graded = 0;
    let worst = 0;
    for (let i = 20; i < track.samples.length - 20; i += 7) {
      const s = track.samples[i];
      const next = track.samples[i + 1];
      if (s.deck || Math.abs(next.elevation - s.elevation) < 0.05) continue;
      graded++;
      const right = { x: Math.cos(s.heading), z: -Math.sin(s.heading) };
      // Between two samples, where interpolation matters most.
      const mid = { x: (s.x + next.x) / 2, z: (s.z + next.z) / 2 };
      for (const side of [-1, 1]) {
        const lat = side * (s.width / 2 + TUNING.offTrack.verge);
        const x = mid.x + right.x * lat;
        const z = mid.z + right.z * lat;
        const road = locate(track, x, z, i).elevation;
        const country = terrain.groundAt(x, z);
        worst = Math.max(worst, Math.abs(road - country));
      }
    }
    expect(graded).toBeGreaterThan(20);
    expect(worst).toBeLessThan(0.03);
  });
});

describe("the bump", () => {
  /** Drive `seconds` over `ground` at `u` and report the body's deepest
   * squat and highest rebound once the car is past `from + 60`. */
  function cross(
    ground: (from: number) => (x: number) => number,
    u: number,
  ): { deepest: number; highest: number; flew: boolean } {
    const state = freshState();
    const car = state.car;
    const from = intoTheWild(state, ground);
    car.u = u;
    let deepest = 0;
    let highest = 0;
    let flew = false;
    for (let i = 0; i < TUNING.physicsHz * 3; i++) {
      step(state, drive({ throttle: 0.3 }));
      flew ||= car.airborne;
      if (car.x > from + 60) {
        deepest = Math.min(deepest, car.ride);
        highest = Math.max(highest, car.ride);
      }
    }
    return { deepest, highest, flew };
  }

  it("a step in the ground squats the body; smooth ground leaves it still", () => {
    // A kerb's worth of step, 60 m ahead — the shoulder off a road, a lattice
    // crease — against the same run on a flat.
    const kerb = cross((from) => (x) => (x > from + 60 ? 0.14 : 0), 25);
    const flat = cross(() => () => 0, 25);
    expect(kerb.flew).toBe(false);
    expect(kerb.deepest).toBeLessThan(-0.02);
    expect(kerb.highest).toBeGreaterThan(0.005);
    expect(Math.abs(flat.deepest)).toBeLessThan(0.003);
  });

  it("a gentle grade change is the shape of the hill, not a bump", () => {
    // A brow's worth of grade change over a long, smooth curve: the springs
    // see the shape through the capped channel and barely move.
    const brow = cross(
      (from) => (x) => {
        const t = Math.min(1, Math.max(0, (x - (from + 40)) / 60));
        return 3 * t * t * (3 - 2 * t);
      },
      25,
    );
    expect(brow.flew).toBe(false);
    expect(Math.abs(brow.deepest)).toBeLessThan(0.02);
  });
});

describe("the kink", () => {
  /** Climb a grade that stops at `from + 60` and report whether the car flew
   * off the top. */
  function overTheTop(grade: number, u: number): { flew: boolean; takeoff?: GameEvent } {
    const state = freshState();
    const car = state.car;
    intoTheWild(state, (from) => (x) => grade * Math.min(60, Math.max(0, x - (from + 20))));
    car.u = u;
    let takeoff: GameEvent | undefined;
    for (let i = 0; i < TUNING.physicsHz * 3; i++) {
      for (const e of step(state, drive({ throttle: 0.5 })))
        if (e.type === "takeoff") takeoff ??= e;
    }
    return { flew: state.stats.jumps > 0, takeoff };
  }

  it("a sharp convex kink at pace throws the car; a soft one is driven over", () => {
    const sharp = overTheTop(0.6, 30);
    expect(sharp.flew).toBe(true);
    // ...with the speed the wheels were climbing at, less the share the body
    // never carried — never the whole of it.
    if (sharp.takeoff?.type === "takeoff") {
      expect(sharp.takeoff.vy).toBeGreaterThan(3);
      expect(sharp.takeoff.vy).toBeLessThan(0.6 * 30);
    }
    const soft = overTheTop(0.2, 30);
    expect(soft.flew).toBe(false);
  });

  it("the same kink at a crawl is driven over and down", () => {
    expect(overTheTop(0.6, 8).flew).toBe(false);
  });

  it("a wall is never read as the ground falling away", () => {
    // Head-on into a face the grade term reads as a mountain: the smoothed
    // grade says the car is climbing at absurd speed while the wheels go
    // nowhere. That must stop the car, not throw it.
    const state = freshState();
    const car = state.car;
    intoTheWild(state, (from) => (x) => Math.min(24, Math.max(0, (x - (from + 60)) * 8)));
    car.u = 30;
    for (let i = 0; i < TUNING.physicsHz * 3; i++) step(state, drive({ throttle: 1 }));
    expect(state.stats.jumps).toBe(0);
    expect(car.u).toBeLessThan(12);
  });
});

describe("the wheels' own speed", () => {
  it("is the ground's rise along the path, not the body's lift onto its seat", () => {
    // Set down at the centre height on a hillside, the body is seated over
    // its footprint on the first step — a lift of a quarter of a metre that
    // is not the wheels going anywhere. A steady climb after that reads the
    // grade times the pace, and nothing else.
    const state = freshState();
    const car = state.car;
    intoTheWild(state, (from) => (x) => 0.2 * (x - from));
    car.u = 12;
    const first = step(state, drive({ throttle: 0.4 }));
    expect(first.some((e) => e.type === "takeoff")).toBe(false);
    for (let i = 0; i < TUNING.physicsHz; i++) step(state, drive({ throttle: 0.4 }));
    expect(car.airborne).toBe(false);
    expect(car.wheelVy).toBeCloseTo(car.u * 0.2, 1);
  });
});

describe("a jump met from behind", () => {
  const JUMP_STAGE: SegmentPlan[] = [
    {
      kind: "straight",
      length: 700,
      feature: "jump",
      featureStart: 400,
      featureEnd: 414,
      lipHeight: 2,
    },
    { kind: "straight", length: 400, feature: "none" },
  ];

  it("is climbed step by step and flown off the top — never teleported up its face", () => {
    const state = createGame({
      seed: 0,
      carId: "classic",
      skipCountdown: true,
      track: compileTrack(0, JUMP_STAGE),
    });
    const car = state.car;
    const lip = state.track.samples.findIndex((s) => s.jump);
    const from = state.track.samples[lip + 60];
    car.x = from.x;
    car.z = from.z;
    car.y = from.elevation;
    car.heading = from.heading + Math.PI;
    car.u = 28;
    state.progressIndex = lip + 60;
    state.nearIndex = lip + 60;
    let worstRise = 0;
    let flew = false;
    for (let i = 0; i < TUNING.physicsHz * 4 && !flew; i++) {
      const before = car.y;
      step(state, drive({ throttle: 0.35 }));
      flew = car.airborne;
      if (!flew) worstRise = Math.max(worstRise, car.y - before);
    }
    expect(flew).toBe(true);
    // The landing face is as steep as the lip is tall over one sample: at
    // this pace the car climbs it in a handful of steps, each a fraction of
    // the height — never the whole face in one.
    expect(worstRise).toBeLessThan(0.5);
    expect(car.y).toBeGreaterThan(state.track.samples[lip].elevation - 0.3);
  });
});
