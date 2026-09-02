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
  state.car.u = speed;
  state.car.w = 0;
  state.progressIndex = 60;
  // `lift` is how far the body came up off its wheels: the body carried on
  // up while the road turned down under it, the wheels reaching after the
  // ground. `flew` is the wheels leaving it altogether — and a car in the
  // air has no weight on its tyres at all.
  let flew = false;
  let lightest = 1;
  let lift = 0;
  for (let i = 0; i < Math.round(2 / TUNING.dt); i++) {
    step(state, { ...NEUTRAL_INPUT, throttle: 0 });
    lift = Math.max(lift, state.car.loft);
    if (state.car.airborne) {
      flew = true;
      lightest = 0;
    } else {
      lightest = Math.min(lightest, tyreLoad(state.car));
    }
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
    const gravel = crossRoad(10, 14);
    const sealed = crossRoad(10, 14, { surface: "asphalt", lift: 0.2 });
    expect(gravel.lift).toBeLessThan(TUNING.air.loft);
    expect(sealed.lift).toBeGreaterThan(TUNING.air.loft);
    expect(sealed.lift).toBeGreaterThan(gravel.lift * 1.3);
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
