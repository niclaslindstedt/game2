// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT THE GROUND DOES TO A CAR THAT IS GOING OVER.
//
// The ground used to be able to do exactly one thing to a crash: take SPEED
// out of it. Friction dragged at the travel, the pivot exchange shaved the
// rotation, and every accident then ran out along the plane it started in —
// a barrel roll stayed a barrel roll, an end-over-end stayed an end-over-end,
// and which corner of the car happened to land first changed nothing about
// where the crash was going. Nothing in the module carried anything from one
// axis to another, so the thing a rollover is famous for — the change of hand
// halfway through, when a corner digs in and the car goes somewhere else —
// could not happen at all.
//
// What it was missing is the reaction. The ground stops the corner; the rest
// of the body does not stop; and the impulse that arrested it acted an arm's
// length from the weight, so it TURNS the car. That is Newton's third law
// and it is the whole of why which part lands matters.
//
// These tests hold it to what it must be and to what it must never be: it has
// to reach the plane the body was NOT turning in, it has to answer to the arm
// it acts on rather than to a constant, it has to saturate as the shell folds
// instead of resolving a ten-metre-a-second arrival through a corner in one
// step — and it may not, ever, make the crash's ledger go up.
import { describe, expect, it } from "vitest";

import {
  NEUTRAL_INPUT,
  TUNING,
  compileTrack,
  bedNormal,
  crashEnergy,
  crashTurbulence,
  createGame,
  createRng,
  massSpread,
  seatOn,
  standingOn,
  step,
  updateSlip,
  type GameState,
  type SegmentPlan,
} from "@engine";

const STAGE: SegmentPlan[] = [{ kind: "straight", length: 900, feature: "none" }];

/** A BODY DROPPED ONTO THE GROUND WHILE GOING OVER, at an attitude the caller
 * chooses and with nothing standing anywhere near it.
 *
 * `roll` and `pitch` are the attitude it arrives at, which is the whole
 * experiment: the reaction's arms are read off the box at that attitude, so
 * two drops that differ only in the pitch differ only in which corner of the
 * car meets the ground first. */
function drop({
  roll = 0,
  pitch = 0,
  rollRate = 0,
  pitchRate = 0,
  height = 9,
  u = 0,
}: {
  roll?: number;
  pitch?: number;
  rollRate?: number;
  pitchRate?: number;
  height?: number;
  u?: number;
}): GameState {
  const state = createGame({
    seed: 0,
    carId: "classic",
    skipCountdown: true,
    track: compileTrack(0, STAGE),
  });
  // A crash measured with scenery in it is a measurement of the scenery: one
  // trunk costs the body twenty metres a second in a single step.
  state.terrain.obstaclesNear = () => [];
  state.terrain.treesNear = () => [];
  // ...and with TURBULENCE in it is a measurement of the turbulence. The arms
  // under test are tenths of a metre, and a second of falling is enough
  // turbulence to tilt the body a couple of degrees off the attitude it was
  // dropped at — which is its own arm, several times the one being measured.
  // A flight draws the same knocks every other flight does; this one is a
  // bench, and the bench holds the body still.
  state.rng.next = () => 0.5;
  const car = state.car;
  // OFF THE ROAD, ONTO DEAD FLAT GROUND. On the ribbon the plane under the
  // car is the road's, camber and all, so "on its side" is a couple of
  // degrees off the flank however carefully it is staged — and the reaction
  // answers that tilt rather than the attitude the test asked for.
  const cosH = Math.cos(car.heading);
  const sinH = Math.sin(car.heading);
  car.x += cosH * 45;
  car.z -= sinH * 45;
  const level = state.terrain.groundAt(car.x, car.z);
  state.terrain.groundAt = () => level;
  car.rolling = true;
  car.airborne = true;
  car.planted = false;
  car.roll = roll;
  car.pitch = pitch;
  car.rollRate = rollRate;
  car.pitchRate = pitchRate;
  car.y = level + height;
  car.vy = 0;
  car.u = u;
  car.w = 0;
  updateSlip(car);
  return state;
}

/** ...and let it fall until the ground has it. What comes back is the state
 * one step after the first contact, which is the arrival and nothing that
 * happened afterwards. */
function untilItLands(state: GameState): GameState {
  for (let i = 0; i < TUNING.physicsHz * 3; i += 1) {
    const flying = state.car.airborne;
    step(state, { ...NEUTRAL_INPUT });
    if (flying && !state.car.airborne) return state;
  }
  throw new Error("the body never reached the ground");
}

