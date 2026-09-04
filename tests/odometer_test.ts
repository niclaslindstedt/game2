// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE ODOMETER — the counter in the middle of the tachometer
// (pwa/src/game/odometer.ts), and the engine's own metre count under it.
//
// Tested rather than looked at because the claims are about the whole of a
// car's life, and a screenshot only ever shows one moment of one car's:
//
//   * it steps every hundred metres and never between — the tick is what
//     makes it read as a counter, and a drum that crept would be a number;
//   * the drums CARRY the way a mechanical counter carries: the tens sit
//     still through nine kilometres and go over with the units on the last
//     tenth of the tenth, which is the whole look of the thing;
//   * the roll only ever goes one way, so the strip the HUD slides never
//     has to travel backwards;
//   * a run banks its metres ONCE, a fresh run starts again at zero without
//     the counter losing what came before it, and a held trip — a menu's
//     demo, the autopilot — banks nothing at all;
//   * the engine measures GROUND covered, so a stage driven backwards and a
//     spin both cost the car distance that `progressS` never sees.
//
// The storage half is exercised over a stand-in for localStorage: the
// module reaches for it by name, and the point of the guards is that a
// counter still counts where there is nothing to keep it in.

import { describe, expect, it } from "vitest";

import { NEUTRAL_INPUT, compileTrack, createGame, skipIntro, step, type CarInput } from "@engine";

import {
  ODO_DIGITS,
  TRIP_TICK_M,
  createTrip,
  loadOdometer,
  odometerDrums,
  saveOdometer,
} from "../pwa/src/game/odometer.ts";

/** The window, read as a person reads it: the digit each drum is showing,
 * the tenths drum last. */
function face(metres: number): string {
  return odometerDrums(metres)
    .map((drum) => drum.digit)
    .join("");
}

/** A drum by its place: 0 is the tenths, 1 the kilometres, 2 the tens. */
function drum(metres: number, place: number) {
  const drums = odometerDrums(metres);
  return drums[drums.length - 1 - place];
}

function fakeStorage(): Record<string, string> {
  const store: Record<string, string> = {};
  const stub = {
    getItem: (key: string) => (key in store ? store[key] : null),
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
  };
  (globalThis as { localStorage?: unknown }).localStorage = stub;
  return store;
}

describe("the odometer's drums", () => {
  it("shows a car that has never been driven as a full window of zeros", () => {
    expect(face(0)).toBe("0".repeat(ODO_DIGITS));
    expect(face(-1)).toBe("0".repeat(ODO_DIGITS));
    expect(face(Number.NaN)).toBe("0".repeat(ODO_DIGITS));
    for (const d of odometerDrums(0)) expect(d.roll).toBe(0);
  });

  it("counts kilometres and tenths, with the leading zeros a counter is read with", () => {
    expect(face(1_000)).toBe("00010");
    expect(face(42_300)).toBe("00423");
    expect(face(9_999_900)).toBe("99999");
  });

  it("rolls over at the top of the window, the way the real thing does", () => {
    expect(face(10_000_000)).toBe("00000");
  });

  it("steps the tenths drum a whole figure every hundred metres, and never between", () => {
    for (let tick = 0; tick < 10; tick++) {
      const at = tick * TRIP_TICK_M;
      expect(drum(at, 0).digit).toBe(tick);
      // Anywhere inside the hundred metres reads exactly as its start did:
      // the counter TICKS, and a drum that answered every metre would be a
      // number pretending to be a drum.
      expect(face(at + 99)).toBe(face(at));
      // …and the tenths drum itself never sits part way round: it is the
      // one at the end of the train, so nothing drags it over.
      expect(drum(at + 50, 0).roll).toBe(0);
    }
    expect(face(1_000)).not.toBe(face(900));
  });

  it("drags the kilometre drum over through the last hundred metres", () => {
    // Nine tenths of the kilometre with the drum standing still…
    for (const m of [1_000, 1_400, 1_899]) expect(drum(m, 1).roll).toBe(0);
    expect(drum(1_000, 1).digit).toBe(1);
    // …then it turns, continuously, while the tenths drum shows its 9.
    expect(drum(1_900, 1).roll).toBe(0);
    expect(drum(1_950, 1).roll).toBeCloseTo(0.5, 6);
    expect(drum(1_990, 1).roll).toBeCloseTo(0.9, 6);
    expect(drum(2_000, 1)).toEqual({ digit: 2, roll: 0 });
    // The turn only ever goes one way inside a figure.
    let last = -1;
    for (let m = 1_900; m < 2_000; m += 10) {
      const roll = drum(m, 1).roll;
      expect(roll).toBeGreaterThan(last);
      last = roll;
    }
  });

  it("holds the drums above the kilometres still until their own carry", () => {
    for (const km of [0, 1, 5, 8, 8.9]) expect(drum(km * 1_000, 2).roll).toBe(0);
    expect(drum(9_000, 2).roll).toBe(0);
    expect(drum(9_500, 2).roll).toBeCloseTo(0.5, 6);
    expect(drum(10_000, 2)).toEqual({ digit: 1, roll: 0 });
    // …and the drum above THAT sits out the whole of it.
    expect(drum(9_900, 3).roll).toBe(0);
  });

  it("carries every drum together at the top of a decade", () => {
    expect(face(99_900)).toBe("00999");
    expect(face(100_000)).toBe("01000");
    for (const d of odometerDrums(100_000)) expect(d.roll).toBe(0);
  });
});

