// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The car's WEIGHT: the springs between the wheels and the body, and the
// ground as a solid the wheels can refuse to climb. The wheels track the
// terrain exactly; the body lags them, squats through what the ground does
// and rebounds back out of it, and a slam past what the springs can travel
// brings the whole chassis back off the ground. A face too steep to climb
// is a contact like any trunk: speed comes off, the nose folds, and the car
// never ends up inside the mountain.

import { describe, expect, it } from "vitest";

import {
  NEUTRAL_INPUT,
  TUNING,
  carById,
  collideCar,
  compileTrack,
  createGame,
  step,
  type CarInput,
  type GameEvent,
  type GameState,
  type WildObstacle,
} from "@engine";

const LONG_STRAIGHT = [{ kind: "straight", length: 9000, feature: "none" } as const];

const drive = (overrides: Partial<CarInput> = {}): CarInput => ({
  ...NEUTRAL_INPUT,
  ...overrides,
});

function freshState(carId = "compact"): GameState {
  return createGame({
    seed: 3,
    carId,
    skipCountdown: true,
    track: compileTrack(3, LONG_STRAIGHT),
  });
}

/** A synthetic landscape with no water and no solids — the scenario is
 * exactly the shape this function returns and nothing else. */
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

/** Put the car well out in the wild beside the road, pointed along +x, on
 * a landscape built AROUND where it ends up — props and ground go where the
 * car is, never at a bare origin. Returns that x. */
function intoTheWild(state: GameState, ground: (from: number) => (x: number) => number): number {
  const car = state.car;
  car.x += 200;
  car.heading = Math.PI / 2; // +x
  const height = ground(car.x);
  wild(state, (x) => height(x));
  car.y = height(car.x);
  return car.x;
}

describe("the springs", () => {
  it("a landing squats the body and rebounds it past level again", () => {
    const state = freshState();
    const car = state.car;
    car.u = 30;
    car.airborne = true;
    car.y += 6;
    car.vy = -14;
    let deepest = 0;
    let highest = 0;
    // Fly, land, and watch the body travel for a couple of seconds after.
    for (let i = 0; i < 120 * 3; i++) {
      step(state, drive());
      if (!car.airborne) {
        deepest = Math.min(deepest, car.ride);
        if (deepest < 0) highest = Math.max(highest, car.ride);
      }
    }
    // It compressed, it came back UP past where it started, and it settled.
    // The compression is stated against the springs' own travel rather than
    // as a bare distance: a six-metre drop is meant to use all of it and sit
    // down on the bump stops, and that claim stays true whatever the total
    // travel is set to — a bare number only means anything at one envelope.
    expect(deepest).toBeLessThan(-TUNING.suspension.travel);
    expect(highest).toBeGreaterThan(0.01);
    expect(Math.abs(car.ride)).toBeLessThan(0.02);
    // ...and never further than the stops allow, in either direction.
    expect(deepest).toBeGreaterThanOrEqual(-TUNING.suspension.heaveMax);
  });

  it("a slam past the springs' travel bounces the whole chassis back up", () => {
    const state = freshState();
    const car = state.car;
    car.u = 20;
    car.airborne = true;
    car.y += 20;
    car.vy = -25;
    let landings = 0;
    let settled = false;
    for (let i = 0; i < 120 * 4; i++) {
      for (const e of step(state, drive())) if (e.type === "landing") landings += 1;
      settled ||= car.settling;
    }
    // It came down, came back UP off the ground, and came down again.
    expect(settled).toBe(true);
    expect(landings).toBeGreaterThan(1);
    // A bounce is one landing still happening, not a second flight.
    expect(state.stats.jumps).toBe(0);
    expect(state.stats.cleanLandings).toBeLessThanOrEqual(1);
    // ...and it always comes back down.
    expect(car.airborne).toBe(false);
  });

  it("a gentle touchdown never bounces the chassis", () => {
    const state = freshState();
    const car = state.car;
    car.u = 20;
    car.airborne = true;
    car.y += 0.4;
    car.vy = -2;
    let touched = false;
    for (let i = 0; i < 120; i++) {
      step(state, drive());
      if (!car.airborne) touched = true;
      if (touched) expect(car.airborne).toBe(false);
    }
    expect(touched).toBe(true);
    expect(car.settling).toBe(false);
  });

  it("braking dives the nose and the power squats it, without touching the ground attitude", () => {
    const state = freshState();
    state.car.u = 30;
    for (let i = 0; i < 60; i++) step(state, drive({ brake: 1 }));
    const dive = state.car.pitchLoad;
    expect(dive).toBeLessThan(-0.02); // nose down under the brakes
    state.car.u = 10;
    for (let i = 0; i < 90; i++) step(state, drive({ throttle: 1 }));
    expect(state.car.pitchLoad).toBeGreaterThan(dive);
    // The ground's own attitude is flat here and stays that way: the load
    // pitch is the BODY's, kept out of `pitch` so the wheels and the shadow
    // never tilt with it.
    expect(Math.abs(state.car.pitch)).toBeLessThan(0.05);
  });
});

