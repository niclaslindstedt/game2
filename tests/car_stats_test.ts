// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The pre-race card's spec sheet. It is DERIVED from the catalog, so what
// is worth asserting is not the numbers themselves — those move whenever a
// car is retuned — but that the sheet keeps telling the truth about the
// roster it is drawn from: every bar filled, the best car on each axis on
// top, and the roster's own character (the rear-driver that wants to be
// sideways, the four-wheel-drive that puts its power down anywhere) coming
// out of the maths rather than out of prose nobody checks.

import { describe, expect, it } from "vitest";

import { CARS, TUNING, carById, gearedSpec, type GearboxMode } from "@engine";

import {
  carBars,
  carFacts,
  manualGain,
  sprintTime,
  topSpeedKph,
} from "../pwa/src/game/car-stats.ts";

/** Where one car sits on one axis, through one box. */
function bar(carId: string, key: string, gearbox: GearboxMode = "auto"): number {
  const found = carBars(carById(carId), gearbox).find((b) => b.key === key);
  if (!found) throw new Error(`no bar: ${key}`);
  return found.value;
}

/** Which car tops an axis — asked of one box, since every car is being read
 * through the same one and the ORDER is what is being checked. */
function best(key: string): string {
  return CARS.map((spec) => ({ id: spec.id, value: bar(spec.id, key) })).sort(
    (a, b) => b.value - a.value,
  )[0].id;
}