describe("the car's counter", () => {
  it("banks a run's metres once, and keeps them across runs", () => {
    fakeStorage();
    const trip = createTrip("compact");
    expect(trip.total()).toBe(0);
    // The first look is a baseline: a run already part-driven when the
    // counter opened is not distance this car owes.
    expect(trip.look(250)).toBe(0);
    expect(trip.look(400)).toBe(150);
    expect(trip.look(400)).toBe(150);
    // A fresh run starts again at zero metres and adds to what is there.
    expect(trip.look(0)).toBe(150);
    expect(trip.look(90)).toBe(240);
  });

  it("counts nothing for the stretch a held trip was not being driven", () => {
    fakeStorage();
    const trip = createTrip("compact");
    trip.look(0);
    trip.look(500);
    trip.hold();
    // The bot drove a kilometre behind the menu cards…
    expect(trip.look(1_500)).toBe(500);
    // …and the player's own metres go on from there.
    expect(trip.look(1_700)).toBe(700);
  });

  it("writes on the tick, and reads back what it wrote", () => {
    const store = fakeStorage();
    const trip = createTrip("compact");
    trip.look(0);
    trip.look(60);
    // Nothing yet: the drum has not stepped, so there is nothing new to keep.
    expect(Object.keys(store)).toHaveLength(0);
    trip.look(140);
    expect(Object.keys(store)).toHaveLength(1);
    expect(loadOdometer("compact")).toBe(140);
    // A second car is a second life.
    expect(loadOdometer("hatch")).toBe(0);
    trip.look(190);
    trip.flush();
    expect(loadOdometer("compact")).toBe(190);
  });

  it("trusts nothing a stored key claims", () => {
    fakeStorage();
    saveOdometer("compact", 12_345);
    expect(loadOdometer("compact")).toBe(12_345);
    for (const junk of ["", "  ", "nonsense", "-5", "NaN", "Infinity"]) {
      (globalThis as { localStorage: Storage }).localStorage.setItem("sf.odometer.compact", junk);
      expect(loadOdometer("compact")).toBe(0);
    }
  });

  it("still counts where there is nowhere to keep it", () => {
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: () => {
        throw new Error("private mode");
      },
      setItem: () => {
        throw new Error("quota");
      },
    };
    const trip = createTrip("compact");
    trip.look(0);
    expect(trip.look(1_500)).toBe(1_500);
    expect(() => trip.flush()).not.toThrow();
  });
});

describe("the metres under it", () => {
  it("counts the ground the car covers, not the stage it gets up", () => {
    const track = compileTrack(21, [
      { kind: "straight", length: 400, feature: "none" },
      { kind: "turn", length: 200, radius: 60, dir: 1, feature: "none" },
      { kind: "straight", length: 400, feature: "none" },
    ]);
    const state = createGame({ seed: 21, carId: "compact", track });
    skipIntro(state);
    const gas: CarInput = { ...NEUTRAL_INPUT, throttle: 1 };
    for (let i = 0; i < 900; i++) step(state, gas);
    expect(state.stats.distance).toBeGreaterThan(0);
    // Every metre of it is ground the body actually moved over, so a car
    // driven straight up a road reads what the road says it got up (within
    // the sample the progress score is quantized to).
    expect(state.stats.distance).toBeGreaterThan(state.progressS - 5);
    // …and a car driven from a standstill for a known time cannot have
    // covered more than its own top speed would allow in it.
    expect(state.stats.distance).toBeLessThan(state.raceTime * 100);
  });

  it("costs a car the ground it covers going nowhere", () => {
    const track = compileTrack(22, [{ kind: "straight", length: 600, feature: "none" }]);
    const state = createGame({ seed: 22, carId: "compact", track });
    skipIntro(state);
    // Away up the road…
    for (let i = 0; i < 600; i++) step(state, { ...NEUTRAL_INPUT, throttle: 1 });
    const there = state.stats.distance;
    const got = state.progressS;
    // …and then round and round on full lock, which is a lot of driving and
    // hardly any stage. The counter is a reading about the CAR: it charges
    // for every metre of it, where progress barely moves.
    for (let i = 0; i < 600; i++) step(state, { ...NEUTRAL_INPUT, throttle: 1, steer: 1 });
    expect(state.stats.distance - there).toBeGreaterThan(3 * (state.progressS - got));
  });

  it("starts every run at nothing", () => {
    const track = compileTrack(23, [{ kind: "straight", length: 300, feature: "none" }]);
    const state = createGame({ seed: 23, carId: "compact", track });
    expect(state.stats.distance).toBe(0);
  });
});
