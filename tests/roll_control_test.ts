// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE DRIVER, WHILE THE CAR IS GOING OVER.
//
// A crash was a cutscene the player sat inside: `stepRolling` read no input
// at all, so the most retrievable moment in any accident — two wheels down,
// the body balanced, everything still to play for — was the one moment
// nothing they pressed could matter.
//
// What replaces it is not an override. The pedals and the wheel reach the
// world through tyres and through nothing else, so what the driver has left
// is whatever of the contact patch is still rubber (`tyreShare`), spent out
// of the same Coulomb budget the ground is already spending. These tests hold
// that to four claims: the authority EXISTS while the tyres are down, it is
// GONE once they are not, only the ENGINE may add speed with it, and its sign
// agrees with the authority the handling model already gives a car balanced
// on two wheels — because a car saved by one input mid-roll and by the
// opposite input a step later would be worse than no authority at all.
import { describe, expect, it } from "vitest";

import {
  NEUTRAL_INPUT,
  TUNING,
  WHEEL_BASIN,
  compileTrack,
  crashEnergy,
  crashTurbulence,
  createGame,
  leanTorque,
  massSpread,
  rollBed,
  step,
  tyreShare,
  updateSlip,
  type CarInput,
  type GameState,
  type SegmentPlan,
} from "@engine";

const STAGE: SegmentPlan[] = [{ kind: "straight", length: 900, feature: "none" }];

function game(): GameState {
  const state = createGame({
    seed: 0,
    carId: "classic",
    skipCountdown: true,
    track: compileTrack(0, STAGE),
  });
  // The crash and nothing else: a body thrown off the road tumbles through
  // whatever is standing there, and a trunk it snaps costs it twenty metres a
  // second in one step. Any measurement of what the DRIVER is worth has to
  // sweep the scenery out of the way first.
  state.terrain.obstaclesNear = () => [];
  state.terrain.treesNear = () => [];
  return state;
}

/** A CAR GOING OVER, WITH ITS TYRES STILL THE THING ON THE GROUND — the trip
 * as a rally car actually takes one: real speed across the body, a roll rate
 * that has committed it, and a lean the shell has not taken over at yet.
 *
 * Stood rather than driven to, for the crash lab's own reason: what is under
 * test is what the driver can do from here, not the ability to arrive here.
 *
 * The sideways speed is NEGATIVE, so the body goes over to the positive side
 * of the roll and a positive steering input is the one opposing it. */
function trip(input: Partial<CarInput>, seconds = 2.5, over = 0.8, rate = 2.2): GameState {
  const state = game();
  const car = state.car;
  car.rolling = true;
  car.planted = false;
  car.roll = over;
  car.rollRate = rate;
  car.airborne = false;
  car.u = 18;
  car.w = -8;
  updateSlip(car);
  for (let i = 0; i < Math.round(seconds / TUNING.dt); i += 1) {
    step(state, { ...NEUTRAL_INPUT, ...input });
  }
  return state;
}

const speedOf = (state: GameState): number => Math.hypot(state.car.u, state.car.w);

/** How long the same trip stays a crash, s — the roll's own length, which is
 * the readout most of what the driver does shows up in. */
function overFor(input: Partial<CarInput>): number {
  const state = trip(input, 0);
  let steps = 0;
  while (state.car.rolling && steps < TUNING.physicsHz * 6) {
    step(state, { ...NEUTRAL_INPUT, ...input });
    steps += 1;
  }
  return steps * TUNING.dt;
}

