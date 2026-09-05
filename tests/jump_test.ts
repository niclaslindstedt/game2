// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The jump, moment by moment: the lip throws the car, the air is committed
// (gravity plus barely any nose authority), and the landing pays or punishes
// depending on how straight you touch down. Synthetic one-jump stage.
import { describe, expect, it } from "vitest";

import { clamp } from "../engine/lib/math.ts";

import {
  NEUTRAL_INPUT,
  TUNING,
  WHEEL_BASIN,
  carById,
  compileTrack,
  crashEnergy,
  createGame,
  goesOver,
  massSpread,
  onItsWheels,
  ridesOver,
  step,
  updateSlip,
  type CarInput,
  type GameEvent,
  type GameState,
  type SegmentPlan,
} from "@engine";

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

function game(): GameState {
  return createGame({
    seed: 0,
    carId: "classic",
    skipCountdown: true,
    track: compileTrack(0, JUMP_STAGE),
  });
}

function run(state: GameState, input: Partial<CarInput>, seconds: number): GameEvent[] {
  const events: GameEvent[] = [];
  const steps = Math.round(seconds / TUNING.dt);
  for (let i = 0; i < steps; i++) {
    events.push(...step(state, { ...NEUTRAL_INPUT, ...input }));
  }
  return events;
}

/** Drive flat out until the lip THROWS the car — the `takeoff` event, not
 * merely `airborne`: at pace the road's own bumps can hop the car for a
 * few tenths on the way, and a hop is not the jump. */
function driveToLip(state: GameState): GameEvent[] {
  const events: GameEvent[] = [];
  let guard = 0;
  let thrown = false;
  while (!thrown && guard < TUNING.physicsHz * 60) {
    const stepped = step(state, {
      ...NEUTRAL_INPUT,
      throttle: 1,
      shiftUp: state.car.u > state.spec.gearTop[state.car.gear] * 0.93,
    });
    events.push(...stepped);
    thrown = stepped.some((e) => e.type === "takeoff");
    guard += 1;
  }
  return events;
}

