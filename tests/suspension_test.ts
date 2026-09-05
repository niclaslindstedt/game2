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
  standSolid,
  step,
  tyreLoad,
  updateSlip,
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
    for (let i = 0; i < TUNING.physicsHz * 3; i++) {
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
    for (let i = 0; i < TUNING.physicsHz * 4; i++) {
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
    for (let i = 0; i < TUNING.physicsHz; i++) {
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

describe("the weight on the tires", () => {
  /** A car at 30 m/s, optionally dropped from `height` first and optionally
   * already carrying `angle` radians of slip when the clock starts. The two
   * cars in each comparison below get the same speed and the same input;
   * the only thing that ever differs is what one of them has just been
   * through, which is the whole point. */
  function running(height: number, angle: number): GameState {
    const state = freshState();
    const car = state.car;
    car.u = 30;
    if (height > 0) {
      car.airborne = true;
      car.y += height;
      car.vy = 0;
      for (let i = 0; i < TUNING.physicsHz * 4 && car.airborne; i++)
        step(state, drive({ throttle: 0.4 }));
    }
    if (angle > 0) {
      car.w = car.u * Math.tan(angle);
      updateSlip(car);
    }
    return state;
  }

  /** Hold `steer` for `seconds` and report the angle the car ends up at. */
  function slipAfter(state: GameState, steer: number, seconds: number): number {
    for (let i = 0; i < Math.round(seconds / TUNING.dt); i++) {
      step(state, drive({ steer, throttle: 0.4 }));
    }
    return Math.abs(state.car.slip);
  }

  it("a car that lands sideways keeps the angle a car on the flat loses", () => {
    // 14° on, hands off: on the flat the tires simply take it back. Off a
    // landing they have far less to take it back WITH, and the car is still
    // going where it was going a third of a second later.
    const flat = slipAfter(running(0, 0.25), 0, 0.3);
    const jumped = slipAfter(running(1.6, 0.25), 0, 0.3);
    const slammed = slipAfter(running(4, 0.25), 0, 0.3);
    expect(jumped).toBeGreaterThan(flat * 1.4);
    // ...and the harder it came down, the more of the angle survives.
    expect(slammed).toBeGreaterThan(jumped);
  });

  it("a landing turns lock into a slide sooner than the same lock on the flat", () => {
    // The other half of the same idea: not a car already sideways, but one
    // being asked to go. Light tires cross the slide threshold on less.
    // A smaller effect than the one above, and rightly so: a landing must
    // not turn a straight car into a spin. What it does is let the slide
    // arrive about a tenth of a second sooner (~1.2x the angle a fifth of a
    // second in), after which the tires are back and the two converge.
    const flat = slipAfter(running(0, 0), 0.6, 0.3);
    const jumped = slipAfter(running(1.6, 0), 0.6, 0.3);
    expect(jumped).toBeGreaterThan(flat * 1.15);
  });

  it("even the smallest jump in the game takes weight off the tires", () => {
    // R6's shallowest lip: 0.9 m raised over 22 m, taken at 60 km/h. This
    // is the jump that used to feel like nothing at all.
    const state = freshState();
    const car = state.car;
    car.u = 17;
    car.airborne = true;
    car.y += 0.9;
    car.vy = 1.2;
    let landed = false;
    let lightest = 1;
    for (let i = 0; i < TUNING.physicsHz * 2; i++) {
      step(state, drive({ throttle: 0.4 }));
      landed ||= !car.airborne;
      if (landed) lightest = Math.min(lightest, tyreLoad(car));
    }
    expect(landed).toBe(true);
    // A CAR IS HEAVY. Even this arrives with enough of a bang to take most
    // of a full skitter's worth of grip away for a moment.
    expect(lightest).toBeLessThan(0.75);
  });

  it("sizes the skitter by how hard the wheels arrived, and settles it out", () => {
    const soft = running(0.5, 0);
    const hard = running(6, 0);
    expect(hard.car.settle).toBeGreaterThan(soft.car.settle);
    // ...and neither of them is a permanent handicap: a second later the
    // car is standing on its tires again.
    for (let i = 0; i < TUNING.physicsHz; i++) step(hard, drive({ throttle: 0.4 }));
    expect(hard.car.settle).toBe(0);
  });

  it("costs nothing on smooth ground — a flat road is a car at full weight", () => {
    const state = freshState();
    state.car.u = 30;
    for (let i = 0; i < TUNING.physicsHz; i++) step(state, drive({ throttle: 0.4 }));
    expect(Math.abs(1 - tyreLoad(state.car))).toBeLessThan(0.05);
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
    for (let i = 0; i < TUNING.physicsHz * 6; i++) {
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
    for (let i = 0; i < TUNING.physicsHz * 5; i++) step(state, drive({ throttle: 1 }));
    expect(car.damage.zones[0]).toBe(0);
    expect(car.x - start).toBeGreaterThan(120); // it kept going, uphill
    expect(car.y).toBeGreaterThan(10);
  });

  it("a steep bank is climbed at pace and refused at a crawl", () => {
    // A 1.5 grade — 56°, well past climbLimit and short of wallSlope. At
    // 30 m/s the momentum carries the car up it: the nose is not folded
    // and the car ends up well above the foot. At walking pace the same
    // face is a wall: the car stops against its foot.
    const bank = (from: number) => (x: number) =>
      Math.min(30, Math.max(0, (x - (from + 60)) * 1.5));
    const fast = freshState();
    const foot = intoTheWild(fast, bank) + 60;
    fast.car.u = 30;
    for (let i = 0; i < TUNING.physicsHz * 3; i++) step(fast, drive({ throttle: 1 }));
    expect(fast.car.damage.zones[0]).toBe(0);
    expect(fast.car.x).toBeGreaterThan(foot + 8);
    expect(fast.car.y).toBeGreaterThan(8);

    // The same face a few metres ahead of a car rolling at walking pace
    // with no throttle: it never carries the speed the face asks for.
    const slow = freshState();
    const near = (from: number) => (x: number) => Math.min(30, Math.max(0, (x - (from + 6)) * 1.5));
    const foot2 = intoTheWild(slow, near) + 6;
    slow.car.u = 5;
    for (let i = 0; i < TUNING.physicsHz * 3; i++) step(slow, drive());
    // Stopped against the foot, or rolled back off it — never up it.
    expect(slow.car.x).toBeLessThan(foot2 + 3);
    expect(slow.car.y).toBeLessThan(4);
    expect(slow.car.u).toBeLessThan(1);
  });

  it("a cliff met at an angle deflects the car along it instead of stopping it", () => {
    const state = freshState();
    const car = state.car;
    intoTheWild(state, cliff);
    car.heading = Math.PI / 2 - 0.9; // ~50° onto the face
    car.u = 30;
    // Drive into it, and read the car a quarter of a second after the
    // contact: what the face did with the car's momentum is decided there.
    // What the car does with itself AFTER that — thrown off the face's lift
    // and coming down sideways at twenty m/s, it may well roll — is the
    // landing's business, not the wall's.
    let hit = false;
    let after = 0;
    for (let i = 0; i < TUNING.physicsHz * 4 && after < TUNING.physicsHz / 4; i++) {
      if (step(state, drive({ throttle: 1 })).some((e) => e.type === "impact")) hit = true;
      if (hit) after += 1;
    }
    expect(hit).toBe(true);
    // It slid along the wall rather than parking against it.
    expect(Math.hypot(car.u, car.w)).toBeGreaterThan(12);
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
      const tree: WildObstacle = standSolid({
        x: car.x + TUNING.collision.halfWidth,
        z: car.z + TUNING.collision.halfLength + 0.4,
        y: car.y,
        kind: "tree",
        size: 1,
        spin: 0,
      });
      const events: GameEvent[] = [];
      collideCar(state.spec, car, [tree], events, state.stats);
      return Math.abs(car.yawRate);
    };
    expect(carById("classic").mass).toBeGreaterThan(carById("compact").mass);
    expect(spin("classic")).toBeLessThan(spin("compact"));
  });
});
