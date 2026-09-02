// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The jump, moment by moment: the lip throws the car, the air is committed
// (gravity plus barely any nose authority), and the landing pays or punishes
// depending on how straight you touch down. Synthetic one-jump stage.
import { describe, expect, it } from "vitest";

import {
  NEUTRAL_INPUT,
  TUNING,
  compileTrack,
  createGame,
  step,
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
    // ...and let the landing finish happening.
    run(state, {}, 3);
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
    // well past `tripSlide`: the tyres bite, the body goes over its outside
    // wheels, and what comes to rest is a car that has rolled — on its
    // wheels again, the ground having righted it, at a fraction of the
    // speed and with the flank it came down on folded.
    const { state } = landSideways(28, -16);
    expect(state.stats.rolls).toBe(1);
    expect(state.car.rolling).toBe(false);
    expect(state.car.airborne).toBe(false);
    const roll = state.car.roll;
    expect(Math.abs(roll)).toBeGreaterThan(Math.PI / 2); // it went right over
    const tilt = roll - Math.round(roll / (Math.PI * 2)) * Math.PI * 2;
    expect(Math.abs(tilt)).toBeLessThan(0.2); // ...and back onto its wheels
    expect(Math.hypot(state.car.u, state.car.w)).toBeLessThan(15);
    const zones = state.car.damage.zones;
    expect(Math.max(zones[2], zones[6])).toBeGreaterThan(0);
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