describe("car spec sheet", () => {
  it("bills every car on every axis, and nobody at zero", () => {
    for (const spec of CARS) {
      const bars = carBars(spec, "auto");
      expect(bars.length).toBeGreaterThan(0);
      for (const entry of bars) {
        expect(entry.value).toBeGreaterThan(0);
        expect(entry.value).toBeLessThanOrEqual(1);
      }
      // Every axis is drawn once: two bars keyed the same would silently
      // overwrite each other in the rendered list.
      expect(new Set(bars.map((b) => b.key)).size).toBe(bars.length);
      // The figures are NUMBERS, not rendered strings — the card counts to
      // them when the transmission moves, and a counter cannot interpolate
      // "223 KM/H".
      for (const fact of carFacts(spec, "auto")) {
        expect(Number.isFinite(fact.value), fact.key).toBe(true);
        expect(fact.value).toBeGreaterThan(0);
        expect(fact.unit.length).toBeGreaterThan(0);
      }
    }
  });

  it("keeps the card short enough to leave the car the room", () => {
    // The whole redesign, as a list. A sheet that grows an axis at a time is
    // how the last one reached eight, and every one of them was spent out of
    // the space the car stands in — so the shape is asserted rather than
    // remembered. Down the road first, then round the corner.
    expect(carBars(CARS[0], "auto").map((b) => b.key)).toEqual(["accel", "top", "grip", "drift"]);
    expect(carFacts(CARS[0], "auto").map((f) => f.key)).toEqual(["top", "sprint"]);
  });

  it("fills the roster's best car on an axis, and never empties its worst", () => {
    // The scale spans both boxes, so the full bar belongs to whichever one
    // the axis is worth something in — and the floor to the other.
    for (const key of carBars(CARS[0], "auto").map((b) => b.key)) {
      const values = CARS.flatMap((spec) =>
        (["auto", "manual"] as GearboxMode[]).map((box) => bar(spec.id, key, box)),
      );
      expect(Math.max(...values)).toBeCloseTo(1, 6);
      expect(Math.min(...values)).toBeCloseTo(0.3, 6);
    }
  });

  it("reads the roster's character off the catalog", () => {
    // THE REAR-DRIVER IS THE DRIFT CAR. It is the one layout whose slide
    // develops fully on the wheel alone (TUNING.drivetrain.rwd.depth is the
    // 1 every other knob in the drift is calibrated against), and the card
    // has to say so — a DRIFTING bar that put the hatch or the coupe on top
    // would be billing the roster backwards.
    expect(best("drift")).toBe("classic");
    expect(bar("classic", "drift")).toBeCloseTo(1, 6);
    for (const spec of CARS) {
      if (spec.drive === "rwd") continue;
      expect(bar(spec.id, "drift"), spec.id).toBeLessThan(bar("classic", "drift"));
    }
    // ...and the front-driver, which washes wide instead of coming round,
    // is the one at the floor.
    expect(bar("compact", "drift")).toBeCloseTo(0.3, 6);
    // The four-wheel-drive holds on best — balanced rubber, and the
    // traction to put what it has down on any of it — and it is the fast
    // one, which is the trade the roster is built around.
    expect(best("grip")).toBe("coupe");
    expect(best("top")).toBe("coupe");
  });

  it("quotes a top speed and a sprint that match the gearbox", () => {
    for (const spec of CARS) {
      expect(topSpeedKph(spec, "auto")).toBeCloseTo(spec.gearTop[spec.gearTop.length - 1] * 3.6, 6);
      // First gear alone covers a fraction of 100 km/h, so the figure has
      // to come out of several gears and land in the seconds a road car
      // takes rather than in first gear's own time.
      const first = spec.gearTop[0] / spec.gearAccel[0];
      expect(sprintTime(spec, "auto")).toBeGreaterThan(first);
      expect(sprintTime(spec, "auto")).toBeLessThan(10);
      // A target inside the first gear never reaches the second, and never
      // charges for a shift that was not taken.
      expect(sprintTime(spec, "auto", spec.gearTop[0])).toBeCloseTo(first, 6);
      expect(
        sprintTime(spec, "manual", spec.gearTop[0] * TUNING.gearbox.set.manual.gearing),
      ).toBeCloseTo(
        (first / TUNING.gearbox.set.manual.power) * TUNING.gearbox.set.manual.gearing,
        6,
      );
    }
  });

  it("moves the card's figures when the transmission moves", () => {
    for (const spec of CARS) {
      const auto = Object.fromEntries(carFacts(spec, "auto").map((f) => [f.key, f.value]));
      const manual = Object.fromEntries(carFacts(spec, "manual").map((f) => [f.key, f.value]));
      // The whole point of the choice, and the reason the two figures on
      // the card are printed as big as they are: the taller set is billed
      // as speed, where the player is looking when they press MANUAL.
      expect(topSpeedKph(spec, "manual")).toBeGreaterThan(topSpeedKph(spec, "auto") * 1.05);
      expect(manual.top).toBeGreaterThan(auto.top);
      // Far enough apart to be worth counting to: a figure that rolls
      // through a value nobody can see move is an animation, not a readout.
      expect(Math.round(manual.top) - Math.round(auto.top)).toBeGreaterThan(1);
      // The sprint is charged for every shift the driver has to take, so
      // the manual's paper 0-100 is never the free lunch the ratios alone
      // would make it.
      const shifts = spec.gearTop.filter(
        (top) => top * TUNING.gearbox.set.manual.gearing < 100 / 3.6,
      ).length;
      expect(shifts).toBeGreaterThan(0);
      const free = sprintTime(spec, "manual") - shifts * TUNING.gearbox.shiftCut;
      expect(free).toBeLessThan(sprintTime(spec, "manual"));
    }
  });

  it("moves the bars the racing set is worth something in, and only those", () => {
    for (const spec of CARS) {
      // The box the player is choosing above the sheet has to be visible IN
      // the sheet, not only in the figures: the two move together, over the
      // same beat, which is what makes the press read as one change.
      expect(bar(spec.id, "top", "manual")).toBeGreaterThan(bar(spec.id, "top", "auto"));
      // And it is a trade, drawn as one — the shifts the driver now has to
      // take are charged to the sprint.
      expect(bar(spec.id, "accel", "manual")).toBeLessThan(bar(spec.id, "accel", "auto"));
      // A box is ratios and losses. It cannot fit a car different tires or
      // drive a different axle, so grip and drift have to come out of fields
      // `gearedSpec` never touches — a bar that moved with the gearbox there
      // would be the card inventing a consequence the physics does not have.
      for (const key of ["grip", "drift"]) {
        expect(bar(spec.id, key, "manual"), key).toBe(bar(spec.id, key, "auto"));
        const geared = carBars(gearedSpec(spec, "manual"), "auto").find((b) => b.key === key);
        expect(geared?.value, key).toBe(bar(spec.id, key, "auto"));
      }
    }
  });

  it("quotes the racing set's headline off the tuning", () => {
    // The transmission's two boxes print what taking one buys. The figure
    // comes out of TUNING rather than out of a sentence, so a retune of the
    // ratios cannot leave the card claiming a percentage nobody gets.
    expect(manualGain()).toBe(
      Math.round((TUNING.gearbox.set.manual.gearing / TUNING.gearbox.set.auto.gearing - 1) * 100),
    );
    expect(manualGain()).toBeGreaterThan(0);
  });

  it("gives every car a line of billing", () => {
    for (const spec of CARS) {
      expect(spec.blurb.length).toBeGreaterThan(10);
      expect(spec.blurb).not.toBe(spec.name);
    }
  });
});