describe("the jump", () => {
  it("climbs the ramp smoothly — no hopping its way up", () => {
    const state = game();
    // Roll up to the ramp and record every height on the way up it.
    const heights: number[] = [];
    const pitches: number[] = [];
    let guard = 0;
    const drive = (): void => {
      step(state, {
        ...NEUTRAL_INPUT,
        throttle: 1,
        shiftUp: state.car.u > state.spec.gearTop[state.car.gear] * 0.93,
      });
      guard += 1;
    };
    // Run up to the foot of the ramp first and take the car's height THERE
    // as the floor. The road has a cross-section (R16) — a crown, and two
    // wheel tracks a car settles into — so "on the flat" is not zero, and a
    // threshold measured off zero starts recording part-way up the ramp.
    while (state.progressS < JUMP_STAGE[0].featureStart! - 20 && guard < TUNING.physicsHz * 60)
      drive();
    const rest = state.car.y;
    while (!state.car.airborne && guard < TUNING.physicsHz * 60) {
      drive();
      if (state.car.y > rest + 0.05 && !state.car.airborne) {
        heights.push(state.car.y);
        // The attitude the renderer draws: vy/u is the gradient the car is
        // climbing, and on the ramp that is the ramp's own slope.
        pitches.push(Math.atan2(state.car.vy, state.car.u));
      }
    }
    expect(heights.length).toBeGreaterThan(20);
    // Monotonic up the ramp, and climbing at a rate that only ever changes
    // gradually: the road is sampled every 2 m, so a car that snapped to the
    // nearest sample would climb in ~0.5 m stairs — alternating plateaus and
    // jumps — and bounce off every one of them.
    const climb: number[] = [];
    for (let i = 1; i < heights.length; i++) {
      expect(heights[i]).toBeGreaterThanOrEqual(heights[i - 1]);
      climb.push(heights[i] - heights[i - 1]);
    }
    for (let i = 1; i < climb.length; i++) {
      expect(Math.abs(climb[i] - climb[i - 1])).toBeLessThan(0.02);
    }
    // Nose up the whole climb — this is the tilt, and it is never absurd.
    expect(Math.min(...pitches)).toBeGreaterThan(0);
    expect(Math.max(...pitches)).toBeLessThan(0.6);
  });

  it("the lip throws the car with upward speed scaled by pace", () => {
    const state = game();
    const events = driveToLip(state);
    const takeoff = events.find((e) => e.type === "takeoff");
    expect(takeoff).toBeDefined();
    if (takeoff && takeoff.type === "takeoff") {
      expect(takeoff.vy).toBeGreaterThan(1);
    }
    expect(state.car.airborne).toBe(true);
    expect(state.car.y).toBeGreaterThan(0);
  });

  it("throws a car that comes at it the other way round, too", () => {
    // A lip is a crest with a face up to it, and a crest does not care which
    // way it is met. Answering only for a car driving UP the stage left the
    // one coming back down driving into the landing face instead of over it:
    // the road heaved up under the wheels and the springs paid for it, which
    // is a crash where there should be a jump.
    const state = game();
    const lip = state.track.samples.findIndex((s) => s.jump);
    expect(lip).toBeGreaterThan(0);
    // Stood well past the lip, pointed back at it, at rally pace.
    const from = state.track.samples[lip + 60];
    state.car.x = from.x;
    state.car.z = from.z;
    state.car.y = from.elevation;
    state.car.heading = from.heading + Math.PI;
    state.car.u = 28;
    state.progressIndex = lip + 60;
    state.nearIndex = lip + 60;
    const events = run(state, { throttle: 0.35 }, 4);
    const takeoff = events.find((e) => e.type === "takeoff");
    expect(takeoff).toBeDefined();
    // Thrown HARDER than the car that took it the way the stage intended,
    // and rightly so: a lip ramps up gently and drops away steeply, and the
    // face this car climbed is the steep one.
    if (takeoff && takeoff.type === "takeoff") expect(takeoff.vy).toBeGreaterThan(7);
    expect(state.stats.jumps).toBeGreaterThan(0);
    // It flew. It did not arrive at the lip on its bump stops.
    expect(state.car.damage.wear).toBe(0);
  });

  it("flight carries: real air time, forward speed nearly kept", () => {
    const state = game();
    driveToLip(state);
    const speedAtTakeoff = state.car.u;
    const events = run(state, {}, 3);
    const landing = events.find((e) => e.type === "landing");
    expect(landing).toBeDefined();
    if (landing && landing.type === "landing") {
      expect(landing.airTime).toBeGreaterThan(0.5);
      expect(landing.clean).toBe(true);
    }
    expect(state.car.airborne).toBe(false);
    // A straight, clean landing keeps the speed the car flew with.
    expect(state.car.u).toBeGreaterThan(speedAtTakeoff * 0.9);
    expect(state.stats.jumps).toBe(1);
    expect(state.stats.cleanLandings).toBe(1);
  });

  it("reports how hard the wheels arrived, not just how long they were up", () => {
    const state = game();
    driveToLip(state);
    let landing: GameEvent | undefined;
    for (let i = 0; i < TUNING.physicsHz * 3 && !landing; i++) {
      landing = step(state, { ...NEUTRAL_INPUT }).find((e) => e.type === "landing");
    }
    expect(landing).toBeDefined();
    if (landing && landing.type === "landing") {
      // The slam is what the springs had to swallow, and it is what the
      // camera, the dust and the sound are all sized off — so a flight off
      // a two-metre lip has to come back with a real number on it rather
      // than leaving the arrival to be guessed at from the air time.
      expect(landing.slam).toBeGreaterThan(8);
    }
    // ...and the car goes light on it: the wheels hop, and for the next
    // half second there is less car standing on the road.
    expect(state.car.settle).toBeGreaterThan(0.5);
  });

  it("midair the nose barely answers — the velocity is committed", () => {
    const state = game();
    driveToLip(state);
    const headingAt = state.car.heading;
    const xAt = state.car.x;
    run(state, { steer: 1 }, 0.4);
    // Full lock for 0.4 s of flight turns the nose only a few degrees...
    expect(Math.abs(state.car.heading - headingAt)).toBeLessThan(0.1);
    // ...and the flight path stays put (no mid-air lane change).
    expect(Math.abs(state.car.x - xAt)).toBeLessThan(1.5);
  });

  /** Take the lip at `u` m/s and fly the jump with `w` of sideways speed
   * pinned on through the air — the air keeps `w` frozen, so a messy takeoff
   * attitude survives to the landing — and report what the touchdown did.
   * The pin comes off at the first landing: what the car does after that is
   * the landing's own. */
  function landSideways(
    u: number,
    w: number,
  ): { landing: GameEvent | undefined; speedBefore: number; state: GameState } {
    const state = game();
    let toLip = 0;
    let thrown = false;
    while (!thrown && toLip < TUNING.physicsHz * 60) {
      state.car.u = u;
      thrown = step(state, { ...NEUTRAL_INPUT, throttle: 0.5 }).some((e) => e.type === "takeoff");
      toLip += 1;
    }
    let guard = 0;
    let speedBefore = state.car.u;
    let landing: GameEvent | undefined;
    while (!landing && guard < TUNING.physicsHz * 6) {
      speedBefore = state.car.u;
      state.car.w = w;
      landing = step(state, { ...NEUTRAL_INPUT }).find((e) => e.type === "landing");
      guard += 1;
    }
    // ...and let the landing finish happening. A roll's LENGTH is the whole
    // thing the model refuses to decide in advance, so this waits for the
    // body to stop rather than for a clock — and stops there, before the
    // beat a car left on its roof lies through (`roll.lieFor`), so what a
    // test reads is where the roll actually put the car.
    let settling = 0;
    do {
      run(state, {}, 1 / TUNING.physicsHz);
      settling += 1;
    } while ((state.car.rolling || settling < TUNING.physicsHz) && settling < TUNING.physicsHz * 6);
    return { landing, speedBefore, state };
  }

  it("a sideways landing scrubs speed and wobbles the car", () => {
    // -8 against 28 m/s forward is a 16° slip: past the clean-landing
    // limit, under the trip. It costs speed and is never counted clean, and
    // the car stays on its wheels.
    const { landing, speedBefore, state } = landSideways(28, -8);
    expect(landing).toBeDefined();
    if (landing && landing.type === "landing") expect(landing.clean).toBe(false);
    expect(state.car.u).toBeLessThan(speedBefore);
    expect(state.stats.cleanLandings).toBe(0);
    expect(state.stats.rolls).toBe(0);
    expect(Math.abs(state.car.roll)).toBeLessThan(TUNING.air.rollLandLimit);
  });

  it("a landing taken properly crossed up trips the car over", () => {
    // -16 m/s across the car at touchdown — 30° of yaw at 100 km/h — is
    // well past `tripSlide`, and the roll it buys is worth more than the
    // lift up over the body's own sill corner: the tyres bite, the body
    // goes over its outside wheels, and it keeps going.
    const { state } = landSideways(28, -16);
    expect(state.stats.rolls).toBe(1);
    // Past the corner its own weight could have brought it back from, at a
    // fraction of the speed, with the flank it came down on folded.
    expect(onItsWheels(state.car.roll, state.car.pitch)).toBe(false);
    expect(Math.hypot(state.car.u, state.car.w)).toBeLessThan(15);
    const zones = state.car.damage.zones;
    expect(Math.max(zones[2], zones[6])).toBeGreaterThan(0);
  });

  it("a roll CARRIES — a car that goes over at pace travels while it does", () => {
    // THE MOMENTUM. A rollover is not a stop: the body weighs a tonne, the
    // ground gives it a shell's friction to work against (`roll.faceGrip`,
    // around half a g on a panel), and it is off the ground for most of
    // every turn, where nothing
    // slows it at all. Accident reconstruction measures a real one at
    // around half a g overall, and the bar here is a full g — twice as
    // harsh as the world, and still a bar the model has been under.
    //
    // It has failed two ways, and both read to a player as a car hitting
    // glue: a flat exponential scrub on the travel beside the friction, and
    // the friction itself charged off arrivals the body never made — the
    // seat's own rotation under a turning car, and the tyres touching down
    // as the roll passes through upright.
    const state = game();
    // On CLEAR ground. A car thrown off a lip crossed up lands in the wild
    // and tumbles through the forest, and a trunk it snaps costs it twenty
    // metres a second in one step — which is the contact model working, and
    // nothing at all to do with what a roll costs. "Nothing to hit" is a
    // claim a test has to arrange rather than assume.
    state.terrain.obstaclesNear = () => [];
    state.terrain.treesNear = () => [];
    let thrown = false;
    for (let i = 0; !thrown && i < TUNING.physicsHz * 60; i += 1) {
      state.car.u = 40;
      thrown = step(state, { ...NEUTRAL_INPUT, throttle: 0.5 }).some((e) => e.type === "takeoff");
    }
    for (let i = 0; !state.car.rolling && i < TUNING.physicsHz * 6; i += 1) {
      state.car.w = -26;
      step(state, { ...NEUTRAL_INPUT });
    }
    expect(state.car.rolling).toBe(true);
    const into = Math.hypot(state.car.u, state.car.w);
    const x0 = state.car.x;
    const z0 = state.car.z;
    let seconds = 0;
    let worst = 0;
    while (state.car.rolling && seconds < 8) {
      const was = Math.hypot(state.car.u, state.car.w);
      step(state, { ...NEUTRAL_INPUT });
      seconds += TUNING.dt;
      worst = Math.max(worst, was - Math.hypot(state.car.u, state.car.w));
    }
    const carried = Math.hypot(state.car.x - x0, state.car.z - z0);
    const outOf = Math.hypot(state.car.u, state.car.w);
    expect(carried).toBeGreaterThan(20);
    // Against THE GRAVITY THIS WORLD RUNS AT, not 9.81. The crash's whole
    // retardation is `roll.faceGrip x g`, so as a fraction of g it is a
    // coefficient of friction and directly comparable with a real rollover's
    // 0.45 — but the game's gravity is arcade (1.6x), and dividing by the
    // real figure instead reports every crash 1.6x harsher than it is.
    expect((into - outOf) / seconds).toBeLessThan(TUNING.air.gravity);
    // ...and no ONE contact may take a third of what the car is carrying.
    // A rollover is a dozen-odd contacts sharing the work; a step that eats
    // most of the travel on its own is a bug in what the ground was charged
    // for, and it is the shape every version of this has failed in.
    expect(worst).toBeLessThan(into / 3);
  });

  it("a car that ends up on its roof GRINDS to a stop, it does not freeze", () => {
    // The other half of the momentum question, and the uglier failure. A
    // roll used to hand the car back the instant the ROTATION stopped —
    // whatever it was still carrying — and step.ts sets `overturned` on a
    // body that is down, still and off its wheels, whereupon
    // `stepOverturned` returns before anything moves. So a car that settled
    // onto its roof at 63 km/h became a statue on the spot, with the speed
    // still sitting unspent in its velocity, and was teleported to the last
    // board a beat later.
    //
    // A car on its roof has no tyres on the ground. It has a roof, and the
    // ground goes on taking the travel out of it at the same friction that
    // was turning it over — so the slide belongs to the roll, and the roll
    // keeps the car through it.
    const state = game();
    state.terrain.obstaclesNear = () => [];
    state.terrain.treesNear = () => [];
    let thrown = false;
    for (let i = 0; !thrown && i < TUNING.physicsHz * 60; i += 1) {
      state.car.u = 30;
      thrown = step(state, { ...NEUTRAL_INPUT, throttle: 0.5 }).some((e) => e.type === "takeoff");
    }
    for (let i = 0; !state.car.rolling && i < TUNING.physicsHz * 6; i += 1) {
      state.car.w = -18;
      step(state, { ...NEUTRAL_INPUT });
    }
    expect(state.car.rolling).toBe(true);
    // Run to the moment the body has stopped TURNING but is still going.
    let turning = 0;
    while (
      turning < TUNING.physicsHz * 6 &&
      (Math.abs(state.car.rollRate) > TUNING.air.roll.rest ||
        onItsWheels(state.car.roll, state.car.pitch))
    ) {
      step(state, { ...NEUTRAL_INPUT });
      turning += 1;
    }
    expect(onItsWheels(state.car.roll, state.car.pitch)).toBe(false);
    const carrying = Math.hypot(state.car.u, state.car.w);
    expect(carrying).toBeGreaterThan(10);
    // It is still the ROLL's car — not handed back, and so not frozen.
    expect(state.car.rolling).toBe(true);
    expect(state.overturned).toBeNull();
    const x0 = state.car.x;
    const z0 = state.car.z;
    let seconds = 0;
    while (state.car.rolling && seconds < 6) {
      step(state, { ...NEUTRAL_INPUT });
      seconds += TUNING.dt;
    }
    // It ground its way to a stop over real ground, and quickly: a roof and
    // its pillars dug into soil is a far better brake than four tyres. The
    // floor under the slide is the distance a body braking at a whole g
    // would need — the most the ground can take from anything — so a car
    // that stopped shorter than that was frozen, not stopped.
    const slid = Math.hypot(state.car.x - x0, state.car.z - z0);
    expect(slid).toBeGreaterThan((carrying * carrying) / (2 * TUNING.air.gravity));
    expect(Math.hypot(state.car.u, state.car.w)).toBeLessThanOrEqual(TUNING.air.roll.restSpeed);
    expect(carrying / seconds).toBeGreaterThan(TUNING.air.gravity * 0.4);
    // ...and only THEN is it a car lying on its roof for the crew to be
    // taken out of.
    expect(state.car.rolling).toBe(false);
    step(state, { ...NEUTRAL_INPUT });
    expect(state.overturned).not.toBeNull();
  });

  it("stops harder on its ROOF than on its flank — what is on the ground decides", () => {
    // The shell is not one surface. A flank is a door skin and a sill,
    // which is smooth and slides a long way; a roof is glass, gutters, the
    // pillars and whatever aerial is still attached, all of which dig in.
    // Reconstruction measures the two as different drag factors, and this
    // is where the game says so (`roll.faceGrip`).
    //
    // Both bodies are stood on their face already sliding, at the same
    // speed, so the only difference between the runs is what the ground
    // has hold of.
    const slide = (tilt: number): number => {
      const state = game();
      state.terrain.obstaclesNear = () => [];
      state.terrain.treesNear = () => [];
      const car = state.car;
      car.rolling = true;
      car.roll = tilt;
      car.rollRate = 0;
      car.airborne = false;
      car.u = 16;
      car.w = 0;
      updateSlip(car);
      const x0 = car.x;
      const z0 = car.z;
      for (let i = 0; i < TUNING.physicsHz * 8 && car.rolling; i += 1) {
        step(state, { ...NEUTRAL_INPUT });
      }
      return Math.hypot(car.x - x0, car.z - z0);
    };
    const onItsSide = slide(Math.PI / 2);
    const onItsRoof = slide(Math.PI);
    expect(onItsRoof).toBeGreaterThan(2);
    expect(onItsSide).toBeGreaterThan(onItsRoof);
    // ...and the wheels are the other end of it again: rubber dragged
    // sideways is the best brake of the three, which is also what bites at
    // the start of a trip and sends the body over its outside wheels.
    expect(TUNING.air.roll.faceGrip.wheels).toBeGreaterThan(TUNING.air.roll.faceGrip.roof);
    expect(TUNING.air.roll.faceGrip.roof).toBeGreaterThan(TUNING.air.roll.faceGrip.flank);
  });

  it("names the two halves of an accident apart: ROLLING, then SLIDING", () => {
    // A body past its outside wheels does two quite different things, and
    // only the first is a roll. It TURNS over its corners; then, when the
    // turning is spent but the travel is not, it LIES on a face and goes
    // somewhere. The roll owns both (they share a friction budget and a
    // centre-of-mass curve), which is why `rolling` stays true — but a
    // camera, a sound or an effect choosing between "the car is cartwheeling"
    // and "the car is grinding along on its roof" has to be able to tell.
    const state = game();
    state.terrain.obstaclesNear = () => [];
    state.terrain.treesNear = () => [];
    let thrown = false;
    for (let i = 0; !thrown && i < TUNING.physicsHz * 60; i += 1) {
      state.car.u = 30;
      thrown = step(state, { ...NEUTRAL_INPUT, throttle: 0.5 }).some((e) => e.type === "takeoff");
    }
    for (let i = 0; !state.car.rolling && i < TUNING.physicsHz * 6; i += 1) {
      state.car.w = -18;
      step(state, { ...NEUTRAL_INPUT });
    }
    expect(state.car.rolling).toBe(true);
    // Going over: turning, and never called a slide while it does.
    expect(state.car.sliding).toBe(false);
    let turning = 0;
    let slid = 0;
    while (state.car.rolling && turning < TUNING.physicsHz * 8) {
      step(state, { ...NEUTRAL_INPUT });
      turning += 1;
      if (state.car.sliding) {
        slid += 1;
        // The invariant: a slide is a state the ROLL is in, so the two are
        // never independent and a car is never sliding without the roll
        // owning it.
        expect(state.car.rolling).toBe(true);
        expect(state.car.airborne).toBe(false);
        expect(onItsWheels(state.car.roll, state.car.pitch)).toBe(false);
      }
    }
    // It ground along on a face for a real stretch before it stopped.
    expect(slid).toBeGreaterThan(TUNING.physicsHz * 0.25);
    // ...and once the roll hands the car back, neither flag is left set.
    expect(state.car.rolling).toBe(false);
    expect(state.car.sliding).toBe(false);
  });

  it("a slide turns back into a ROLL when the ground runs out under one side", () => {
    // The case a uniform slope cannot make: a body resting on its roof on a
    // plane is stable however steep the plane, and it simply slides. What
    // puts a sliding car over again is an EDGE — the ground running out
    // under one side of it — and the roll has to be reading its own
    // centre-of-mass curve against the GROUND rather than against level to
    // notice, or the hillside may as well not be there.
    const slideOver = (edge: number): { over: number; rate: number } => {
      const state = game();
      state.terrain.obstaclesNear = () => [];
      state.terrain.treesNear = () => [];
      const car = state.car;
      // Well off the road: the wild is the only branch that reads the
      // terrain's own gradient. On the ribbon the slope comes from the
      // road's frame and ground laid under the car is never consulted.
      const cosH = Math.cos(car.heading);
      const sinH = Math.sin(car.heading);
      car.x += cosH * 45;
      car.z -= sinH * 45;
      const x0 = car.x;
      const z0 = car.z;
      const y0 = state.terrain.groundAt(x0, z0);
      state.terrain.groundAt = (x, z) => {
        const across = (x - x0) * cosH - (z - z0) * sinH;
        return y0 - Math.min(6, Math.max(0, across - edge) * 1.6);
      };
      car.y = state.terrain.groundAt(car.x, car.z);
      car.rolling = true;
      car.roll = Math.PI;
      car.rollRate = 0;
      car.airborne = false;
      car.vy = 0;
      car.u = 15;
      car.w = 5;
      updateSlip(car);
      // WHAT THE EDGE PUT INTO THE BODY, rather than where the body ended
      // up: the peak rate it was turned at, and the furthest round it got.
      // A rocking body comes back, so the net angle it finishes on cancels
      // the very thing under test — the old reading of it could not tell a
      // body levered fifty degrees over from one that never moved.
      const roll0 = car.roll;
      let over = 0;
      let rate = 0;
      for (let i = 0; i < TUNING.physicsHz * 9 && car.rolling; i += 1) {
        step(state, { ...NEUTRAL_INPUT });
        over = Math.max(over, Math.abs(car.roll - roll0));
        rate = Math.max(rate, Math.abs(car.rollRate));
      }
      return { over, rate };
    };
    // An edge a metre to its right levers the body off the face it was
    // lying on and puts it back into a genuine roll — turning several times
    // faster than the bar the model calls the rotation spent at, and most of
    // the way round to the flank beside it.
    const cliff = slideOver(1.2);
    expect(cliff.rate).toBeGreaterThan(TUNING.air.roll.rest * 3);
    expect(cliff.over).toBeGreaterThan(0.7);
    // The same ground with the drop pushed far out of reach is a flat plain,
    // and a roof resting on a plain is a stable face: the body does not turn
    // at all, which is the whole distinction between an EDGE and a RAMP.
    const plain = slideOver(400);
    expect(plain.rate).toBeLessThan(TUNING.air.roll.rest);
    expect(plain.over).toBeLessThan(0.1);
  });

  it("a car that is going over rides over nothing", () => {
    // `ridesOver` measures the bar off `car.y`, which for a rolling body is
    // its origin held a hull's width in the air. A car on its flank also
    // has no wheels underneath it to climb anything with — so the one
    // moment it is least able to avoid what is in front of it was the one
    // moment it flew over all of it.
    const state = game();
    const stone = {
      x: state.car.x,
      z: state.car.z,
      y: 0,
      kind: "rock" as const,
      size: 1,
      spin: 0,
      radius: 0.6,
      height: 0.5,
      mass: 300,
      rooted: 0.7,
      snap: Infinity,
    };
    state.car.y = 0.9;
    state.car.rolling = false;
    expect(ridesOver(state.car, stone)).toBe(true);
    state.car.rolling = true;
    expect(ridesOver(state.car, stone)).toBe(false);
  });

  it("a roll STRIPS the car — the glass, the mirrors, the panels it lands on", () => {
    // A rolled car is not a car with a dented flank. Every contact of the
    // roll is the ground meeting sheet metal with nothing sprung under it,
    // and the car that stops rolling has lost its glass and is folded on
    // whichever faces it came down on.
    //
    // THE ENTRY HAS TO BE A HALF-TURN ONE, and that is the whole reason it
    // is not the -16 the trip test uses: -16 is a car that goes over its
    // outside wheels and stops there, on one flank, having put one door and
    // one mirror into the ground. That is a rolled car and it is not a
    // STRIPPED one — its roof was never down. If a change to the roll moves
    // this, re-pick it the same way rather than softening the bar below:
    // sweep the entries and take one that finishes ON ITS ROOF, which is
    // `Math.abs(rollTilt(roll))` near a half turn. -22 was that entry while
    // the ground under a crash was steel; once soil learned to give and the
    // cage to hold, it finished on its wheels and -24 is the one on its roof.
    const { state } = landSideways(30, -24);
    expect(onItsWheels(state.car.roll, state.car.pitch)).toBe(false);
    const damage = state.car.damage;
    for (const pane of ["glassF", "glassB", "glassR", "glassL"]) {
      expect(damage.broken, pane).toContain(pane);
    }
    expect(damage.broken).toContain("mirrorL");
    // The shell is folded from ABOVE as well as from the side — the one
    // fold a car cannot get without having been upside down.
    expect(damage.roof).toBeGreaterThan(0);
    expect(Math.max(damage.zones[2], damage.zones[6])).toBeGreaterThan(0);
    // ...and it is a beaten car afterwards, not a scratched one. The bar is
    // a quarter of the shell rather than a third because a roll no longer
    // compounds its damage across contacts the body never made: the
    // chattering steps around every corner handover used to be booked as
    // arrivals, and a roll paid for a dozen of them.
    expect(damage.wear).toBeGreaterThan(0.25);
  });

  it("...but a hard landing on the WHEELS is still a landing, not a roll", () => {
    // The shell's tolerance must not reach a car that came down on its
    // tyres: a jump landed straight off a two-metre lip keeps its glass and
    // its mirrors, whatever the springs had to swallow.
    const state = game();
    driveToLip(state);
    const events = run(state, {}, 3);
    expect(events.some((e) => e.type === "landing")).toBe(true);
    expect(state.car.damage.broken).toEqual([]);
    expect(state.car.damage.roof).toBe(0);
    expect(state.stats.rolls).toBe(0);
  });

  it("...and a car the roll leaves off its wheels goes back to the last board", () => {
    // Nobody drives away from a car lying on its roof, so the run does not
    // wait to find out: it lies there for `roll.lieFor` and the crew are put
    // back at the split board behind them. This is also the whole of the
    // rule for the FIELD — every rival is stepped through the same code.
    // A COMMITTED ENTRY, re-picked the way the stripping test above says to:
    // sweep the entries and take one that finishes off its wheels, from a run
    // of neighbours that all do. -16 was that once; with the roll's ledger
    // settled it carries further and comes back down on its tyres, which is a
    // fine thing for a car to do and no use for testing what happens to one
    // that does not.
    const { state } = landSideways(30, -18);
    expect(state.overturned).not.toBeNull();
    const respawns = state.stats.respawns;
    // Nothing moves while it lies there...
    const lying = { ...state.car };
    run(state, {}, TUNING.air.roll.lieFor * 0.5);
    expect(state.car.x).toBeCloseTo(lying.x, 5);
    expect(state.car.roll).toBeCloseTo(lying.roll, 5);
    expect(state.stats.respawns).toBe(respawns);
    // ...and then the run picks up again, on its wheels, on the road.
    run(state, {}, TUNING.air.roll.lieFor);
    expect(state.stats.respawns).toBe(respawns + 1);
    expect(state.overturned).toBeNull();
    expect(state.car.rolling).toBe(false);
    expect(onItsWheels(state.car.roll, state.car.pitch)).toBe(true);
  });

  it("...and the run reads WHICH WAY UP off the box, not off the roll angle", () => {
    // With a free pitch axis the attitude is the COMPOSITION of the two
    // angles, and half the ways a car ends up off its wheels do not show in
    // the roll at all. Reading the roll alone got both of these wrong, and
    // in opposite directions: a car on its roof was left there for the rest
    // of the run because the run never noticed, and a car sitting on its
    // tyres was teleported to a split board for facing the wrong way.
    //
    // Stood rather than driven to: what is under test is the READING, and a
    // crash that happens to finish at one of these attitudes is not a thing
    // a test can arrange.
    const stand = (roll: number, pitch: number) => {
      const state = game();
      state.terrain.obstaclesNear = () => [];
      state.terrain.treesNear = () => [];
      const car = state.car;
      car.x += Math.cos(car.heading) * 60;
      car.z -= Math.sin(car.heading) * 60;
      car.y = state.terrain.groundAt(car.x, car.z);
      car.rolling = true;
      car.roll = roll;
      car.pitch = pitch;
      car.rollRate = 0;
      car.pitchRate = 0;
      car.airborne = false;
      car.vy = 0;
      car.u = 0.2;
      car.w = 0;
      updateSlip(car);
      const respawns = state.stats.respawns;
      run(state, {}, TUNING.air.roll.lieFor * 4);
      return state.stats.respawns > respawns;
    };
    const half = Math.PI;
    // On its roof the plain way, and on its roof the way the roll angle
    // cannot see — half a turn of PITCH, no roll at all. Both are cars
    // nobody drives away from.
    expect(stand(half, 0)).toBe(true);
    expect(stand(0, half)).toBe(true);
    // ...and half a turn of BOTH is a car sitting squarely on its tyres,
    // facing backwards. It drives on.
    expect(stand(half, half)).toBe(false);
  });

  it("a car up on two wheels is a car somebody is DRIVING", () => {
    // Past `air.leanFree` the body stops being held by its springs and
    // becomes a rigid body pivoting on its outer contact line, turned by
    // gravity down the rollover's own surface plus the lateral force the
    // tyres are making on the lever of the weight's height (`leanTorque`).
    // Nothing about that is scripted — which is exactly why it has to be
    // measured rather than assumed.
    const upOnTwo = (lean: number, steer: number | null, seconds: number) => {
      const state = game();
      state.terrain.obstaclesNear = () => [];
      state.terrain.treesNear = () => [];
      const car = state.car;
      for (let i = 0; i < TUNING.physicsHz * 4; i += 1) {
        car.u = 22;
        step(state, { ...NEUTRAL_INPUT, throttle: 0.6 });
      }
      car.u = 22;
      car.roll = lean;
      car.rollRate = 0;
      updateSlip(car);
      // A PLAYER, not a controller running at the physics rate: the lean and
      // its rate are read and a decision is held for a tenth of a second,
      // which is about what a person manages. A balance only a 120 Hz loop
      // can hold is not a balance anybody gets to play with.
      const every = Math.round(0.1 * TUNING.physicsHz);
      let held = 0;
      let hand = 0;
      let over = false;
      for (let i = 0; i < TUNING.physicsHz * seconds; i += 1) {
        if (i % every === 0) {
          hand = steer ?? clamp(-2.5 * (car.roll - lean + 0.25 * car.rollRate), -1, 1);
        }
        step(state, { ...NEUTRAL_INPUT, throttle: 0.5, steer: hand });
        if (car.rolling) {
          over = true;
          break;
        }
        if (Math.abs(car.roll) < TUNING.air.leanFree) break;
        held += TUNING.dt;
      }
      return { held, over };
    };
    // HELD. A driver working at a human rate keeps the car up on its two
    // wheels for seconds rather than tenths — the balance is playable.
    expect(upOnTwo(0.8, null, 8).held).toBeGreaterThan(2);
    // ...and the authority is the STEERING'S SIGN and nothing else. Positive
    // roll is the right side up, so the car is standing on its left wheels:
    // steering right, AWAY from the side it is standing on, holds it there
    // and past a point takes it over; steering left, INTO that side, puts it
    // back down on all four. Same body, same speed, opposite hand.
    const away = upOnTwo(0.8, 1, 4);
    const into = upOnTwo(0.8, -1, 4);
    expect(away.over).toBe(true);
    expect(into.over).toBe(false);
    expect(into.held).toBeLessThan(away.held + 0.2);
    // The band has a FLOOR as well as a ceiling, and neither was chosen. Not
    // far past `leanFree` the weight is still well inboard of the contact
    // line and gravity simply wins: the car comes back down on four wheels
    // inside a third of a second whatever the driver does.
    expect(upOnTwo(0.55, null, 4).held).toBeLessThan(0.35);
  });

  it("THE BUDGET: a crash runs energy DOWN, and no axis of it may be driven", () => {
    // A crash is one store of energy — what the car is travelling with, what
    // it is turning with, and how high its weight still is — and everything
    // in the model may only take from it. The one exception is the flight's
    // turbulence, which is bounded and is exactly the tolerance below.
    //
    // This is the invariant every rotational fault the module has had turned
    // out to break, and none of them errored: they read as numbers that
    // wanted tuning. The ground's spin torque was written with the sign that
    // turns the contact patch FURTHER into the slide that made it, which is
    // anti-damping by construction and wound a car merely lying on its roof
    // from a third of a rad/s up to nearly seven.
    const mass = massSpread(carById("classic"));
    /** Stand a car on ground laid flat — no terrain to convert against — set
     * it going, and report what the ledger did. */
    const stand = (set: (car: GameState["car"]) => void, seconds: number) => {
      const state = game();
      state.terrain.obstaclesNear = () => [];
      state.terrain.treesNear = () => [];
      const car = state.car;
      car.x += Math.cos(car.heading) * 60;
      car.z -= Math.sin(car.heading) * 60;
      const flat = state.terrain.groundAt(car.x, car.z);
      state.terrain.groundAt = () => flat;
      car.y = flat;
      car.rolling = true;
      car.airborne = false;
      car.vy = 0;
      car.roll = 0;
      car.pitch = 0;
      car.rollRate = 0;
      car.pitchRate = 0;
      car.yawRate = 0;
      car.u = 0;
      car.w = 0;
      // THE DATUM: the same car, here, at rest. `crashEnergy` counts the
      // weight's height above the world's zero, so on ground sixteen metres
      // up a car standing perfectly still already reads 273 J/kg — and a
      // crash "running its budget down to a tenth" then means whatever the
      // altitude happens to be. What is under test is the energy the car
      // brought, so the altitude is subtracted from both ends.
      const atRest = crashEnergy(car, mass);
      set(car);
      updateSlip(car);
      const into = crashEnergy(car, mass);
      let peakYaw = Math.abs(car.yawRate);
      let peakRoll = Math.abs(car.rollRate);
      for (let i = 0; i < TUNING.physicsHz * seconds; i += 1) {
        step(state, { ...NEUTRAL_INPUT });
        peakYaw = Math.max(peakYaw, Math.abs(car.yawRate));
        peakRoll = Math.max(peakRoll, Math.abs(car.rollRate));
      }
      return {
        into: into - atRest,
        outOf: crashEnergy(car, mass) - atRest,
        peakYaw,
        peakRoll,
        car,
      };
    };
    // A PURE SPIN AND NOTHING ELSE. A body lying on a face with a rotation
    // and no travel at all has only one thing acting on it, and friction is
    // a thing that removes energy: the spin must go DOWN from the first step
    // and reach nothing. It may never exceed what it started with — an axis
    // the ground torques but does not read the slip of is a pump, and this
    // is the cheapest possible way to catch one.
    for (const face of [Math.PI, Math.PI / 2]) {
      const spun = stand((car) => {
        car.roll = face;
        car.yawRate = 3;
      }, 3);
      expect(spun.peakYaw).toBeLessThanOrEqual(3.0001);
      expect(Math.abs(spun.car.yawRate)).toBeLessThan(0.2);
      expect(spun.outOf).toBeLessThan(spun.into);
    }
    // ...and the same of the plane the body goes OVER in.
    const rolled = stand((car) => {
      car.roll = Math.PI;
      car.rollRate = 2;
    }, 3);
    expect(rolled.peakRoll).toBeLessThanOrEqual(2.0001);
    // A WHOLE CRASH runs the budget down and keeps it down: a car that goes
    // over at 90 km/h comes to rest with a small fraction of what it had.
    // Read against the datum, so this is the crash's own energy and not the
    // height of the hill it happened on — measured the other way it passed
    // for years because the car ended on its ROOF and was respawned onto a
    // road sixteen metres lower, which is not a fact about the budget at all.
    const crash = stand((car) => {
      car.roll = 0.9;
      car.rollRate = -6;
      car.u = 26;
      car.w = -10;
    }, 8);
    expect(crash.outOf).toBeLessThan(crash.into * 0.1);
  });

  it("a lean the body cannot carry over its own corner is not a roll", () => {
    // The trip is not a threshold on the roll rate: it is that roll weighed
    // against the lift up to the sill corner. Handed a rate under what the
    // climb costs, the springs take the lurch back and the car drives on —
    // and handed one over it, the same car goes. Nothing in between is a
    // decision anybody wrote down.
    // Weighed against THIS CAR's own mass distribution — the inertia a roll
    // rate is worth is the car's, not a constant.
    const mass = massSpread(carById("classic"));
    const climb = TUNING.air.gravity * 0.4;
    const under = Math.sqrt((2 * climb * 0.6) / mass.over.roll);
    const over = Math.sqrt((2 * climb * 2) / mass.over.roll);
    expect(goesOver(0, under, mass)).toBe(false);
    expect(goesOver(0, over, mass)).toBe(true);
    // ...and a body ALREADY halfway up the climb goes over on far less,
    // because most of the lift is behind it. That is the whole reason the
    // same landing is survivable at one attitude and not at another.
    expect(goesOver(WHEEL_BASIN * 0.9, under, mass)).toBe(true);
    // A body settling back INTO the face beside it is not going over, at
    // any rate at all: there is no corner between it and where it is going.
    expect(goesOver(-0.005, 1e-4, mass)).toBe(false);
  });

  it("a hop over a brow is not a landing: no skitter, no speed lost, no jump booked", () => {
    // A car carried over a brow the arcade gravity would have held it on
    // lifts off its wheels for a few tenths and comes back down; that is
    // the car bobbing, and it costs the driver nothing a landing costs.
    const state = createGame({
      seed: 3,
      carId: "classic",
      skipCountdown: true,
      track: compileTrack(3, [{ kind: "straight", length: 9000, feature: "none" }]),
    });
    const car = state.car;
    car.x += 200;
    car.heading = Math.PI / 2;
    // A 30° climb rounding off into flat over forty metres: 11 m/s² of pull
    // at 100 km/h, under gravity here and over the hold.
    const from = car.x + 20;
    const grade = 0.577;
    const round = 40;
    const hill = (x: number): number => {
      const s = x - from;
      if (s <= 0) return 0;
      if (s <= 80 - round / 2) return grade * s;
      if (s < 80 + round / 2) {
        const t = (s - (80 - round / 2)) / round;
        return grade * (80 - round / 2) + grade * round * (t - (t * t) / 2);
      }
      return grade * 80;
    };
    state.terrain = {
      ...state.terrain,
      heightAt: hill,
      groundAt: hill,
      waterAt: () => null,
      obstaclesNear: () => [],
      treesNear: () => [],
    };
    car.y = hill(car.x);
    car.u = 28;
    let hopped = 0;
    let lifted = 0;
    const events: GameEvent[] = [];
    for (let i = 0; i < TUNING.physicsHz * 4; i++) {
      events.push(...step(state, { ...NEUTRAL_INPUT, throttle: 0.55 }));
      if (car.airborne) hopped += TUNING.dt;
      lifted = Math.max(lifted, car.loft);
    }
    expect(lifted).toBeGreaterThan(0.1); // the body came up off the wheels...
    expect(hopped).toBeGreaterThan(0.2); // ...and then off the ground
    expect(events.some((e) => e.type === "takeoff")).toBe(false);
    expect(state.stats.jumps).toBe(0);
    expect(state.stats.airTime).toBe(0);
    expect(car.settle).toBe(0);
    expect(car.u).toBeGreaterThan(27);
  });
});

