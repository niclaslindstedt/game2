// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT A FALL DOES TO A CAR. Folding panels is only half of an arrival:
// everything bolted to the car has to be stopped with it, and past a point
// the arms, the drive shafts and the engine mounts are not rated for what
// that asks (`game/mounts.ts`). These are the rules that separate a jump
// from a cliff — the arithmetic on its own, the attitude a car arrives at
// when it has gone over an edge, and then the whole chain driven through
// the real engine: a stage's hardest landing costs a car nothing, and a
// plunge at terminal speed takes the wheels off it and ends the run.

import { describe, expect, it } from "vitest";

import {
  NEUTRAL_INPUT,
  TUNING,
  WHEEL_PARTS,
  arrestLoad,
  beyondDriving,
  compileTrack,
  cornerLoads,
  createGame,
  diveShare,
  landingFace,
  mountFailure,
  shedSpeed,
  step,
  type GameEvent,
  type GameState,
} from "@engine";

const M = TUNING.collision.mounts;
const LONG_STRAIGHT = [{ kind: "straight", length: 3000, feature: "none" } as const];

/** Stand a car in the air over flat ground, `height` m up, and let it go.
 * Nothing is scripted past that: the flight, the drag that sets the
 * terminal speed, the attitude the body settles into and everything the
 * arrival costs are the engine's. */
function plunge(height: number, carId = "classic", forward = 20): GameState {
  const state = createGame({
    seed: 1,
    carId,
    skipCountdown: true,
    track: compileTrack(0, LONG_STRAIGHT),
  });
  const car = state.car;
  // Well off the road, over ground laid flat so the drop is the only thing
  // under test.
  car.x += 60;
  const floor = state.terrain.groundAt(car.x, car.z);
  state.terrain.groundAt = () => floor;
  car.y = floor + height;
  car.u = forward;
  car.w = 0;
  car.vy = 0;
  car.airborne = true;
  car.settling = false;
  car.airTime = 0;
  let after = 0;
  for (let i = 0; i < TUNING.physicsHz * 200; i++) {
    step(state, { ...NEUTRAL_INPUT });
    if (!car.airborne) after += 1;
    // Long enough past the arrival for a car that cannot drive to coast to
    // rest and be retired where it stops.
    if (after > TUNING.physicsHz * 12) break;
  }
  return state;
}

const wheelsOff = (state: GameState): number =>
  state.car.damage.wheels.filter((w) => w >= 1).length;

/** The four corners, in `WHEEL_PARTS` order. */
const [FL, FR, RL, RR] = [0, 1, 2, 3];

describe("the load an arrival puts on the mounts", () => {
  it("is the descent stopped over the stroke, in g", () => {
    // 10 m/s brought to rest over 0.5 m is 100 m/s², about 10 g.
    expect(arrestLoad(10, 0.5)).toBeCloseTo(100 / 9.81, 2);
  });

  it("falls as the car has further to travel while it stops", () => {
    const short = arrestLoad(40, 0.1);
    const long = arrestLoad(40, 0.5);
    expect(long).toBeLessThan(short);
    // Nothing to fold and nothing under the car is the worst case there is,
    // and it is still finite: the stroke has a floor.
    expect(arrestLoad(40, 0)).toBe(arrestLoad(40, M.minStroke));
  });

  it("is what tells a wall from a cliff, at the same speed", () => {
    // A wall is met over half a metre of crumple zone built to take it; a
    // car arriving flat with its floor already folded has a tenth of that.
    expect(arrestLoad(30, 0.52)).toBeLessThan(arrestLoad(30, 0.05) / 5);
  });
});

describe("what the load costs each mount", () => {
  it("costs nothing at all inside every rating", () => {
    const failed = mountFailure(M.hubG - 1);
    expect(failed.hub).toBe(0);
    expect(failed.drive).toBe(0);
    expect(failed.engine).toBe(0);
  });

  it("takes the car apart in the order it is built", () => {
    // The uprights first, then the shafts, then the block — so a fall that
    // is merely bad leaves a car limping, and only the worst takes all
    // three.
    expect(M.hubG).toBeLessThan(M.driveG);
    expect(M.driveG).toBeLessThan(M.engineG);
    const bad = mountFailure(M.driveG * 1.05);
    expect(bad.hub).toBeGreaterThan(0);
    expect(bad.drive).toBeGreaterThan(0);
    expect(bad.engine).toBe(0);
  });

  it("grows with how far past the rating the load pulled", () => {
    const over = mountFailure(M.hubG * 2);
    const worse = mountFailure(M.hubG * 3);
    expect(worse.hub).toBeGreaterThan(over.hub);
  });
});