describe("the driver, while the car is going over", () => {
  it("has the tyres that are on the ground, and only those", () => {
    // The one quantity the whole thing is built on, at the attitudes it has
    // to be right at. Read against level: the bed is the hillside's business
    // and this is the body's.
    expect(tyreShare(0, 0)).toBeCloseTo(1, 6);
    expect(tyreShare(Math.PI / 2, 0)).toBeCloseTo(0, 6);
    expect(tyreShare(Math.PI, 0)).toBe(0);
    // Past its outside wheels there is still most of a contact patch, which
    // is why the moment reads as retrievable rather than as already decided.
    expect(tyreShare(WHEEL_BASIN, 0)).toBeGreaterThan(0.4);
    // ...and it is exactly the same line `onItsWheels` draws, approached from
    // the other side: an attitude with no rubber down is well past the basin.
    expect(tyreShare(WHEEL_BASIN, 0)).toBeLessThan(1);
  });

  it("carries the car further on the throttle", () => {
    // Measured over the first half second, while there is still a car going
    // over to drive: everything grinds to a halt by the end of a crash, and
    // a claim about the pedals read there is a claim about friction.
    expect(speedOf(trip({ throttle: 1 }, 0.5))).toBeGreaterThan(speedOf(trip({}, 0.5)) + 1);
    // ...and it is the one term that lengthens an accident rather than
    // shortening it: a driven wheel is not a wheel being dragged.
    expect(overFor({ throttle: 1 })).toBeGreaterThan(overFor({}));
  });

  it("shortens the accident on the brake, and lands it the right way up", () => {
    // WHAT A BRAKE IS WORTH ONCE THE CAR IS OVER, honestly: not a harder
    // stop. A body already sliding has the ground dragging at the whole of
    // the patch's budget in the direction it is travelling, and a pedal
    // cannot ask for more friction than the patch has — so the brake spends
    // the same budget the ground was spending anyway.
    //
    // What it buys instead is the crash ENDING SOONER, and ending with the
    // car on its wheels rather than lying on its side waiting for the crew.
    // Which is the difference between a bad moment and a retirement.
    expect(overFor({ brake: 1 })).toBeLessThan(overFor({}) - 0.2);
    expect(trip({}, 3).overturned).not.toBeNull();
    expect(trip({ brake: 1 }, 3).overturned).toBeNull();
    // The lever is the same ask while the car is over: there are no rear
    // wheels to lock in any sense that means anything.
    expect(overFor({ handbrake: true })).toBeLessThan(overFor({}) - 0.2);
    // ...and a pedal cannot push a car backwards, however long it is held:
    // the brake's impulse is capped at bringing the travel to a stop.
    expect(speedOf(trip({ brake: 1 }, 1.5))).toBeGreaterThanOrEqual(0);
  });

  it("brakes against the TRAVEL, not along the nose", () => {
    // A car going over is rarely pointed where it is going, and a brake that
    // acted along the heading would push a crossed-up car SIDEWAYS instead of
    // slowing it. Stood crossed right up: all of the travel is across the
    // body, none of it along.
    //
    // Read as a SPEED, never as `u` and `w` apart: the body is spinning, and
    // `rotateFrame` pours one of those axes into the other every step, so
    // each on its own says more about the yaw than about the pedal.
    const crossed = (input: Partial<CarInput>): number => {
      const state = game();
      const car = state.car;
      car.rolling = true;
      car.planted = false;
      car.roll = WHEEL_BASIN * 0.8;
      car.rollRate = 0;
      car.airborne = false;
      car.u = 0;
      car.w = 14;
      updateSlip(car);
      for (let i = 0; i < TUNING.physicsHz / 2; i += 1) step(state, { ...NEUTRAL_INPUT, ...input });
      return Math.hypot(car.u, car.w);
    };
    // The pedal reaches a car whose travel is entirely across it, which it
    // could not if the impulse were written along the heading — that car has
    // no forward speed for a nose-aligned brake to take.
    expect(crossed({ brake: 1 })).toBeLessThan(crossed({}) - 1);
  });

  it("steers the body back down, or lets it go the rest of the way over", () => {
    // THE CLAIM THE WHOLE THING IS FOR. The steering force acts at the
    // ground, a weight's height below the weight, so it works on the same
    // lever the ground's own friction turns the body over on: one way it
    // pushes the body back onto four wheels, the other leaves the crash to
    // finish. Nothing scripts either — it is the sign of the lateral force
    // against the sign of the lean.
    const caught = trip({ steer: 1 });
    const gone = trip({ steer: -1 });
    const alone = trip({});
    // Caught: back on four wheels, being driven, out of the accident.
    expect(caught.car.rolling).toBe(false);
    expect(caught.car.planted).toBe(true);
    expect(Math.abs(caught.car.roll)).toBeLessThan(WHEEL_BASIN);
    // ...where the same crash left alone lies down on its side and stays
    // there, and the wrong lock does nothing to stop it.
    expect(Math.abs(alone.car.roll)).toBeGreaterThan(WHEEL_BASIN);
    expect(Math.abs(gone.car.roll)).toBeGreaterThan(WHEEL_BASIN);
    // And catching it COSTS: a car that has been most of the way over and
    // come back is a car with no speed left, not one that shrugged.
    expect(speedOf(caught)).toBeLessThan(speedOf(trip({}, 0.05)));
  });

  it("takes the same lock on both sides of the hand-back", () => {
    // A car saved by one input while `rolling` and by the OPPOSITE input a
    // step after it is handed back would be worse than no authority at all:
    // the driver would have to notice a flag they cannot see and reverse
    // their hands on it. So the two halves have to be one model, and this is
    // the invariant that says so — the same lock, in the same crash, on
    // either side of the moment `rolling` goes false.
    //
    // The handling side is `leanTorque`, and it is the lateral force the
    // tyres make that reaches it: positive to the car's right, positive on
    // the rate. The roll's own steering term is written in the same form on
    // the same lever, so both must answer a right-hand lock the same way.
    const mass = massSpread(game().spec.mass);
    const bed = rollBed({ slope: 0, slopeLat: 0 });
    const lean = WHEEL_BASIN * 0.9;
    expect(leanTorque(lean, 0, 1, mass, bed)).toBeGreaterThan(leanTorque(lean, 0, 0, mass, bed));
    // ...and end to end, which is the half a player can feel: the lock that
    // catches the car while the roll owns it is the lock that keeps it once
    // the handling model has it back, without the driver changing hands.
    const caught = trip({ steer: 1 });
    expect(caught.car.rolling).toBe(false);
    const held = Math.abs(caught.car.roll);
    for (let i = 0; i < TUNING.physicsHz; i += 1) {
      step(caught, { ...NEUTRAL_INPUT, steer: 1, throttle: 0.3 });
    }
    expect(caught.car.rolling).toBe(false);
    expect(Math.abs(caught.car.roll)).toBeLessThanOrEqual(held + 0.05);
  });

  it("gives a car on its ROOF nothing at all", () => {
    // There is no rubber on the ground, so there is nobody to ask, and the
    // crash proceeds as though the pedals were not there. The geometry says
    // so on its own — nothing writes down "this crash is unrecoverable".
    // Held to the window the body is genuinely inverted for: a car on its
    // roof rocks, and the moment it has rocked far enough for a tyre to
    // reach the ground the driver is owed that tyre — which is the rule
    // working, not an exception to it.
    const where = (input: Partial<CarInput>): number[] => {
      const state = trip(input, 0.15, Math.PI, 0);
      expect(tyreShare(state.car.roll, state.car.pitch)).toBe(0);
      return [state.car.x, state.car.z, state.car.roll, state.car.u, state.car.w];
    };
    const coasting = where({});
    for (const input of [{ throttle: 1 }, { brake: 1 }, { steer: 1 }, { steer: -1 }]) {
      expect(where(input)).toEqual(coasting);
    }
  });

  it("lets only the ENGINE add speed, and the ground answer for the rest", () => {
    // The module's spine is that nothing in it makes energy out of nothing.
    // The throttle is the one honest exception — it has an engine behind it
    // — so the wheel and the brake have to leave the ledger where a crash
    // with nobody driving leaves it. Measured step by step against the one
    // thing that legitimately adds (`crashTurbulence`), because an average
    // over a whole roll hides exactly the one step that is wrong.
    const worst = (input: Partial<CarInput>): number => {
      const state = game();
      const car = state.car;
      car.rolling = true;
      car.planted = false;
      car.roll = 0.8;
      car.rollRate = 2.2;
      car.airborne = false;
      car.u = 18;
      car.w = -8;
      updateSlip(car);
      const mass = massSpread(state.spec.mass);
      let most = 0;
      for (let i = 0; i < TUNING.physicsHz * 2 && car.rolling; i += 1) {
        const had = crashEnergy(car, mass);
        const allow = crashTurbulence(car, mass);
        step(state, { ...NEUTRAL_INPUT, ...input });
        if (car.rolling) most = Math.max(most, crashEnergy(car, mass) - had - allow);
      }
      return most;
    };
    // The bar is what the crash already does with nobody driving: the
    // integrator's own error over a body turning at two rad/s. Steering and
    // braking may not be worse than that; if either were pumping, it would
    // show here as a step several times the size.
    const alone = worst({});
    expect(alone).toBeGreaterThan(0);
    expect(worst({ steer: 1 })).toBeLessThanOrEqual(alone * 1.5);
    expect(worst({ steer: -1 })).toBeLessThanOrEqual(alone * 1.5);
    expect(worst({ brake: 1 })).toBeLessThanOrEqual(alone * 1.5);
  });

  it("spends one contact patch, not two", () => {
    // The driver's tyres and the ground's drag are ONE contact with ONE
    // Coulomb budget: the driver points the patch and the ground drags with
    // what is left. So the hardest ask the wheel can make is bounded by what
    // the ground was going to spend anyway, and asking for everything at
    // once buys no more travel than asking for the one thing hardest.
    const everything = speedOf(trip({ brake: 1, steer: 1, throttle: 1 }, 0.5));
    expect(everything).toBeGreaterThanOrEqual(speedOf(trip({ brake: 1 }, 0.5)));
  });
});

