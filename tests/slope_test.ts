// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE SHAPE OF THE GROUND UNDER THE CAR, and what it costs.
//
// A road is curved both ways: along the stage it brows and dips, across it
// there is a crown, R19's bank, and the ground beside it leaning away. Which
// of those a car meets is decided by where it is GOING, not by where it is
// pointing — and whichever it is, the answer is one number: the vertical
// acceleration the ground is asking for. Below what the ground can hold
// (`air.hold`) it takes weight off the tires; past it the body comes up off
// the wheels (`air.loft`) and, given room, leaves them (`air.leave`).
//
// These are the cases the model used to have nothing to say about: the road
// read only along its own centerline, so a car crossing one was on ground
// that was perfectly flat however fast it crossed, and the verge it drove
// over on the way was a slope whose height the car followed while its
// handling insisted the ground was level.
import { describe, expect, it } from "vitest";

import {
  NEUTRAL_INPUT,
  TUNING,
  compileTrack,
  createGame,
  locate,
  step,
  tyreLoad,
  type GameState,
  type SegmentPlan,
} from "@engine";

const STRAIGHT: SegmentPlan[] = [{ kind: "straight", length: 1500, feature: "none" }];

/** A dead-level straight `width` metres wide. Both widths move together —
 * the track's decides where the road stops, the sample's is what the
 * cross-section is drawn from. */
function road(width: number, extra: Record<string, unknown> = {}) {
  const base = compileTrack(0, STRAIGHT);
  return {
    ...base,
    width,
    samples: base.samples.map((s) => ({ ...s, width, ...extra })),
  };
}

/** Put a car out in the field beside the road at `speed`, aimed straight
 * across it, and drive it over: up the verge, over the crown, out the far
 * side. Returns what the crossing did to it. */
function crossRoad(
  width: number,
  speed: number,
  extra: Record<string, unknown> = {},
): { flew: boolean; lightest: number; lift: number; state: GameState } {
  const track = road(width, extra);
  const state = createGame({ seed: 0, carId: "coupe", skipCountdown: true, track });
  const at = track.samples[60];
  // The sample's right axis is (cos h, -sin h); stand well clear of the
  // corridor and point back along it, at the road.
  const out = width / 2 + 12;
  state.car.x = at.x + Math.cos(at.heading) * out;
  state.car.z = at.z - Math.sin(at.heading) * out;
  state.car.heading = at.heading - Math.PI / 2;
  state.car.y = state.terrain.groundAt(state.car.x, state.car.z);
  state.car.u = speed;
  state.car.w = 0;
  state.progressIndex = 60;
  // `lift` is how far the body came up off its wheels: the body carried on
  // up while the road turned down under it, the wheels reaching after the
  // ground. `flew` is the wheels leaving it altogether — and a car in the
  // air has no weight on its tyres at all.
  //
  // All three read over the CROSSING — the verge, the mat and the verge
  // beyond — and not over the field the car is put down in. The car is
  // created on the mat and set down on a cut bench rising toward the
  // country, with its tail half a metre up the bank: that is a car
  // propped on a face for a step, whose body then sets off down the bank
  // from rest while the wheels do not, and the loft of THAT was the
  // biggest number in the whole run, on every road alike.
  const across = width / 2 + 4;
  let flew = false;
  let lightest = 1;
  let lift = 0;
  for (let i = 0; i < Math.round(2 / TUNING.dt); i++) {
    step(state, { ...NEUTRAL_INPUT, throttle: 0 });
    const car = state.car;
    const lat = (car.x - at.x) * Math.cos(at.heading) - (car.z - at.z) * Math.sin(at.heading);
    // A flight is the crossing's wherever it comes down: a car thrown off
    // the far verge leaves the ground a few metres past it.
    if (car.airborne) {
      flew = true;
      lightest = 0;
    }
    if (Math.abs(lat) > across) continue;
    lift = Math.max(lift, car.loft);
    if (!car.airborne) lightest = Math.min(lightest, tyreLoad(car));
  }
  return { flew, lightest, lift, state };
}