const QUARTER = Math.PI / 2;

describe("the ground, arriving at a body that is going over", () => {
  it("turns the car by the arm the corner it landed on actually has", () => {
    // SQUARE ON ITS WHEELS: the patch is under the weight, there is no arm,
    // and a fall straight down has nothing to turn the body about. This is
    // the control, and it is the one attitude the reaction must do NOTHING
    // at — to a part in a thousand, because it is exact geometry and not a
    // near miss.
    const flat = untilItLands(drop({}));
    expect(Math.abs(flat.car.pitchRate)).toBeLessThan(1e-3);
    expect(Math.abs(flat.car.rollRate)).toBeLessThan(1e-3);

    // ...AND THE SAME FALL ON A CORNER. Pitch the body a third of the way
    // over its nose and the wheels it was going to land on become a corner
    // with a metre and a half of car behind it: the same descent, the same
    // everything except which part of the car reaches the ground first — and
    // the body is pitched hard by an arrival that did nothing at all before.
    const nosed = untilItLands(drop({ pitch: 0.5 }));
    expect(Math.abs(nosed.car.pitchRate)).toBeGreaterThan(0.5);
    // ...in the plane the arm is in, and NOT in the other one: a fall onto a
    // corner offset along the car is a pitch and nothing else, which is the
    // difference between a reaction and a fudge.
    expect(Math.abs(nosed.car.rollRate)).toBeLessThan(1e-3);
  });

  it("reaches the plane the body was NOT turning in", () => {
    // THE CHANGE OF HAND — the thing a rollover is famous for and the thing
    // this module could not do. A body rolling and nothing else, dropped so
    // that a corner catches: the roll is the only rotation it has, and it
    // comes out of the contact turning end over end as well. Nothing else in
    // the module can do this. The pivot exchange works in one plane by
    // construction, and the friction needs travel to work with — this body
    // has none.
    const rolling = untilItLands(drop({ roll: QUARTER, pitch: 0.5, rollRate: 3 }));
    expect(Math.abs(rolling.car.pitchRate)).toBeGreaterThan(0.3);
    // ...and it is the CORNER that does it, not merely being off-square: the
    // same roll landing with nothing pitched picks up no pitch whatever.
    const square = untilItLands(drop({ roll: QUARTER, rollRate: 3 }));
    expect(Math.abs(square.car.pitchRate)).toBeLessThan(1e-3);
  });

  it("saturates as the shell folds, instead of resolving the whole arrival", () => {
    // A panel is not a billiard ball: it collapses at a roughly fixed force,
    // so what reaches the body flattens off however hard the corner came down
    // (`air.roll.foldSpeed`). Without this a car thrown off a lip at eight
    // rad/s had a ten-metre-a-second arrival resolved through the arm of the
    // corner it caught and came out at 0.8 — one turn, from an accident that
    // runs to two and a half. A rollover is not a stop.
    const gentle = untilItLands(drop({ pitch: 0.5, height: 2 }));
    const violent = untilItLands(drop({ pitch: 0.5, height: 20 }));
    const gentleTurn = Math.abs(gentle.car.pitchRate);
    const violentTurn = Math.abs(violent.car.pitchRate);
    // Ten times the height is over three times the arrival, and nowhere near
    // three times the turn.
    expect(violentTurn).toBeGreaterThan(gentleTurn);
    expect(violentTurn).toBeLessThan(gentleTurn * 1.5);
  });

  it("never puts energy into the crash", () => {
    // THE INVARIANT the whole module is built on. A rollover is one budget
    // being run down; gravity hands the car energy as the weight falls and
    // everything else may only ever take. The reaction is a term that ADDS
    // rotation, which is exactly the shape every fault this module has had
    // took — so it is the one that has to be held to the ledger hardest.
    //
    // Read per STEP. An average over a crash hides a single term making
    // motion out of nothing behind three seconds of honest friction.
    const state = drop({ roll: QUARTER, pitch: 0.5, rollRate: 4, pitchRate: 1, u: 14 });
    // ...and this one wants its turbulence back: the ledger has to hold with
    // the only term that puts energy in actually running.
    state.rng.next = createRng(7).next;
    const spread = massSpread(state.spec.mass);
    let had = crashEnergy(state.car, spread);
    for (let i = 0; i < TUNING.physicsHz * 3; i += 1) {
      const allowed = crashTurbulence(state.car, spread);
      const wasAirborne = state.car.airborne;
      step(state, { ...NEUTRAL_INPUT });
      const now = crashEnergy(state.car, spread);
      // The steps a CONTACT happens on are the ones under test: a body in
      // free flight is gravity trading height for speed and back, which the
      // ledger holds exactly, and the grind between contacts is friction.
      if (wasAirborne && !state.car.airborne) expect(now - had).toBeLessThan(allowed);
      had = now;
      if (!state.car.rolling) break;
    }
  });
});