describe("the face a car arrives on", () => {
  it("is the floorpan for anything flown even badly", () => {
    // The steepest a bot's landing arrives at over a stage is 17°.
    expect(landingFace(0, -0.3)).toBe("belly");
    expect(landingFace(0, 0)).toBe("belly");
  });

  it("is an END of the car once the nose is past the approach angle", () => {
    const past = TUNING.collision.structure.diveAngle + 0.05;
    expect(landingFace(0, -past)).toBe(0);
    expect(landingFace(0, past)).toBe(4);
  });

  it("is still the flank on a car that is lying on one", () => {
    // A body already over has no nose attitude worth reading; the roll
    // decides, as it always did.
    expect(landingFace(Math.PI / 2, -0.6)).toBe(6);
    expect(landingFace(-Math.PI / 2, -0.6)).toBe(2);
    expect(landingFace(Math.PI, -0.6)).toBe("roof");
  });

  it("hands the springs over across the dive rather than switching", () => {
    expect(diveShare(TUNING.collision.structure.diveAngle)).toBe(0);
    expect(diveShare(TUNING.attitude.pitchMax)).toBe(1);
    expect(diveShare(-TUNING.attitude.pitchMax)).toBe(1);
  });
});

describe("a car that falls", () => {
  it("drives away from a drop the suspension can still stop", () => {
    const { car } = plunge(5);
    expect(wheelsOff({ car } as GameState)).toBe(0);
    expect(car.damage.systems.engine).toBe(0);
    expect(car.damage.systems.gearbox).toBe(0);
  });

  it("bends what it lands on from a drop that is merely big", () => {
    const state = plunge(20);
    const d = state.car.damage;
    // Something is gone and the front of the car is hurt, but it still has
    // four wheels and a run to finish.
    expect(d.broken.length).toBeGreaterThan(0);
    expect(wheelsOff(state)).toBe(0);
    expect(beyondDriving(state.car)).toBe(null);
  });

  it("comes apart at terminal speed — most of its wheels off, the rest finished", () => {
    const state = plunge(1500);
    const wheels = state.car.damage.wheels;
    // Which corners go is the attitude's (`cornerLoads`), so what is held
    // here is the outcome and not a formation: nearly all of them leave,
    // and anything still bolted on is flat and bent past use.
    expect(wheelsOff(state)).toBeGreaterThanOrEqual(WHEEL_PARTS.length - 1);
    for (let wheel = 0; wheel < WHEEL_PARTS.length; wheel++) {
      expect(wheels[wheel]).toBeGreaterThan(TUNING.collision.chassis.wheelFlat);
    }
    for (let wheel = 0; wheel < WHEEL_PARTS.length; wheel++) {
      if (wheels[wheel] >= 1) expect(state.car.damage.broken).toContain(WHEEL_PARTS[wheel]);
    }
  });

  it("finishes the drivetrain and the chassis with them", () => {
    const d = plunge(1500).car.damage;
    expect(d.systems.gearbox).toBe(1);
    expect(d.wear).toBe(1);
  });

  it("ends the run where it stops", () => {
    const state = plunge(1500);
    expect(beyondDriving(state.car)).not.toBe(null);
    expect(state.phase).toBe("retired");
  });

  it("does the same to a car that comes down flat, with no panel to fold", () => {
    // Dropped with no forward speed the body never pitches, so the floorpan
    // is what arrives — a different face, the same answer, because what
    // takes the car apart is the load and not which panel met the ground.
    const state = plunge(1500, "classic", 0);
    expect(wheelsOff(state)).toBeGreaterThanOrEqual(WHEEL_PARTS.length - 1);
    expect(state.car.damage.wear).toBe(1);
    expect(state.phase).toBe("retired");
  });

  it("costs every car in the roster its wheels, not just the heavy one", () => {
    for (const carId of ["compact", "coupe"]) {
      expect(wheelsOff(plunge(1500, carId))).toBeGreaterThanOrEqual(WHEEL_PARTS.length - 1);
    }
  });
});