describe("the ground as a solid", () => {
  /** A wall 60 m ahead of wherever the car starts: flat before it, all but
   * vertical after. */
  const cliff =
    (from: number) =>
    (x: number): number =>
      Math.min(24, Math.max(0, (x - (from + 60)) * 8));

  it("driving into a cliff kills the pace, folds the nose and leaves the car outside it", () => {
    const state = freshState();
    const car = state.car;
    const from = intoTheWild(state, cliff);
    const face = cliff(from);
    const wall = from + 60;
    car.u = 30;
    let hitAt = 0;
    for (let i = 0; i < 120 * 6; i++) {
      step(state, drive({ throttle: 1 }));
      if (!hitAt && car.damage.zones[0] > 0) hitAt = car.x;
    }
    expect(hitAt).toBeGreaterThan(0); // it hit the face, not climbed it
    expect(car.u).toBeLessThan(12); // and it cost real pace
    expect(car.damage.zones[0]).toBeGreaterThan(0.02); // nose folded
    expect(car.damage.systems.engine).toBeGreaterThan(0);
    // Never inside the mountain: the car sits ON the face it stopped
    // against. It is not pinned to the height under its middle — a nose
    // against a rising face holds the body up (see seatOn), by at most the
    // rise its own footprint can claim — but it is never under the rock.
    expect(car.x).toBeLessThan(wall + 3);
    const hold = Math.hypot(TUNING.collision.halfLength, TUNING.collision.halfWidth);
    expect(car.y).toBeGreaterThanOrEqual(face(car.x) - 1e-6);
    expect(car.y - face(car.x)).toBeLessThanOrEqual(hold * TUNING.collision.climbLimit);
  });

  it("a bank the wheels can climb is a hill, not a crash", () => {
    const state = freshState();
    const car = state.car;
    // A 0.35 grade — half of climbLimit, a slope a rally car drives up.
    const start = intoTheWild(state, (from) => (x) => Math.max(0, (x - (from + 60)) * 0.35));
    car.u = 30;
    for (let i = 0; i < 120 * 5; i++) step(state, drive({ throttle: 1 }));
    expect(car.damage.zones[0]).toBe(0);
    expect(car.x - start).toBeGreaterThan(120); // it kept going, uphill
    expect(car.y).toBeGreaterThan(10);
  });

  it("a cliff met at an angle deflects the car along it instead of stopping it", () => {
    const state = freshState();
    const car = state.car;
    intoTheWild(state, cliff);
    car.heading = Math.PI / 2 - 0.9; // ~50° onto the face
    car.u = 30;
    for (let i = 0; i < 120 * 4; i++) step(state, drive({ throttle: 1 }));
    // It slid along the wall rather than parking against it.
    expect(car.u).toBeGreaterThan(6);
    expect(Math.abs(car.z - state.track.samples[0].z)).toBeGreaterThan(30);
  });
});

describe("mass", () => {
  it("the heavier car is harder for a clipped solid to spin", () => {
    const spin = (carId: string): number => {
      const state = freshState(carId);
      const car = state.car;
      car.u = 30;
      // A trunk clipped by the front-right corner.
      const tree: WildObstacle = {
        x: car.x + TUNING.collision.halfWidth,
        z: car.z + TUNING.collision.halfLength + 0.4,
        y: car.y,
        kind: "tree",
        size: 1,
        spin: 0,
        radius: 0.7,
        height: 8,
      };
      const events: GameEvent[] = [];
      collideCar(state.spec, car, [tree], events, state.stats);
      return Math.abs(car.yawRate);
    };
    expect(carById("classic").mass).toBeGreaterThan(carById("compact").mass);
    expect(spin("classic")).toBeLessThan(spin("compact"));
  });
});
