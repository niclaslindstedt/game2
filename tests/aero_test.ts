// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE AIR A CAR OFF THE GROUND IS FALLING THROUGH — the drag area its
// attitude turns into the airflow, the terminal velocity that area holds a
// fall to, and the two properties the rest of the engine leans on: that the
// drag is a strict LOSS (the crash's ledger holds across it) and that an
// ordinary jump still carries.
import { describe, expect, it } from "vitest";

import {
  CARS,
  TUNING,
  aeroTrim,
  airDrag,
  carById,
  dragArea,
  terminalSpeed,
  travelSpeed,
  type CarSpec,
  type CarState,
} from "@engine";

const T = TUNING;
const A = T.air.aero;
/** The works sedan: the slippery one, with a boot lip and no real wing. */
const SPEC = carById("coupe");
/** ...and the saloon, which is the one car in the roster with a blade on it. */
const WINGED = carById("classic");

/** Just enough of a car for the air to have an opinion about it: the three
 * velocity components in the heading frame, and the attitude. Nothing else
 * in `CarState` is read by `aero.ts`. */
function falling(over: Partial<CarState> = {}): CarState {
  return { u: 0, w: 0, vy: 0, roll: 0, pitch: 0, ...over } as CarState;
}

describe("the drag area", () => {
  it("is the frontal one when the air comes straight down the nose", () => {
    expect(dragArea(SPEC, falling({ u: 30 }))).toBeCloseTo(A.nose * SPEC.aero.slip * A.bite, 6);
  });

  it("is the plan one when the car falls flat, and much the largest", () => {
    const flat = dragArea(SPEC, falling({ vy: -40 }));
    expect(flat).toBeCloseTo((A.plan * SPEC.aero.slip + SPEC.aero.wing * A.wingPlate) * A.bite, 6);
    // The whole reason the faces are stated separately: which way the car is
    // falling is worth a factor of five, and that is what separates a cliff
    // dive from a car going off flat.
    expect(flat / dragArea(SPEC, falling({ u: 40 }))).toBeGreaterThan(4);
  });

  it("is the side one when a car on its flank falls", () => {
    expect(dragArea(SPEC, falling({ vy: -40, roll: Math.PI / 2 }))).toBeCloseTo(
      A.side * SPEC.aero.slip * A.bite,
      6,
    );
  });

  it("blends the faces by the SQUARE of the direction the air comes from", () => {
    // Falling straight down with the nose 30° under: cos²30 of the air runs
    // out through the floor and sin²30 out through the nose. Squared and not
    // plain, because a face a few degrees off the flow still has the air
    // attached to it — see `dragArea`.
    const area = dragArea(SPEC, falling({ vy: -40, pitch: -Math.PI / 6 }));
    const c2 = Math.cos(Math.PI / 6) ** 2;
    const want =
      (A.plan * c2 + A.nose * Math.sin(Math.PI / 6) ** 2) * SPEC.aero.slip +
      SPEC.aero.wing * A.wingPlate * c2;
    expect(area).toBeCloseTo(want, 6);
  });

  it("is a BLEND — never more than the biggest face, whatever the attitude", () => {
    // The squared weights sum to one, which is what makes the area a convex
    // mix of the three rather than something that can exceed all of them.
    const most = (A.plan + SPEC.aero.wing * A.wingPlate) * A.bite;
    const least = A.nose * SPEC.aero.slip * A.bite;
    for (const roll of [0, 0.7, 1.9, -1.2]) {
      for (const pitch of [0, -0.6, 1.1]) {
        for (const v of [
          { u: 40, vy: -5 },
          { u: 5, vy: -60 },
          { u: 20, w: -20, vy: -20 },
        ]) {
          const area = dragArea(SPEC, falling({ ...v, roll, pitch }));
          expect(area).toBeLessThanOrEqual(most + 1e-9);
          expect(area).toBeGreaterThanOrEqual(least - 1e-9);
        }
      }
    }
  });

  it("cannot tell a car rolled left from one rolled right, or nose-up from nose-down", () => {
    const v = { vy: -30, u: 12 };
    expect(dragArea(SPEC, falling({ ...v, roll: 0.8 }))).toBeCloseTo(
      dragArea(SPEC, falling({ ...v, roll: -0.8 })),
      6,
    );
    expect(dragArea(SPEC, falling({ vy: -30, pitch: 0.5 }))).toBeCloseTo(
      dragArea(SPEC, falling({ vy: -30, pitch: -0.5 })),
      6,
    );
  });

  it("counts the wing, so the car with a blade on it falls slower", () => {
    // Same attitude, same air: the only difference is what is bolted to the
    // back of the car.
    const flat = falling({ vy: -50 });
    const perKg = (spec: CarSpec) => dragArea(spec, flat) / spec.mass;
    expect(perKg(WINGED)).toBeGreaterThan(perKg(SPEC));
  });
});

