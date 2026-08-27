// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// What the DRIVETRAIN is worth. The roster's three cars differ by data
// alone, so these assert the behaviours those numbers are supposed to buy:
// a rear axle that steps out on the throttle at walking pace, a front axle
// that pulls the car straight out of a slide instead of into one, a weight
// throw that unsticks a car no driven wheel could, and tires that make a
// surface a choice. Run on a synthetic dead-straight stage, widened so the
// handling is measured rather than the off-road respawn.
import { describe, expect, it } from "vitest";

import {
  NEUTRAL_INPUT,
  TUNING,
  carById,
  compileTrack,
  createGame,
  step,
  type CarInput,
  type GameState,
  type Surface,
  type SegmentPlan,
} from "@engine";

const STRAIGHT: SegmentPlan[] = [{ kind: "straight", length: 4000, feature: "none" }];

function game(carId: string, surface?: Surface): GameState {
  const base = compileTrack(0, STRAIGHT);
  return createGame({
    seed: 0,
    carId,
    skipCountdown: true,
    track: {
      ...base,
      width: 400,
      samples: surface ? base.samples.map((s) => ({ ...s, surface, bank: 0 })) : base.samples,
    },
  });
}

function run(state: GameState, input: Partial<CarInput>, seconds: number): void {
  for (let i = 0; i < Math.round(seconds / TUNING.dt); i++) {
    step(state, { ...NEUTRAL_INPUT, ...input });
  }
}

/** Hold the car at `speed` while it is steered, so the slip angle it
 * settles at is about the YAW and not about what the throttle did to pace.
 * The ground speed is what is pinned — the slip angle itself is untouched. */
function pinned(state: GameState, input: Partial<CarInput>, speed: number, seconds: number): void {
  for (let i = 0; i < Math.round(seconds / TUNING.dt); i++) {
    step(state, { ...NEUTRAL_INPUT, ...input });
    const ground = Math.hypot(state.car.u, state.car.w);
    state.car.u *= speed / ground;
    state.car.w *= speed / ground;
  }
}

/** Put the car on the straight at `speed`, in the gear that speed belongs
 * to — a car dropped in at pace in first would be on its rev limiter. */
function atSpeed(state: GameState, speed: number): void {
  state.car.u = speed;
  const gear = state.spec.gearTop.findIndex((top) => top > speed * 1.02);
  state.car.gear = gear < 0 ? state.spec.gearTop.length - 1 : gear;
}

const RWD = "classic";
const FWD = "compact";
const AWD = "coupe";