describe("over the edge", () => {
  /** A car standing off the road on a flat table that falls away to nothing
   * past `edgeZ` — a cliff lip, a mountain top, the end of a shelf. The
   * road is a long way off; what the car is riding is the terrain. */
  function onATable(edgeZ: number): GameState {
    const state = createGame({
      seed: 4,
      carId: "classic",
      skipCountdown: true,
      track: compileTrack(4, [{ kind: "straight", length: 900, feature: "none" }]),
    });
    const heightAt = (_x: number, z: number): number => (z > edgeZ ? -40 : 0);
    state.terrain = {
      ...state.terrain,
      heightAt,
      groundAt: heightAt,
      waterAt: () => null,
      obstaclesNear: () => [],
      treesNear: () => [],
    };
    state.car.x = 90; // well off the road, out on the terrain
    state.car.y = 0;
    return state;
  }

  /** Drive off the edge and report what happened at the moment of leaving:
   * whether the car flew at all, and how fast it was spinning when it did. */
  function overTheEdge(slip: number): { flew: boolean; spin: number } {
    const state = onATable(40);
    const car = state.car;
    const speed = 30;
    // The same 30 m/s across the ground either way — the difference is only
    // how much of it the car is POINTING at.
    car.heading = slip;
    car.u = speed * Math.cos(slip);
    car.w = -speed * Math.sin(slip);
    car.z = 36; // right at the lip: the slide is still on when it goes over
    let guard = 0;
    while (!car.airborne && car.z < 60 && guard < TUNING.physicsHz * 5) {
      step(state, NEUTRAL_INPUT);
      guard += 1;
    }
    return { flew: car.airborne, spin: Math.abs(car.yawRate) };
  }

  it("a car that goes over sideways flies — and spins on its way down", () => {
    // Straight and level has always flown. The point of the gate being on
    // the speed the car COVERS GROUND at is that a drift does too: at full
    // lock most of the pace is across the nose, and reading the nose alone
    // glued the car to the face of the cliff.
    const straight = overTheEdge(0);
    const sideways = overTheEdge(1); // ~57° of slip: properly crossed up
    expect(straight.flew).toBe(true);
    expect(sideways.flew).toBe(true);
    // The tires were holding that slide; nothing is holding it now.
    // Straight and level leaves the lip with no rotation at all; sideways
    // leaves it turning, and keeps turning all the way down.
    expect(straight.spin).toBeLessThan(0.05);
    expect(sideways.spin).toBeGreaterThan(1);
  });

  it("a car creeping off an edge falls — dropped, not thrown, and never glued to the face", () => {
    // Under the crest speed there is no pace to throw the car with, and
    // there is no face to drive down either: the body has its own weight,
    // and once the wheels have nothing under them it goes over the edge at
    // the speed it had. That is a DROP — the car is airborne and falling,
    // but nothing about it is a jump: no takeoff, nothing booked.
    const state = onATable(40);
    const car = state.car;
    car.z = 36;
    car.u = TUNING.air.crestSpeed - 4;
    const events: GameEvent[] = [];
    let guard = 0;
    while (!car.airborne && guard < TUNING.physicsHz * 3) {
      events.push(...step(state, NEUTRAL_INPUT));
      guard += 1;
    }
    expect(car.airborne).toBe(true);
    // It went over — once its front wheels had nothing under them — and it
    // was not thrown early, or upward.
    expect(car.z).toBeGreaterThan(40 - TUNING.collision.halfLength - 0.5);
    expect(car.vy).toBeLessThan(1);
    expect(events.some((e) => e.type === "takeoff")).toBe(false);
    expect(state.stats.jumps).toBe(0);
    run(state, {}, 1);
    expect(car.y).toBeLessThan(-3); // falling
  });
});