describe("which corner the arrival goes down through", () => {
  const share = (tilt: number, pitch: number): number[] => {
    const into = [0, 0, 0, 0];
    cornerLoads(tilt, pitch, into);
    return into;
  };

  it("is every corner equally on a car that arrives level", () => {
    expect(share(0, 0)).toEqual([1, 1, 1, 1]);
  });

  it("is the FRONT of a car that came down nose-first", () => {
    const nose = share(0, -TUNING.attitude.pitchMax);
    expect(nose[FL]).toBeGreaterThan(1);
    expect(nose[FL]).toBe(nose[FR]);
    expect(nose[RL]).toBeLessThan(1);
    expect(nose[RL]).toBe(nose[RR]);
  });

  it("...and the TAIL of one that came down on its back end", () => {
    const tail = share(0, TUNING.attitude.pitchMax);
    expect(tail[RL]).toBeGreaterThan(1);
    expect(tail[FL]).toBeLessThan(1);
  });

  it("is the low SIDE of one that arrived leaning", () => {
    // Positive roll lifts the right side, so the left pair is the low one.
    const lean = share(0.5, 0);
    expect(lean[FL]).toBeGreaterThan(1);
    expect(lean[FL]).toBe(lean[RL]);
    expect(lean[FR]).toBeLessThan(1);
  });

  it("only ever REDISTRIBUTES the arrival, never inflates it", () => {
    for (const [tilt, pitch] of [
      [0, 0],
      [0.5, -0.6],
      [-1.2, 0.3],
      [Math.PI / 2, 0],
      [0.2, -0.15],
    ]) {
      const sum = share(tilt, pitch).reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(4, 9);
    }
  });

  it("cannot take a corner past its own share or below nothing", () => {
    for (const [tilt, pitch] of [
      [3, 0.6],
      [-3, -0.6],
    ]) {
      for (const s of share(tilt, pitch)) {
        expect(s).toBeGreaterThan(0);
        expect(s).toBeLessThanOrEqual(1 + TUNING.collision.mounts.tiltShare);
      }
    }
  });
});

describe("how hard a part is thrown off", () => {
  it("is never gentler than a part has always left with", () => {
    expect(shedSpeed(0)).toBe(TUNING.collision.mounts.shedFloor);
    expect(shedSpeed(8)).toBe(TUNING.collision.mounts.shedFloor);
  });

  it("grows with the speed of whatever took it off", () => {
    expect(shedSpeed(60)).toBeGreaterThan(shedSpeed(30));
    expect(shedSpeed(30)).toBeGreaterThan(TUNING.collision.mounts.shedFloor);
  });

  it("...and with that corner's own helping of it", () => {
    expect(shedSpeed(60, 1.4)).toBeGreaterThan(shedSpeed(60, 0.6));
  });
});

describe("a wheel leaving a car that fell on it", () => {
  /** Every `partBreak` a plunge raises, by part. */
  const shedding = (height: number, forward = 20): Map<string, number> => {
    const state = createGame({
      seed: 1,
      carId: "classic",
      skipCountdown: true,
      track: compileTrack(0, LONG_STRAIGHT),
    });
    const car = state.car;
    car.x += 60;
    const floor = state.terrain.groundAt(car.x, car.z);
    state.terrain.groundAt = () => floor;
    car.y = floor + height;
    car.u = forward;
    car.w = 0;
    car.vy = 0;
    car.airborne = true;
    car.settling = false;
    car.airTime = 0;
    const shed = new Map<string, number>();
    let after = 0;
    for (let i = 0; i < TUNING.physicsHz * 200; i++) {
      const events: GameEvent[] = step(state, { ...NEUTRAL_INPUT });
      for (const ev of events) {
        if (ev.type === "partBreak" && !shed.has(ev.part)) shed.set(ev.part, ev.shed);
      }
      if (!car.airborne) after += 1;
      if (after > TUNING.physicsHz * 12) break;
    }
    return shed;
  };

  it("is thrown off far harder than one levered off at road speed", () => {
    const shed = shedding(1500);
    const wheel = shed.get("wheelFL");
    expect(wheel).toBeDefined();
    expect(wheel as number).toBeGreaterThan(TUNING.collision.mounts.shedFloor * 2);
  });

  it("loses the pair the car came down on before the pair still in the air", () => {
    // A car that goes over an edge with speed on settles nose-down, so the
    // front wheels are what the whole mass arrives through: they leave, and
    // the rear pair is left flat on a car that has no front.
    const state = plunge(150);
    const wheels = state.car.damage.wheels;
    expect(wheels[FL]).toBe(1);
    expect(wheels[FR]).toBe(1);
    expect(wheels[RL]).toBeLessThan(1);
    expect(wheels[RL]).toBeGreaterThan(TUNING.collision.chassis.wheelFlat);
    // ...and it is still the run: two wheels gone is a car that cannot be
    // driven, however many are left hanging.
    expect(beyondDriving(state.car)).not.toBe(null);
    expect(state.phase).toBe("retired");
  });

  it("throws the corner it landed on harder than the others", () => {
    const shed = shedding(1500);
    const front = shed.get("wheelFL");
    const rear = shed.get("wheelRL");
    expect(front).toBeDefined();
    if (rear !== undefined) expect(front as number).toBeGreaterThan(rear);
  });
});
