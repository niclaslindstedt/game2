// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHERE A CAR CARRIES ITS WEIGHT, and what that does to it once it is over.
//
// The box is one box for the whole catalog; the weight in it is each car's
// own — how high it rides (`CarSpec.centreHeight`) and how far ahead of the
// wheelbase's middle it sits (`balance`), plus the cage the database's road
// cars never carried. Every arm the crash works on is measured from there,
// so a tall nose-heavy hatch and a low even coupe are different bodies the
// moment they leave their wheels. These hold that to what it must be.
import { describe, expect, it } from "vitest";

import {
  CARS,
  REFERENCE,
  TUNING,
  WHEEL_BASIN,
  carById,
  goesOver,
  goesOverEnd,
  massSpread,
  standingOn,
  seatOn,
  type MassSource,
} from "@engine";

const B = TUNING.collision;
const S = TUNING.air.roll.spread;

const hatch = carById("compact");
const coupe = carById("coupe");
const classic = carById("classic");

/** The smallest roll rate at which a body stood at the wheel basin goes
 * over its sill corner, rad/s — the trip it takes to put THIS car over. */
function tipsAt(spec: MassSource): number {
  const mass = massSpread(spec);
  let lo = 0;
  let hi = 20;
  for (let i = 0; i < 40; i += 1) {
    const mid = (lo + hi) / 2;
    if (goesOver(WHEEL_BASIN, mid, mass)) hi = mid;
    else lo = mid;
  }
  return hi;
}

/** ...and the same over an END, from the wheels: over the nose (`dir` −1,
 * a positive pitch lifts the nose in the hull's own frame) or the tail. */
function endsAt(spec: MassSource, dir: number): number {
  const mass = massSpread(spec);
  let lo = 0;
  let hi = 30;
  for (let i = 0; i < 40; i += 1) {
    const mid = (lo + hi) / 2;
    if (goesOverEnd(0, dir * mid, mass)) hi = mid;
    else lo = mid;
  }
  return hi;
}

describe("where the weight sits", () => {
  it("is each car's own, and read once per car", () => {
    for (const car of CARS) {
      const mass = massSpread(car);
      expect(mass.weight.up).toBe(car.centreHeight);
      expect(mass.weight.along).toBeCloseTo((car.balance - 0.5) * 2 * B.halfBase, 9);
      expect(massSpread(car)).toBe(mass);
    }
    expect(massSpread(hatch)).not.toBe(massSpread(coupe));
    // A spec that says nothing about placement gets the box's reference.
    const bare = massSpread({ mass: 1200 });
    expect(bare.weight).toEqual(REFERENCE);
  });

  it("carries the cage the road cars in the database never had", () => {
    const road = S.rollSlope + S.rollBase / classic.mass;
    const mass = massSpread(classic);
    expect(mass.spin.roll).toBeGreaterThan(road);
    expect(mass.spin.roll).toBeCloseTo(road + (S.cage.mass * S.cage.roll ** 2) / classic.mass, 9);
    // A few per cent, all of it resisting the turn — never a different car.
    expect(mass.spin.roll / road).toBeLessThan(1.08);
    expect(mass.spin.pitch / (S.pitchSlope + S.pitchBase / classic.mass)).toBeLessThan(1.08);
  });

  it("puts a tall car over its sill corner on less than a low one", () => {
    // The climb from the wheels to the sill corner is shorter the higher the
    // weight starts: the hatch tips where the coupe lurches and comes back.
    expect(hatch.centreHeight).toBeGreaterThan(coupe.centreHeight);
    expect(tipsAt(hatch)).toBeLessThan(tipsAt(coupe));
    // ...and it is the HEIGHT doing it, not the mass: the same hatch carried
    // at the coupe's height needs more.
    expect(tipsAt({ ...hatch, centreHeight: coupe.centreHeight })).toBeGreaterThan(tipsAt(hatch));
  });

  it("goes over its nose more readily than its tail when the engine is in front", () => {
    // A nose-heavy car's nose corner is the nearer arm and its tail corner
    // the further one; an even car has the two the same.
    const even = { ...classic, balance: 0.5 };
    expect(endsAt(even, 1)).toBeCloseTo(endsAt(even, -1), 6);
    expect(hatch.balance).toBeGreaterThan(0.5);
    expect(endsAt(hatch, -1)).toBeLessThan(endsAt(hatch, 1));
  });

  it("stands the patch behind the weight of a nose-heavy car", () => {
    // On its wheels the contact is the four tyres, whose middle is the
    // wheelbase's middle — so a weight carried forward has its patch BEHIND
    // it, which is the arm the ground's friction spins the car about.
    const mass = massSpread(hatch);
    const patch = standingOn(0, 0, undefined, mass.weight);
    expect(patch.along).toBeCloseTo(-mass.weight.along, 9);
    expect(patch.along).toBeLessThan(0);
    expect(standingOn(0, 0).along).toBeCloseTo(0, 9);
    // ...and the weight's height over the patch is the car's own.
    expect(patch.height).toBeCloseTo(hatch.centreHeight, 9);
    expect(seatOn(0, 0, undefined, mass.weight)).toBeCloseTo(hatch.centreHeight, 9);
  });

  it("does not move the line between four wheels and two", () => {
    // Whether the TYRES are the lowest points of the box is the box's own
    // question and no weight can change it; the basin is one basin.
    for (const car of CARS) {
      const mass = massSpread(car);
      expect(standingOn(WHEEL_BASIN - 0.01, 0, undefined, mass.weight).sprung).toBe(true);
      expect(standingOn(WHEEL_BASIN + 0.01, 0, undefined, mass.weight).sprung).toBe(false);
    }
  });
});