describe("terminal velocity", () => {
  it("puts a car falling flat where the world puts one, at the world's gravity", () => {
    // THE CALIBRATION, and the only claim in the model that can be argued
    // with from outside the game: a car dropped from a height comes down at
    // about 160-190 km/h. This is the same sum with the real 9.81 in it
    // rather than the arcade 1.6 g, asked of every car on the roster — the
    // light boxy ones a little under the band and the heavy slippery one a
    // little over, which is the right order and the right spread.
    //
    // If a retune moves any of this outside 150-200, the model has stopped
    // describing the world and `bite` is the knob that was wanted instead.
    for (const spec of CARS) {
      const flat = dragArea(spec, falling({ vy: -1 }));
      const real = Math.sqrt((2 * spec.mass * 9.81) / (T.collision.aero.density * flat));
      expect(real * 3.6, spec.name).toBeGreaterThan(150);
      expect(real * 3.6, spec.name).toBeLessThan(200);
    }
  });

  it("is past anything the road gives, so a long fall is the fastest the car goes", () => {
    const flat = terminalSpeed(SPEC, dragArea(SPEC, falling({ vy: -1 })));
    expect(flat * 3.6).toBeGreaterThan(220);
  });

  it("is where a fall actually settles, rather than a speed nothing reaches", () => {
    const car = falling({ vy: -1 });
    const want = terminalSpeed(SPEC, dragArea(SPEC, car));
    for (let i = 0; i < 120 * 60; i++) {
      airDrag(SPEC, car, T.dt);
      car.vy -= T.air.gravity * T.dt;
    }
    expect(Math.abs(car.vy)).toBeCloseTo(want, 1);
  });

  it("bounds the fall — a minute of cliff does not run away", () => {
    const car = falling({ u: 25 });
    for (let i = 0; i < 120 * 60; i++) {
      airDrag(SPEC, car, T.dt);
      car.vy -= T.air.gravity * T.dt;
    }
    // Without the air this is 3500 km/h and still climbing.
    expect(travelSpeed(car) * 3.6).toBeLessThan(300);
  });
});

describe("the drag itself", () => {
  it("only ever takes, at every attitude and every speed", () => {
    // The crash's ledger (`crashEnergy`) is built on nothing but the flight's
    // turbulence being allowed to add. A drag that could push at any attitude
    // would break the one invariant roll.ts is held to.
    for (const roll of [0, 0.4, 1.2, Math.PI, -2.3]) {
      for (const pitch of [0, -0.6, 0.9, -1.5]) {
        for (const v of [
          { u: 60, w: 0, vy: 0 },
          { u: 3, w: -8, vy: -70 },
          { u: -20, w: 14, vy: 30 },
          { u: 0.001, w: 0, vy: -0.002 },
        ]) {
          const car = falling({ ...v, roll, pitch });
          const before = travelSpeed(car);
          airDrag(SPEC, car, T.dt);
          expect(travelSpeed(car)).toBeLessThanOrEqual(before);
        }
      }
    }
  });

  it("slows the car without ever turning it round", () => {
    const car = falling({ u: 40, w: -12, vy: -25 });
    airDrag(SPEC, car, T.dt);
    expect(car.u).toBeGreaterThan(0);
    expect(car.w).toBeLessThan(0);
    expect(car.vy).toBeLessThan(0);
  });

  it("leaves a standing car alone", () => {
    const car = falling();
    airDrag(SPEC, car, T.dt);
    expect(travelSpeed(car)).toBe(0);
  });

  it("costs an ordinary jump almost nothing — flight still carries", () => {
    // Nose-on at rally pace, which is what a jump flies at: the nose follows
    // the arc, so the air stays end-on the whole way over. Under a tenth of
    // gravity, or the lip would stop throwing the car anywhere.
    const car = falling({ u: 32 });
    const before = travelSpeed(car);
    airDrag(SPEC, car, T.dt);
    const lost = (before - travelSpeed(car)) / T.dt;
    expect(lost).toBeLessThan(0.1 * T.air.gravity);
  });
});