describe("planted — the car fully back on four wheels", () => {
  it("is the springs' own line, and is never true off them", () => {
    const state = game();
    for (let i = 0; i < TUNING.physicsHz * 2; i += 1) {
      step(state, { ...NEUTRAL_INPUT, throttle: 1 });
    }
    expect(state.car.planted).toBe(true);
    expect(state.car.rolling).toBe(false);
    // Not while the body is going over, at any point of it...
    expect(trip({}, 0.2).car.planted).toBe(false);
    expect(trip({}, 0.5, Math.PI, 0).car.planted).toBe(false);
    // ...and not while it lies on its side at the end of one. Read after the
    // roll lets go and before the respawn clock runs out, or what is measured
    // is the car put back on the road, which is planted and rightly so.
    const lying = trip({}, 3);
    expect(lying.car.rolling).toBe(false);
    expect(lying.overturned).not.toBeNull();
    expect(lying.car.planted).toBe(false);
  });

  it("comes back only once the body is level, not the moment it stops turning", () => {
    // The gap between those two is the whole reason the flag exists: the
    // roll hands a car back as soon as its tyres are down and the rotation
    // is spent, at whatever angle it is holding, and that car is being
    // driven without being planted.
    // Caught, and stepped to the exact frame the roll lets go of it.
    const state = game();
    const car = state.car;
    car.rolling = true;
    car.planted = false;
    car.roll = 0.8;
    car.rollRate = 2.2;
    car.airborne = false;
    car.u = 18;
    car.w = -8;
    updateSlip(car);
    let guard = 0;
    while (car.rolling && guard < TUNING.physicsHz * 4) {
      step(state, { ...NEUTRAL_INPUT, steer: 1 });
      guard += 1;
    }
    expect(car.rolling).toBe(false);
    // The frame the roll lets go on is never the frame the car is planted
    // on: `planted` is written by the handling model, a step later at the
    // earliest, and it is the springs' answer rather than the roll's.
    expect(car.planted).toBe(false);
    let settling = 0;
    while (!car.planted && settling < TUNING.physicsHz * 4) {
      step(state, { ...NEUTRAL_INPUT, steer: 1 });
      settling += 1;
    }
    expect(car.planted).toBe(true);
    expect(settling).toBeGreaterThan(0);
    expect(Math.abs(car.roll)).toBeLessThanOrEqual(TUNING.air.leanFree);
  });

  it("is set down again by a respawn", () => {
    // A car put back on the road at its last board is on four wheels by
    // construction, and anything waiting on a full reset is owed that — a
    // respawn IS the full reset.
    const state = trip({}, 3);
    expect(state.car.planted).toBe(false);
    expect(state.overturned).not.toBeNull();
    let guard = 0;
    while (state.overturned && guard < TUNING.physicsHz * 6) {
      step(state, { ...NEUTRAL_INPUT });
      guard += 1;
    }
    expect(state.overturned).toBeNull();
    expect(state.car.planted).toBe(true);
  });
});