describe("the road as a shape, taken from the side", () => {
  it("takes weight off the tires, and more of it the faster the crossing", () => {
    const slow = crossRoad(10, 8).lightest;
    const quick = crossRoad(10, 12).lightest;
    const fast = crossRoad(10, 14).lightest;
    // A shape and a speed: the same crown holds a car at a crawl and lets go
    // of one at pace.
    expect(slow).toBeLessThan(1);
    expect(quick).toBeLessThan(slow);
    expect(fast).toBeLessThan(quick);
    // ...and it is a real loss, not a rounding error — about a sixth of the
    // tires by the time the car is properly moving, which is the difference
    // between a lock that holds and one that lets go.
    expect(fast).toBeLessThan(0.87);
  });

  it("...and past enough speed there is no weight left and the body comes up off the wheels", () => {
    // The body carried up the near side and over the crown keeps going up
    // while the road turns down under it, and the wheels reach after the
    // ground: past `air.loft` of that the tyres carry nothing at all, and
    // the car is SKIPPING across the road rather than driving over it. A
    // narrow road is a sharper hump than a wide one — R16's crown is a
    // half-width parabola, so the same 17 cm of camber is bent into a
    // tighter radius the less road there is to spread it over — and the
    // same speed lifts the car further off a narrow road than off a wide
    // one. Only a crossing at an absurd pace makes a flight of it.
    const gentle = crossRoad(6, 12);
    expect(gentle.lift).toBeLessThan(TUNING.air.loft);
    expect(gentle.lightest).toBeGreaterThan(TUNING.suspension.loadFloor);
    const narrow = crossRoad(6, 25);
    expect(narrow.lift).toBeGreaterThan(TUNING.air.loft);
    expect(narrow.lightest).toBe(TUNING.suspension.loadFloor);
    expect(narrow.flew).toBe(false);
    expect(crossRoad(16, 25).lift).toBeLessThan(narrow.lift);
    expect(crossRoad(6, 35).flew).toBe(true);
  });

  it("a sealed road is built UP, and its edge lifts a car sooner", () => {
    // R16's asphalt stands `asphaltLift` proud of the ground beside it and
    // falls away over a short chamfer, where a gravel road of the same width
    // simply runs out into its shoulder. Same width, same speed, and the
    // sealed one has the body further off its wheels.
    const sealed = { surface: "asphalt", lift: 0.2 };
    expect(crossRoad(10, 14, sealed).lift).toBeGreaterThan(crossRoad(10, 14).lift * 1.3);
    // ...and SOONER is a speed, not a height: the sealed edge has the tyres
    // off the ground at a pace the gravel one is still holding the car at.
    // Read as a height at one fixed speed, this said nothing for as long as
    // the verge handed the physics a step between its two ground readers —
    // that step lofted every crossing by the same 9 cm whatever the road was
    // made of or how fast it was taken, and the assertion passed on the
    // artifact rather than on the chamfer. (And for as long as the loft was
    // read over the whole run rather than the crossing, it passed on the
    // car being set down on the bank beside the road — see `crossRoad`.)
    // Past the middle twenties the gravel edge's lift stops growing — the
    // body rides the shoulder's whole shape — while the sealed edge's keeps
    // climbing until, at 126 km/h, it throws the car off the far side
    // altogether, where the gravel road still holds it.
    expect(crossRoad(10, 35, sealed).flew).toBe(true);
    expect(crossRoad(10, 35).flew).toBe(false);
  });

  it("but driving ALONG a level road costs the tires nothing at all", () => {
    // The guard on all of the above. A road with no shape in it — `flat`
    // scales R16's whole cross-section out, and the synthetic straight is
    // already level along its length — has to read exactly one, at any
    // speed, or every corner in the game quietly pays for a feature about
    // crossing verges.
    const track = road(10, { flat: 1, bank: 0 });
    const state = createGame({ seed: 0, carId: "coupe", skipCountdown: true, track });
    let lightest = 1;
    for (let i = 0; i < Math.round(8 / TUNING.dt); i++) {
      step(state, { ...NEUTRAL_INPUT, throttle: 1 });
      if (!state.car.airborne) lightest = Math.min(lightest, tyreLoad(state.car));
    }
    expect(state.car.u).toBeGreaterThan(40);
    expect(lightest).toBe(1);
  });
});

