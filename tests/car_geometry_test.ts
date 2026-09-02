// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The seam between the car the engine COLLIDES and the car the app DRAWS.
//
// One collision box in TUNING.collision serves every car in the catalog,
// and it only works if it contains the largest shell: a body poking out of
// its collider is a car that visibly passes through trunks before anything
// happens, which reads as the whole contact model being broken. Nothing
// else checks that, because the two numbers live in different layers — so
// this test reaches across into pwa/. It can, because the specs and the
// geometry probes are pure data and pure arithmetic: no three.js, no DOM.

import { describe, expect, it } from "vitest";

import { CARS, SOLID_PROP_HEIGHT, TUNING } from "@engine";

import { bodyHalfLength, bodyHalfWidth } from "../pwa/src/game/car/shell.ts";
import { CAR_BODIES, bodySpecFor } from "../pwa/src/game/car-styles.ts";

const bodies = Object.entries(CAR_BODIES);

function axlesOf(spec: (typeof CAR_BODIES)[string]): number[] {
  const shift = spec.axleShift ?? 0;
  return [spec.wheelbase / 2 + shift, -spec.wheelbase / 2 + shift];
}

describe("the drawn cars against the collision box", () => {
  it.each(bodies)("%s fits inside TUNING.collision", (_id, spec) => {
    expect(bodyHalfLength(spec)).toBeLessThanOrEqual(TUNING.collision.halfLength);
    expect(bodyHalfWidth(spec, axlesOf(spec))).toBeLessThanOrEqual(TUNING.collision.halfWidth);
  });

  it("the box is not wastefully bigger than the largest car either", () => {
    // A box far larger than every shell scrapes on thin air. Half a metre
    // of slack in length or a fifth of one across is the point at which
    // the early contact would start to be visible.
    const longest = Math.max(...bodies.map(([, spec]) => bodyHalfLength(spec)));
    const widest = Math.max(...bodies.map(([, spec]) => bodyHalfWidth(spec, axlesOf(spec))));
    expect(TUNING.collision.halfLength - longest).toBeLessThan(0.5);
    expect(TUNING.collision.halfWidth - widest).toBeLessThan(0.2);
  });
});

describe("the solid bar against the hoods it was written from", () => {
  it("SOLID_PROP_HEIGHT is the middle of the lowest hood", () => {
    // The engine plants a prop as a solid when it stands over the middle
    // of the bonnet, and scatters it as drive-over litter when it does
    // not. That bar is a number in mapgen with no compile-time link to the
    // cars — this is the link. The hood is the profile's FRONT station:
    // the flat the driver looks over, ahead of the cowl.
    const hoods = bodies.map(([, spec]) => spec.profile[0].topY);
    const lowest = Math.min(...hoods);
    expect(SOLID_PROP_HEIGHT).toBeGreaterThan(lowest * 0.45);
    expect(SOLID_PROP_HEIGHT).toBeLessThan(lowest * 0.6);
  });

  it("the ride-over bar sits over the placement bar and under the lowest hood", () => {
    // Of what the field stands up, the shortest are mounted by the wheels
    // rather than hit by the body (`collision.rideOver`). That bar has to
    // clear the placement bar, or nothing is ever ridden over, and stay
    // under the hood, or a stone the bonnet plainly meets is driven through.
    const lowest = Math.min(...bodies.map(([, spec]) => spec.profile[0].topY));
    expect(TUNING.collision.rideOver).toBeGreaterThan(SOLID_PROP_HEIGHT);
    expect(TUNING.collision.rideOver).toBeLessThan(lowest * 0.75);
  });
});

describe("the springs against the wheel arches", () => {
  // The renderer draws the whole sprung mass at `car.ride` on a chassis group
  // and leaves the wheels on the ground (car-mesh.ts), so the suspension's
  // travel is a BODYWORK measurement: past the gap between the arch and the
  // tire the shell is visibly sliding off its own wheels, which is what "the
  // suspension is broken" looks like from the chase cam. The engine number
  // and the arch that has to hide it live in different layers, so nothing but
  // this holds them together.
  // A body with no arch opening runs its flank straight down to the floor
  // with the wheels bolted outside it, so what stops the drop there is the
  // sill reaching the ground rather than the tire reaching the arch.
  const archGap = (spec: (typeof CAR_BODIES)[string]): number =>
    spec.arches ? spec.arches.radius - spec.wheelRadius : spec.floorY;

  it.each(bodies)("%s can hide the springs' whole travel", (_id, spec) => {
    expect(TUNING.suspension.heaveMax).toBeLessThanOrEqual(archGap(spec) + 0.02);
  });

  it("the bump stops and the hard limit sit inside that gap, in order", () => {
    const tightest = Math.min(...bodies.map(([, spec]) => archGap(spec)));
    const S = TUNING.suspension;
    // Compression before the stops, then droop, then the hard limit — each
    // inside the next, and all of them inside the tightest arch on the
    // roster. A hard limit the arches cannot cover is not a limit at all.
    expect(S.travel).toBeLessThan(S.heaveMax);
    expect(S.droop).toBeLessThan(S.heaveMax);
    expect(S.heaveMax).toBeLessThanOrEqual(tightest + 0.02);
  });
});

describe("the catalog and the body specs", () => {
  it("every car in the catalog has a body of its own", () => {
    for (const car of CARS) expect(CAR_BODIES[car.id]).toBeDefined();
  });

  it("an unknown car still gets a body, recolored in its own livery", () => {
    const body = bodySpecFor({ ...CARS[0], id: "nope", color: 0x123456, accent: 0x654321 });
    expect(body.colors.paint).toBe(0x123456);
    expect(body.colors.accent).toBe(0x654321);
  });

  it("cars stay roughly real-sized — the camera and the road are tuned for it", () => {
    for (const [, spec] of bodies) {
      const length = spec.profile[0].z - spec.profile[spec.profile.length - 1].z;
      expect(length).toBeGreaterThan(3.5);
      expect(length).toBeLessThan(4.8);
      expect(spec.cabin.roofY).toBeLessThan(1.5);
      expect(bodyHalfWidth(spec, axlesOf(spec)) * 2).toBeLessThan(1.95);
    }
  });
});
