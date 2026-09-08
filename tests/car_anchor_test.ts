// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHERE A THING BOLTED TO THE CAR IS (pwa/src/game/car-anchor.ts) — the
// arithmetic every effect that leaves the car from a fixed place on it is
// placed with: the exhaust off each tailpipe, the steam off the engine bay.
//
// It is app code, and it is tested here for `crash-throw.ts`'s reason: the
// module touches neither three.js nor the DOM, and the interesting claim —
// that a car on its ROOF smokes out of a pipe that is now over its own
// upturned floor rather than out of the air a car's height above it — is
// exactly the kind a screenshot of an accident in progress cannot measure.

import { describe, expect, it } from "vitest";

import { bodyOffset, type BodyPoint, type WorldVec } from "../pwa/src/game/car-anchor.ts";
import { PIPE_AXIS, pipeAnchors } from "../pwa/src/game/car/shell.ts";
import { CLASSIC_BODY } from "../pwa/src/game/car-styles.ts";

const UPSIDE_DOWN = Math.PI;
const QUARTER = Math.PI / 2;

function at(point: BodyPoint, heading: number, roll = 0, pitch = 0): WorldVec {
  return bodyOffset(point, heading, roll, pitch, { x: 0, y: 0, z: 0 });
}

function length(v: WorldVec): number {
  return Math.hypot(v.x, v.y, v.z);
}

describe("a point on a car that is the right way up", () => {
  // The heading-only arithmetic the renderer used to inline, and the one
  // case the fix must not move: everything on a level car has to stay
  // exactly where it already was, or the change is a retune of every plume
  // on the stage rather than a fix to the one that is wrong.
  const headings = [0, 0.7, -1.9, 2.6, Math.PI];
  const point: BodyPoint = { along: -2.06, across: -0.44, up: 0.23 };

  it.each(headings)("sits where its heading alone puts it (heading %s)", (h) => {
    const world = at(point, h);
    // Forward is (sin h, cos h) and right is (cos h, -sin h) — the world
    // axes the whole renderer is written in.
    expect(world.x).toBeCloseTo(Math.sin(h) * point.along + Math.cos(h) * point.across, 12);
    expect(world.z).toBeCloseTo(Math.cos(h) * point.along - Math.sin(h) * point.across, 12);
    expect(world.y).toBeCloseTo(point.up, 12);
  });

  it("puts the nose ahead and the right-hand side to the right, facing north", () => {
    expect(at({ along: 1, across: 0, up: 0 }, 0)).toMatchObject({ x: 0, y: 0, z: 1 });
    const right = at({ along: 0, across: 1, up: 0 }, 0);
    expect(right.x).toBeCloseTo(1, 12);
    expect(right.z).toBeCloseTo(0, 12);
  });
});

describe("a point on a car that is not", () => {
  const pipe: BodyPoint = { along: -2.06, across: -0.44, up: 0.23 };

  it("mirrors sideways and DOWN once the car is on its roof", () => {
    // The origin the car is drawn about is the wheel-contact plane under its
    // middle, and a car that is over is held a hull's height above the
    // ground by its own shell (`rollStand`). So everything that was above
    // that origin is now below it — which is what puts the pipe back near
    // the metal instead of in the air over the wreck.
    const world = at(pipe, 0, UPSIDE_DOWN);
    expect(world.z).toBeCloseTo(pipe.along, 12);
    expect(world.x).toBeCloseTo(-pipe.across, 12);
    expect(world.y).toBeCloseTo(-pipe.up, 12);
  });

  it("turns a height into a sideways reach once the car is on its side", () => {
    // A positive roll stands the car's right side up, so it comes to rest on
    // its LEFT flank and anything slung under the floor now points left.
    const world = at({ along: 0, across: 0, up: 0.23 }, 0, QUARTER);
    expect(world.x).toBeCloseTo(-0.23, 12);
    expect(world.y).toBeCloseTo(0, 12);
  });

  it("lifts the nose when the pitch is nose-up", () => {
    expect(at({ along: 1, across: 0, up: 0 }, 0, 0, 0.3).y).toBeCloseTo(Math.sin(0.3), 12);
    expect(at({ along: -1, across: 0, up: 0 }, 0, 0, 0.3).y).toBeCloseTo(-Math.sin(0.3), 12);
  });

  it("leaves a point on the roll axis alone however far the car is over", () => {
    // The order the renderer composes the car in is heading, then roll, then
    // pitch (`car-mesh.ts`), and rolling about the car's own length is what
    // makes this true. Roll it in the world's axes instead and a car lying
    // on its side would swing its own tail through the ground.
    for (const roll of [0.4, QUARTER, 2.2, UPSIDE_DOWN]) {
      const world = at({ along: -2, across: 0, up: 0 }, 1.1, roll);
      expect(world).toMatchObject(at({ along: -2, across: 0, up: 0 }, 1.1));
    }
  });

  it("is rigid — no attitude stretches or shrinks the car", () => {
    const point: BodyPoint = { along: -1.4, across: 0.6, up: 0.9 };
    const span = length({ x: point.across, y: point.up, z: point.along });
    for (const [h, r, p] of [
      [0, 0, 0],
      [1.2, 0.9, -0.4],
      [-2.7, UPSIDE_DOWN, 0.8],
      [0.3, QUARTER, QUARTER],
    ]) {
      expect(length(at(point, h, r, p))).toBeCloseTo(span, 12);
    }
  });
});