// ── WHAT THE BODY IS STANDING ON ──────────────────────────────────────────
//
// A body going over turns about the corner of itself that is on the ground,
// and which corner that is changes several times a turn. Two things are read
// off it every step and they do not behave alike:
//
//   the ARM — how far the weight is above the patch — is the weight's own
//   height over the plane, and no hand-over can move it: the box does not
//   get taller because a different corner is holding it up. It is continuous
//   by construction, which is the whole reason `seatSlopes` can be a central
//   difference of it and gravity, the seat's own speed and a contact's
//   reaction can all be resolved along one statement of the geometry;
//
//   the OFFSET — where the patch is in the ground plane, which is the arm
//   the friction SPINS the body about — is read off the lowest point, and it
//   switches. Measured over a turn it steps by most of a track width, four
//   times per turn. That is a known fault and it is not fixed here; what is
//   pinned below is the half that is sound, so that a change which quietly
//   makes the ARM step too is caught by something.
//
// And WHICH is down is a third question again: four points near the plane is
// not a face if they lie in a LINE.
describe("the pivot the crash is read off", () => {
  /** The most a reading moves between two attitudes a tenth of a degree
   * apart, walked round a whole turn. A smooth quantity moves at its own
   * gradient; one that switches shows the whole step. */
  const walked = (bed: ReturnType<typeof bedNormal>, pitch: number) => {
    const step = Math.PI / 1800;
    let was = standingOn(0, pitch, bed);
    let most = 0;
    for (let tilt = step; tilt <= Math.PI * 2; tilt += step) {
      const now = standingOn(tilt, pitch, bed);
      most = Math.max(most, Math.abs(now.height - was.height));
      was = now;
    }
    return most;
  };

  it("carries its ARM through every hand-over without a step in it", () => {
    // A tenth of a degree of body roll cannot move the weight more than a
    // few millimetres, on any ground and at any pitch. Measured, it moves
    // 1.6 mm — its own gradient — where the patch offset beside it moves
    // 0.88 m across the same hand-over.
    for (const bed of [bedNormal(), bedNormal(0.3, 0.1), bedNormal(-0.45, 0.2)])
      for (const pitch of [0, 0.2, 0.6, Math.PI / 2])
        expect(walked(bed, pitch)).toBeLessThan(0.005);
  });

  it("...and the arm IS the weight's height over the plane", () => {
    // Not a separate measurement of the same geometry — the lowest point of
    // the box is on the plane by construction, so the weight's height above
    // the patch and its height above the plane are one number. Anything that
    // makes these two disagree has given the module a second account of
    // which way a body falls.
    for (const [tilt, pitch] of [
      [0, 0],
      [0.7, 0.2],
      [Math.PI / 2, 0],
      [Math.PI, 0.6],
      [4.2, -0.3],
    ])
      expect(standingOn(tilt, pitch, bedNormal(0.3, 0.1)).height).toBeCloseTo(
        seatOn(tilt, pitch, bedNormal(0.3, 0.1)),
        9,
      );
  });

  it("knows a FACE from an EDGE", () => {
    // Four points near the plane is not enough on its own. A car up on one
    // side has four — two wheels and the two sill corners over them — lying
    // in a line two metres long and a hand's breadth wide, and counting
    // alone called that a car lying flat on a face. Both ends of that were
    // wrong: the settle handed back a car balanced on its edge as one that
    // had come to rest, and the run then booked it overturned and took the
    // crew to the last board for an attitude the roll had just called
    // upright.
    for (const deg of [45, 51, 57, 60]) {
      const edge = standingOn((deg * Math.PI) / 180, 0);
      expect(edge.flat).toBe(false);
      // ...and it is an edge precisely because it reaches one way only.
      expect(Math.min(edge.spanAcross, edge.spanAlong)).toBeLessThan(0.2);
      expect(Math.max(edge.spanAcross, edge.spanAlong)).toBeGreaterThan(1);
    }
    // The faces themselves are unmoved: wheels, either flank, the roof.
    for (const deg of [0, 90, 180, 270])
      expect(standingOn((deg * Math.PI) / 180, 0).flat).toBe(true);
  });
});