describe("the slope beside the road", () => {
  /** A sealed road, where the ground beside the mat has the most to say: it
   * is built up `asphaltLift` proud of its shoulder and drops over a short
   * chamfer, where gravel simply runs out into a bare strip. */
  const SEALED = { surface: "asphalt" as const, lift: 0.2 };

  it("is a slope the car can feel, not just one it is drawn on", () => {
    // Two wheels over the edge is still ON the road (`offTrack.verge`), and
    // for as long as the camber was read off the mat alone — clamped at the
    // edge — the shoulder was a place the car's height followed down while
    // its handling insisted the ground was level.
    const track = road(10, SEALED);
    const s = track.samples[60];
    const half = s.width / 2;
    const at = (lateral: number) =>
      locate(track, s.x + Math.cos(s.heading) * lateral, s.z - Math.sin(s.heading) * lateral, 60);
    const onMat = at(half - 1);
    const overEdge = at(half + 0.2);
    // Still the road, by the only rule that decides it.
    expect(overEdge.offRoad).toBe(false);
    // The mat's own camber is a fraction of a degree; going over its edge is
    // an order of magnitude more, and it falls the way the ground falls.
    expect(Math.abs(overEdge.slopeLat)).toBeGreaterThan(5 * Math.abs(onMat.slopeLat));
    expect(overEdge.slopeLat).toBeLessThan(-0.1);
  });

  it("leans the car standing on it, where the mat holds it level", () => {
    const track = road(10, SEALED);
    const s = track.samples[60];
    const half = s.width / 2;
    const drive = (lateral: number): number => {
      const state = createGame({ seed: 0, carId: "coupe", skipCountdown: true, track });
      const x = s.x + Math.cos(s.heading) * lateral;
      const z = s.z - Math.sin(s.heading) * lateral;
      state.car.x = x;
      state.car.z = z;
      state.car.y = locate(track, x, z, 60).elevation;
      state.car.heading = s.heading;
      state.car.u = 10;
      state.progressIndex = 60;
      for (let i = 0; i < Math.round(1.5 / TUNING.dt); i++) {
        step(state, { ...NEUTRAL_INPUT, throttle: 0 });
      }
      return state.car.roll;
    };
    // Down the middle the road is as near level as makes no difference.
    expect(Math.abs(drive(0))).toBeLessThan(0.02);
    // With the outside wheels over the edge the body sits on the drop — the
    // several degrees of lean a car dropping off a kerb actually takes, and
    // toward the low side.
    expect(drive(half + 0.4)).toBeLessThan(-0.1);
  });
});

// A ROAD STATES ITS SHAPE IN ITS OWN FRAME — the grade down the centerline
// and the camber across it — and the car it is under is under no obligation
// to be pointed either way. Everything that reads the ground reads it on the
// CAR's axes: gravity is resolved along the nose, the body pitches and leans
// onto it, and the wheels' vertical speed is that gradient dotted with the
// car's own velocity. The road's own numbers handed over unturned are the
// identity for a car driving down the stage, which is why the hill only came
// out backwards for a car that had turned round — and then it came out
// exactly backwards: gravity holding a car back down a descent and hurrying
// it up a climb.
describe("a hill is a hill whichever way the car is pointed", () => {
  /** A straight laid at a constant grade — nothing but the climb. */
  function hill(grade: number) {
    const base = compileTrack(0, STRAIGHT);
    return {
      ...base,
      samples: base.samples.map((s) => ({ ...s, elevation: s.s * grade })),
    };
  }

  /** Roll a car along the hill at 20 m/s with nothing on either pedal, and
   * hand back what gravity did to its speed. `back` turns it round, so it
   * drives DOWN a road whose own grade climbs. */
  function coast(grade: number, back: boolean): number {
    const track = hill(grade);
    const state = createGame({ seed: 0, carId: "coupe", skipCountdown: true, track });
    const at = track.samples[200];
    state.car.x = at.x;
    state.car.z = at.z;
    state.car.y = at.elevation;
    state.car.heading = at.heading + (back ? Math.PI : 0);
    state.car.u = 20;
    // Set down already climbing (or descending) at the grade's own rate —
    // a body dropped onto a descent with no vertical speed would first have
    // to fall onto it, and that is a hop, not a coast.
    state.car.vy = state.car.wheelVy = state.car.footVy = (back ? -1 : 1) * 20 * grade;
    state.progressIndex = 200;
    state.nearIndex = 200;
    for (let i = 0; i < Math.round(2 / TUNING.dt); i++) {
      step(state, { ...NEUTRAL_INPUT, throttle: 0 });
    }
    return state.car.u - 20;
  }

  it("costs speed going up and gives it back coming down", () => {
    const level = coast(0, false);
    const up = coast(0.1, false) - level;
    const down = coast(0.1, true) - level;
    // What a 10% grade is worth over two seconds, measured against the same
    // coast on the flat so the drag comes out of both sides.
    const owed = 9.8 * TUNING.hills.gravityAlong * 0.1 * 2;
    expect(up).toBeCloseTo(-owed, 1);
    expect(down).toBeCloseTo(owed, 1);
  });

  it("is dead flat when it is dead flat, whichever way round", () => {
    // Not exactly equal: the wind blows in ONE direction and the two cars
    // are pointed at it differently, which is the whole of the difference.
    expect(coast(0, false)).toBeCloseTo(coast(0, true), 1);
  });
});

