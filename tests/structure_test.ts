// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT THE SHELL IS MADE OF — the contact model asking how the car is built
// before deciding what a blow does to it (engine/game/structure.ts).
//
// Two claims, and both are about a car being DISTORTED by a crash rather
// than bounced by it. What comes back off a wall falls with how hard the
// wall was hit, because past a scuff the arrival is spent folding the car
// and a fold returns nothing; and what a contact passes on to the body is a
// property of the FACE that arrived — a crumple zone stops the car, the cage
// throws it — of the mass behind it, and of how much of that face is already
// gone.
import { describe, expect, it } from "vitest";

import {
  CARS,
  TUNING,
  collideCar,
  compileTrack,
  createGame,
  crushCap,
  foldSpeed,
  landingDamage,
  landingFace,
  restitutionAt,
  standSolid,
  type GameEvent,
  type GameState,
} from "@engine";

const C = TUNING.collision;
const S = TUNING.collision.structure;

function fresh(carId = "classic"): GameState {
  return createGame({
    seed: 3,
    carId,
    skipCountdown: true,
    track: compileTrack(3, [{ kind: "straight", length: 900, feature: "none" }]),
  });
}

/** Something rooted the car cannot move or break, dead ahead. */
function wallAhead(state: GameState): ReturnType<typeof standSolid> {
  const car = state.car;
  return standSolid({
    kind: "boulder",
    size: 2.4,
    spin: 0,
    x: car.x + Math.sin(car.heading) * (C.halfLength + 1.2),
    z: car.z + Math.cos(car.heading) * (C.halfLength + 1.2),
    y: car.y,
  });
}

/** Drive into that wall at `speed` and report the share of it that came
 * back. */
function bounce(speed: number): number {
  const state = fresh();
  const car = state.car;
  car.u = speed;
  const events: GameEvent[] = [];
  collideCar(state.spec, car, [wallAhead(state)], events, state.stats);
  return -car.u / speed;
}

describe("what comes back off a wall", () => {
  it("falls with the closing speed: a nudge is springy, a crash is not", () => {
    // The scuff floor is where the curve starts, at the gentle contact's own
    // coefficient; from there it falls as the arrival is spent on the metal.
    expect(restitutionAt(C.restitution, C.scuffSpeed)).toBeCloseTo(C.restitution, 6);
    expect(restitutionAt(C.restitution, 0)).toBeCloseTo(C.restitution, 6);
    // The points barrier tests draw it through: about a tenth at 50 km/h and
    // a twentieth at 100.
    expect(restitutionAt(C.restitution, 14)).toBeGreaterThan(0.07);
    expect(restitutionAt(C.restitution, 14)).toBeLessThan(0.13);
    expect(restitutionAt(C.restitution, 28)).toBeLessThan(0.07);
    // ...and it only ever falls.
    let last = 1;
    for (let v = 0; v < 60; v += 1) {
      const e = restitutionAt(C.restitution, v);
      expect(e).toBeLessThanOrEqual(last);
      last = e;
    }
  });

  it("a car that meets a wall at 120 km/h is a wreck where it stands, not a ball", () => {
    // With a constant coefficient the same car came back up the road at
    // 35 km/h. Now it is stopped, folded, and left with a walking pace of
    // rebound — and a slow bump still springs back the way a bumper does.
    const fast = bounce(33);
    const slow = bounce(5);
    expect(fast).toBeGreaterThan(0);
    expect(fast).toBeLessThan(0.08);
    expect(slow).toBeGreaterThan(fast * 3);
    expect(slow).toBeLessThanOrEqual(C.restitution + 1e-9);
  });
});

describe("what the shell passes on", () => {
  const hatch = CARS.find((c) => c.mass === Math.min(...CARS.map((x) => x.mass)))!;
  const coupe = CARS.find((c) => c.mass === Math.max(...CARS.map((x) => x.mass)))!;
  const sound = (): GameState["car"]["damage"] => fresh().car.damage;

  it("is the face's: a crumple zone stops the car, the cage throws it", () => {
    const d = sound();
    const nose = foldSpeed(hatch, d, 0);
    const tail = foldSpeed(hatch, d, 4);
    const flank = foldSpeed(hatch, d, 2);
    const corner = foldSpeed(hatch, d, 1);
    const belly = foldSpeed(hatch, d, "belly");
    const roof = foldSpeed(hatch, d, "roof");
    expect(nose).toBeCloseTo(tail, 9);
    expect(nose).toBeLessThan(flank);
    expect(corner).toBeGreaterThan(nose);
    expect(corner).toBeLessThan(flank);
    expect(flank).toBeLessThan(belly);
    expect(belly).toBeLessThan(roof);
    // ...and none of them is yet the bare cage.
    expect(roof).toBeLessThan(S.fold.cage / (hatch.mass / C.refMass));
  });

  it("is the mass's: a fixed force turns a heavy car less", () => {
    const d = sound();
    expect(coupe.mass).toBeGreaterThan(hatch.mass);
    expect(foldSpeed(coupe, d, 2)).toBeLessThan(foldSpeed(hatch, d, 2));
    expect(foldSpeed(coupe, d, 2) * coupe.mass).toBeCloseTo(foldSpeed(hatch, d, 2) * hatch.mass, 6);
  });

  it("climbs toward the cage as the face is used up", () => {
    // A car gets HARDER as it is destroyed: the first contact on a flank is
    // a door skin folding, the last is the ground meeting the bar behind it.
    const d = sound();
    const untouched = foldSpeed(hatch, d, 2);
    d.zones[2] = crushCap(2) / 2;
    const half = foldSpeed(hatch, d, 2);
    d.zones[2] = crushCap(2);
    const gone = foldSpeed(hatch, d, 2);
    expect(half).toBeGreaterThan(untouched);
    expect(gone).toBeGreaterThan(half);
    expect(gone).toBeCloseTo(S.fold.cage / (hatch.mass / C.refMass), 9);
    // ...and a face folded PAST its cap is still the cage, not more than it.
    d.zones[2] = crushCap(2) * 2;
    expect(foldSpeed(hatch, d, 2)).toBeCloseTo(gone, 9);
  });

  it("gives the roof the cage's stroke and nothing more", () => {
    expect(crushCap("roof")).toBe(S.roofMax);
    expect(crushCap("roof")).toBeLessThan(crushCap(2));
    expect(crushCap("belly")).toBe(C.zoneMax);
    // Every bolt on the roof has to sit inside that stroke, or it is a part
    // that never comes off a rolled car.
    for (const at of [C.partAt.roofGlass, C.partAt.roofMirror, C.partAt.roofLid]) {
      expect(at).toBeLessThan(S.roofMax);
    }
    // ...and a slam onto the roof folds it to the cage and stops there.
    const state = fresh();
    const car = state.car;
    car.roll = Math.PI;
    expect(landingFace(Math.PI)).toBe("roof");
    const events: GameEvent[] = [];
    landingDamage(state.spec, car, 60, events, state.stats);
    expect(car.damage.roof).toBeCloseTo(S.roofMax, 9);
    expect(car.damage.broken).toContain("glassF");
    expect(car.damage.broken).toContain("hood");
    // The same slam onto a flank folds it further: the cage is stiffer than
    // a door, and what it does not fold it passes on instead.
    const side = fresh();
    side.car.roll = Math.PI / 2;
    landingDamage(side.spec, side.car, 60, [], side.stats);
    expect(Math.max(...side.car.damage.zones)).toBeGreaterThan(S.roofMax);
  });
});
