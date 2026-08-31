// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE SHAPE OF THE GROUND UNDER THE CAR, and what it costs.
//
// A road is curved both ways: along the stage it brows and dips, across it
// there is a crown, R19's bank, and the ground beside it leaning away. Which
// of those a car meets is decided by where it is GOING, not by where it is
// pointing — and whichever it is, the answer is one number: the vertical
// acceleration the ground is asking for. Below gravity it takes weight off
// the tires; past `air.crestPull` there is no weight left and the car flies.
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
): { flew: boolean; lightest: number; state: GameState } {
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
  let flew = false;
  let lightest = 1;
  for (let i = 0; i < Math.round(2 / TUNING.dt); i++) {
    for (const e of step(state, { ...NEUTRAL_INPUT, throttle: 0 })) {
      if (e.type === "takeoff") flew = true;
    }
    if (!state.car.airborne) lightest = Math.min(lightest, tyreLoad(state.car));
  }
  return { flew, lightest, state };
}

describe("the road as a shape, taken from the side", () => {
  it("takes weight off the tires, and more of it the faster the crossing", () => {
    const slow = crossRoad(10, 15).lightest;
    const quick = crossRoad(10, 25).lightest;
    const fast = crossRoad(10, 30).lightest;
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

  it("...and past enough speed there is no weight left and the car flies", () => {
    // A narrow road is a sharper hump than a wide one: R16's crown is a
    // half-width parabola, so the same 17 cm of camber is bent into a
    // tighter radius the less road there is to spread it over. Same speed,
    // same 17 cm, and only the narrow one throws the car.
    expect(crossRoad(6, 20).flew).toBe(false);
    expect(crossRoad(6, 25).flew).toBe(true);
    expect(crossRoad(16, 25).flew).toBe(false);
  });

  it("a sealed road is built UP, and its edge throws a car sooner", () => {
    // R16's asphalt stands `asphaltLift` proud of the ground beside it and
    // falls away over a short chamfer, where a gravel road of the same width
    // simply runs out into its shoulder. Same width, same speed, and only
    // one of them lets go.
    expect(crossRoad(10, 33).flew).toBe(false);
    expect(crossRoad(10, 33, { surface: "asphalt", lift: 0.2 }).flew).toBe(true);
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
