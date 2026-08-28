// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The pre-race card's spec sheet. It is DERIVED from the catalog, so what
// is worth asserting is not the numbers themselves — those move whenever a
// car is retuned — but that the sheet keeps telling the truth about the
// roster it is drawn from: every bar filled, the best car on each axis on
// top, and the roster's own character (the grippy hatch on tarmac, the
// rear-driver that wants to be sideways) coming out of the maths rather
// than out of prose nobody checks.

import { describe, expect, it } from "vitest";

import { CARS, TUNING, carById } from "@engine";

import { carBars, carFacts, sprintTime, topSpeedKph } from "../pwa/src/game/car-stats.ts";

/** Where one car sits on one axis. */
function bar(carId: string, key: string): number {
  const found = carBars(carById(carId)).find((b) => b.key === key);
  if (!found) throw new Error(`no bar: ${key}`);
  return found.value;
}

/** Which car tops an axis. */
function best(key: string): string {
  return CARS.map((spec) => ({ id: spec.id, value: bar(spec.id, key) })).sort(
    (a, b) => b.value - a.value,
  )[0].id;
}

describe("car spec sheet", () => {
  it("bills every car on every axis, and nobody at zero", () => {
    for (const spec of CARS) {
      const bars = carBars(spec);
      expect(bars.length).toBeGreaterThan(0);
      for (const entry of bars) {
        expect(entry.value).toBeGreaterThan(0);
        expect(entry.value).toBeLessThanOrEqual(1);
      }
      // Every axis is drawn once: two bars keyed the same would silently
      // overwrite each other in the rendered list.
      expect(new Set(bars.map((b) => b.key)).size).toBe(bars.length);
      expect(carFacts(spec, "auto").every((fact) => fact.value.length > 0)).toBe(true);
    }
  });

  it("fills the roster's best car on an axis, and never empties its worst", () => {
    for (const key of carBars(CARS[0]).map((b) => b.key)) {
      const values = CARS.map((spec) => bar(spec.id, key));
      expect(Math.max(...values)).toBeCloseTo(1, 6);
      expect(Math.min(...values)).toBeGreaterThanOrEqual(0.3);
    }
  });

  it("reads the roster's character off the catalog", () => {
    // The hatch is the tarmac car and the pointiest; the rear-driver is the
    // one that lives sideways and the one that hooks up on gravel; the
    // four-wheel-drive is the fast one that puts its power down anywhere.
    expect(best("sealed")).toBe("compact");
    expect(best("turn")).toBe("compact");
    expect(best("loose")).toBe("classic");
    expect(best("slide")).toBe("classic");
    expect(best("top")).toBe("coupe");
    expect(best("traction")).toBe("coupe");
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
      // The whole point of the choice: the taller set is billed as speed.
      expect(topSpeedKph(spec, "manual")).toBeGreaterThan(topSpeedKph(spec, "auto") * 1.05);
      expect(manual.top).not.toBe(auto.top);
      // What the box does not change stays put — a card that moved the
      // kerb weight when the driver picked a gearbox would be lying.
      expect(manual.mass).toBe(auto.mass);
      expect(manual.gears).toBe(auto.gears);
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

  it("gives every car a line of billing", () => {
    for (const spec of CARS) {
      expect(spec.blurb.length).toBeGreaterThan(10);
      expect(spec.blurb).not.toBe(spec.name);
    }
  });
});