describe("which way a tailpipe is pointing", () => {
  it("is straight back along the car, and stays that way through a barrel roll", () => {
    // A roll turns the car about its own length, so it never moves what the
    // pipe is aimed at — which is why an exhaust on a car that is over still
    // blows its smoke away behind the wreck rather than into it.
    const level = at(PIPE_AXIS, 0.8);
    for (const roll of [0.5, QUARTER, UPSIDE_DOWN]) {
      const over = at(PIPE_AXIS, 0.8, roll);
      expect(over.x).toBeCloseTo(level.x, 12);
      expect(over.z).toBeCloseTo(level.z, 12);
    }
    expect(length(level)).toBeCloseTo(1, 12);
  });

  it("aims at the ground once the car is stood on its tail", () => {
    // An endo does move it, and this is the reason the renderer takes only
    // the horizontal part of the aim: a pipe pointing at the road cannot
    // blow smoke through it, and what is left is nothing, which is right.
    const world = at(PIPE_AXIS, 0, 0, QUARTER);
    expect(world.y).toBeCloseTo(-1, 12);
    expect(Math.hypot(world.x, world.z)).toBeCloseTo(0, 12);
  });
});

describe("a real car's exhaust, once it has come to rest upside down", () => {
  // The report this module was written for: an inverted car trailing its
  // fumes out of thin air beside itself. Both heights are measured from the
  // car's origin, which is the same point either way, so the comparison
  // holds without knowing how high the shell is holding the wreck up.
  const pipe = pipeAnchors(CLASSIC_BODY)[0];
  const floor: BodyPoint = { along: pipe.along, across: pipe.across, up: CLASSIC_BODY.floorY };

  it("comes out of the pipe, which is now standing proud of the upturned floor", () => {
    const mouth = at(pipe, 0, UPSIDE_DOWN);
    const upturned = at(floor, 0, UPSIDE_DOWN);
    // The pipe hangs under the floor on a car the right way up, so inverted
    // it stands above it — by exactly the clearance it hung by.
    expect(mouth.y - upturned.y).toBeCloseTo(CLASSIC_BODY.floorY - pipe.up, 12);
    expect(mouth.y).toBeGreaterThan(upturned.y);
  });

  it("is nowhere near where the heading alone would have put it", () => {
    const mouth = at(pipe, 0, UPSIDE_DOWN);
    // Placed off the heading alone the mouth keeps its upright offsets, so
    // it ends up on the far side of the car and a third of a metre clear
    // over the floor that is now the highest thing on it — the puffs in the
    // report, hanging beside a wreck they never touch.
    const upturned = at(floor, 0, UPSIDE_DOWN);
    expect(pipe.up - upturned.y).toBeCloseTo(pipe.up + CLASSIC_BODY.floorY, 12);
    expect(pipe.up - upturned.y).toBeGreaterThan(0.35);
    expect(Math.abs(pipe.across - mouth.x)).toBeCloseTo(2 * Math.abs(pipe.across), 12);
  });
});