// A FLIGHT OVER A HILLSIDE. Out in the wild the ground under one end of a
// four-metre car is nothing like the ground under its middle, and a body in
// the air is at the flight's own attitude rather than the hill's — so this
// is where a car ends up drawn INSIDE the ground it is flying over. Two
// things put it there and both are fixed here: a pitch read against the
// unsigned speed, which pointed the nose down whichever way the car was
// actually travelling, and a landing measured at the point under the middle
// alone, which let an end of the body sink a metre into a hill before the
// middle got there.
describe("a car flying over a hillside", () => {
  /** A hillside that falls away toward +z at `grade`, with one boulder
   * standing on it `ahead` metres in front of the car and `right` metres to
   * its right. Nothing else: no water, no trees. */
  function hillside(state: GameState, grade: number, ahead: number, right: number) {
    const height = (_x: number, z: number): number => 40 - z * grade;
    const rock = {
      x: state.car.x + ahead,
      z: -right,
      y: 0,
      kind: "boulder" as const,
      size: 1,
      spin: 0,
      radius: 0.7,
      height: 1,
      mass: 1400,
      rooted: 1,
      snap: Infinity,
    };
    rock.y = height(rock.x, rock.z);
    state.terrain = {
      ...state.terrain,
      heightAt: height,
      groundAt: height,
      waterAt: () => null,
      obstaclesNear: (x: number, z: number, reach: number) =>
        Math.hypot(rock.x - x, rock.z - z) < reach + 4 ? [rock] : [],
      treesNear: () => [],
    };
    return height;
  }

  /** Put a car well off the stage, pointed along +x, on that hillside. */
  function outThere(grade: number, ahead: number, right: number) {
    const state = createGame({
      seed: 3,
      carId: "compact",
      skipCountdown: true,
      track: compileTrack(3, STRAIGHT),
    });
    state.car.x += 200;
    state.car.z = 0;
    state.car.heading = Math.PI / 2;
    const height = hillside(state, grade, ahead, right);
    state.car.y = height(state.car.x, state.car.z);
    return { state, height };
  }

  /** How deep the deepest corner of the drawn body is under the ground, m —
   * the box the renderer hangs off `car.y` at the attitude the engine hands
   * it, which is what a player sees clipping. */
  function buried(car: GameState["car"], height: (x: number, z: number) => number): number {
    const B = TUNING.collision;
    const sinH = Math.sin(car.heading);
    const cosH = Math.cos(car.heading);
    const cr = Math.cos(car.roll);
    const sr = Math.sin(car.roll);
    const cp = Math.cos(car.pitch);
    const sp = Math.sin(car.pitch);
    let worst = 0;
    for (const lx of [B.halfWidth, -B.halfWidth]) {
      for (const ly of [0, B.roofY]) {
        for (const lz of [B.halfLength, -B.halfLength]) {
          // Rolled about the nose, then pitched about the right axis.
          const across = lx * cr - ly * sr;
          const up = lx * sr + ly * cr;
          const fwd = lz * cp - up * sp;
          const x = car.x + sinH * fwd + cosH * across;
          const z = car.z + cosH * fwd - sinH * across;
          worst = Math.max(worst, height(x, z) - (car.y + up * cp + lz * sp));
        }
      }
    }
    return worst;
  }

  it("pitches the nose UP when it is the tail that is leading", () => {
    // Two cars falling at the same rate over the same flat ground, one
    // travelling forwards and one backwards. The body lies along its arc
    // whichever end is leading, so the two pitches are mirror images — and
    // for as long as the descent was read against `hypot(u, w)`, they were
    // the same number, nose-down, and the backwards one drove its nose into
    // whatever it was falling toward.
    const fly = (u: number): number => {
      const { state } = outThere(0, 400, 0);
      state.car.u = u;
      state.car.y += 6;
      state.car.airborne = true;
      state.car.vy = -6;
      for (let i = 0; i < Math.round(0.4 / TUNING.dt); i++) {
        step(state, NEUTRAL_INPUT);
      }
      return state.car.pitch;
    };
    const ahead = fly(18);
    const astern = fly(-18);
    expect(ahead).toBeLessThan(-0.2);
    expect(astern).toBeGreaterThan(0.2);
    expect(astern).toBeCloseTo(-ahead, 2);
  });

  it("keeps the body out of the hill it is flying over", () => {
    // The report this is written from: a car meets a boulder on a hillside,
    // is knocked into a flight, and is drawn with an end of itself inside
    // the hill for the length of it.
    for (const grade of [0.3, 0.6]) {
      const { state, height } = outThere(grade, 14, 0.9);
      state.car.u = 22;
      let worst = 0;
      for (let i = 0; i < 600; i++) {
        step(state, NEUTRAL_INPUT);
        worst = Math.max(worst, buried(state.car, height));
      }
      // A hand's breadth: the body may touch the ground it is landing on,
      // and the step it lands in has moved before the seat is read again.
      expect(worst).toBeLessThan(0.3);
    }
  });
});