describe("the drivetrain", () => {
  it("gives the roster one car of each layout", () => {
    expect(carById(FWD).drive).toBe("fwd");
    expect(carById(RWD).drive).toBe("rwd");
    expect(carById(AWD).drive).toBe("awd");
  });

  it("lets the rear-driver step its tail out at walking pace, on the throttle", () => {
    // 10 km/h — far below the speed at which the WHEEL can unstick anything.
    // Only torque through a driven rear axle gets the car sideways here.
    const state = game(RWD);
    atSpeed(state, 2.8);
    pinned(state, { steer: 1, throttle: 1 }, 2.8, 1.5);
    expect(state.car.drifting).toBe(true);
    expect(Math.abs(state.car.slip)).toBeGreaterThan(TUNING.drift.enterSlip);

    // Off the throttle at the same speed and lock it simply turns: the
    // torque is doing this, not the steering.
    const coasting = game(RWD);
    atSpeed(coasting, 2.8);
    pinned(coasting, { steer: 1, throttle: 0 }, 2.8, 1.5);
    expect(coasting.car.drifting).toBe(false);
    expect(Math.abs(coasting.car.slip)).toBeLessThan(Math.abs(state.car.slip) / 2);
  });

  it("gives no such thing to the front-driver or the four-wheel-drive", () => {
    for (const carId of [FWD, AWD]) {
      const state = game(carId);
      atSpeed(state, 2.8);
      pinned(state, { steer: 1, throttle: 1 }, 2.8, 1.5);
      expect(state.car.drifting).toBe(false);
    }
  });

  it("makes the throttle deepen a rear-driven slide and straighten a front-driven one", () => {
    const deltas: Record<string, number> = {};
    for (const carId of [FWD, RWD, AWD]) {
      const power = game(carId);
      atSpeed(power, 30);
      pinned(power, { steer: 0.55, throttle: 1 }, 30, 1.2);
      const lift = game(carId);
      atSpeed(lift, 30);
      pinned(lift, { steer: 0.55, throttle: 0 }, 30, 1.2);
      deltas[carId] = Math.abs(power.car.slip) - Math.abs(lift.car.slip);
    }
    // The rear axle feeds the slide, the front axle pulls the car out of
    // it, and driving all four sits between the two. That ORDER is the
    // whole point of the layout being physics rather than a badge.
    expect(deltas[RWD]).toBeGreaterThan(deltas[AWD]);
    expect(deltas[AWD]).toBeGreaterThan(deltas[FWD]);
    expect(deltas[RWD]).toBeGreaterThan(0);
    expect(deltas[FWD]).toBeLessThanOrEqual(0);
  });

  it("gets the front-driver sideways on a flick, at a lock that alone would not", () => {
    // Turn straight in on a moderate lock: the front-driver understeers up
    // to its limit and settles at a small angle.
    const plain = game(FWD);
    atSpeed(plain, 25);
    pinned(plain, { steer: 0.55, throttle: 1 }, 25, 0.6);
    const gripped = Math.abs(plain.car.slip);

    // Now the move the game is named after: full lock AWAY from the corner,
    // then snap onto it. Nothing about the corner has changed — only the
    // weight thrown across the car on the way in.
    const flicked = game(FWD);
    atSpeed(flicked, 25);
    pinned(flicked, { steer: -1, throttle: 1 }, 25, 0.3);
    pinned(flicked, { steer: 0.55, throttle: 1 }, 25, 0.6);
    expect(Math.abs(flicked.car.slip)).toBeGreaterThan(gripped * 1.5);
    expect(flicked.car.drifting).toBe(true);
  });

  it("throws no weight when the hands are chasing the car rather than crossing it", () => {
    // Winding ON more lock is not a flick however fast it is done: the
    // guard is that the wheel has to cross the car, or every correction
    // mid-corner would unstick the rear.
    const state = game(FWD);
    atSpeed(state, 25);
    pinned(state, { steer: 0.2, throttle: 1 }, 25, 0.4);
    pinned(state, { steer: 1, throttle: 1 }, 25, 0.02);
    expect(state.car.flick).toBe(0);
  });

  it("makes the tires a real choice: road rubber gains on tarmac, gravel rubber does not", () => {
    // Each car against ITSELF across the two surfaces, as the FRACTION of
    // its slide that survives the sealed road. How far into a slide a car
    // is at a given lock is mostly its layout, so the absolute drop mostly
    // measures how loose the car already was; the fraction is scale-free
    // and is what the tires actually decide — how much a sealed road is
    // worth to THIS car. Road rubber keeps almost none of its gravel
    // slide; a gravel tire finds little there and keeps most of it, and
    // that asymmetry is what makes the surface a choice rather than a
    // ranking every car agrees on.
    const slideAt = (carId: string, surface: Surface): number => {
      const state = game(carId, surface);
      atSpeed(state, 30);
      pinned(state, { steer: 0.6, throttle: 1 }, 30, 1);
      return state.car.slide;
    };
    const kept = (carId: string): number => slideAt(carId, "asphalt") / slideAt(carId, "gravel");
    expect(kept(FWD)).toBeLessThan(kept(AWD));
    expect(kept(AWD)).toBeLessThan(kept(RWD));
    // ...and it is the tires saying so: the ordering is their sealed/loose
    // ratio, read back off the catalog.
    const ratio = (carId: string): number =>
      carById(carId).tyres.sealed / carById(carId).tyres.loose;
    expect(ratio(FWD)).toBeGreaterThan(ratio(AWD));
    expect(ratio(AWD)).toBeGreaterThan(ratio(RWD));
  });

  it("puts the power down where there is nothing to put it down on", () => {
    // A standing start through water, as a fraction of the same start on
    // dry gravel. One driven axle carrying all the torque spins it away;
    // four driven wheels share it out and the car simply goes. This is the
    // four-wheel-drive's whole case, and the rear-driver's whole cost.
    const keptInWater = (carId: string): number => {
      const dry = game(carId, "gravel");
      run(dry, { throttle: 1 }, 3);
      const wet = game(carId, "water");
      run(wet, { throttle: 1 }, 3);
      return wet.car.u / dry.car.u;
    };
    expect(keptInWater(AWD)).toBeGreaterThan(keptInWater(FWD));
    expect(keptInWater(FWD)).toBeGreaterThan(keptInWater(RWD));
  });

  it("puts the slide's speed floor where the layout can reach it", () => {
    // The floor under the whole slide is the drivetrain's. The rear-driver's
    // sits at walking pace, which is the only reason its tail-out above
    // registers at all.
    // The floor is a RAMP `slideSpan` wide, so a layout that is meant to
    // slide at a given speed needs its floor that much below it — a floor
    // sitting exactly at walking pace leaves the slide 1% open there.
    const floor = (drive: "fwd" | "rwd" | "awd"): number =>
      TUNING.drift.slideFrom * TUNING.drivetrain[drive].driftFloor;
    expect(floor("rwd") + TUNING.drift.slideSpan).toBeLessThan(2.8);
    // ...and it is the ONLY exception: the game's floor is a rule the
    // player is told, so the other two sit exactly on it.
    expect(floor("fwd")).toBe(TUNING.drift.slideFrom);
    expect(floor("awd")).toBe(TUNING.drift.slideFrom);
  });
});