describe("the trim the air holds the nose at", () => {
  it("lifts the nose over a jump, and only on the car with a wing on it", () => {
    // Level flight at rally pace: the flow runs straight along the car, the
    // blade makes downforce, the tail is pushed down and the nose comes up.
    const flying = falling({ u: 32 });
    expect(aeroTrim(WINGED, flying)).toBeGreaterThan(0);
    expect(aeroTrim(SPEC, flying)).toBeGreaterThan(0);
    // ...but the blade is worth an order more than a boot lip.
    expect(aeroTrim(WINGED, flying)).toBeGreaterThan(6 * aeroTrim(SPEC, flying));
  });

  it("lifts it harder the faster the jump is taken", () => {
    // The air goes as the square of the speed, so the same lip is worth
    // nothing at walking pace and several degrees off a fast one.
    const slow = aeroTrim(WINGED, falling({ u: 16 }));
    const fast = aeroTrim(WINGED, falling({ u: 32 }));
    expect(fast).toBeGreaterThan(3.5 * slow);
  });

  it("puts the nose DOWN in a fall — the same blade, the other way round", () => {
    // Falling flat, the flow comes up through the floor and through the
    // blade, and a push up at the tail is a nose-down moment. A wing is
    // feathers on an arrow, and this is the shuttlecock.
    const plunging = falling({ u: 6, vy: -45 });
    expect(aeroTrim(WINGED, plunging)).toBeLessThan(0);
    expect(aeroTrim(SPEC, plunging)).toBeLessThan(0);
    expect(aeroTrim(WINGED, plunging)).toBeLessThan(aeroTrim(SPEC, plunging));
  });

  it("noses a NOSE-HEAVY car over even with nothing on the back of it", () => {
    // The body's own plan area pushes through the middle of the car while
    // the weight rides ahead of it, so the hatch tips onto its nose on the
    // strength of where its engine is.
    const hatch = carById("compact");
    expect(hatch.balance).toBeGreaterThan(0.5);
    expect(aeroTrim(hatch, falling({ u: 6, vy: -45 }))).toBeLessThan(0);
  });

  it("stays inside the attitude the body is allowed to reach", () => {
    // `settlePitch` clamps to `pitchMax` regardless, but a trim that pegged
    // there would stop telling the cars apart — which is the whole point of
    // the number being what it is.
    for (const spec of [SPEC, WINGED, carById("compact")]) {
      const deep = aeroTrim(spec, falling({ u: 4, vy: -68 }));
      expect(Math.abs(deep)).toBeLessThan(T.attitude.pitchMax);
    }
  });

  it("says nothing at all about a car that is barely moving", () => {
    expect(aeroTrim(WINGED, falling({ u: 0.4 }))).toBe(0);
  });
});

describe("the speedo", () => {
  it("reads ground speed while the car is on the road", () => {
    expect(travelSpeed(falling({ u: 30, w: 4 }))).toBeCloseTo(Math.hypot(30, 4), 9);
  });

  it("counts the fall, which is where nearly all of a cliff's speed is", () => {
    // A car two seconds off a cliff has barely any horizontal speed left to
    // speak of next to the vertical, and the needle has to say so.
    expect(travelSpeed(falling({ u: 25, vy: -60 }))).toBeCloseTo(65, 6);
  });
});
