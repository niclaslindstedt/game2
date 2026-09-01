// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT A BROKEN CAR DRIVES LIKE. collision.ts writes the ledger — folded
// panels, spent structure, hurt machinery, parts left on the road — and this
// module turns the whole of it into the handful of numbers the handling model
// multiplies through. Every entry in that ledger is answered here: nothing in
// `car.damage` is allowed to be decoration.
//
// The rule that shapes nearly every number below: damage DEGRADES. A hurt
// car drives — badly, crookedly, out of breath — for as long as it can
// drive at all, because a car that merely got slower on a gauge is a gauge
// and not a crash. Two things are past that: an engine at 1 is DEAD, and a
// car on fewer than three wheels is not a car. Both stop the car for good
// (`beyondDriving`), and step.ts retires the run where it comes to rest.
//
// The handling model READS this and never writes the ledger; collision.ts
// writes the ledger and never reads this.

import { clamp } from "../lib/math.ts";
import { TUNING } from "./defs/tuning.ts";
import { WHEEL_PARTS, type CarState, type DamagePart, type RetireReason } from "./state.ts";

const S = TUNING.collision.systems;
const C = TUNING.collision.chassis;

/** The multipliers a damaged car drives through. Each one is 1 (or 0) on a
 * sound car, so the handling model can apply them unconditionally. */
export type DamageEffects = {
  /** Engine output, 0..1 — a folded radiator starves the motor, a corner
   * on its hub wastes what is left... */
  power: number;
  /** ...and past a point it stops running cleanly at all: 1 while the
   * engine is firing this instant, 0 through a misfire's dead beat — and
   * 0 for good once the engine is dead. */
  firing: number;
  /** Steering authority, 0..1 — a bent rack answers late and short. */
  steering: number;
  /** Lock the car carries with the wheel straight, -1..1 — the pull of a
   * shell folded harder down one side than the other, and of a flat or a
   * missing wheel on one side. Positive pulls right, the side its worst
   * dents are on. */
  pull: number;
  /** Lateral grip, 0..1 — bent arms, a twisted floorpan, flat tyres, the
   * wing that is no longer on the back of the car. */
  grip: number;
  /** Braking, 0..1 — a spent chassis cannot hold its hubs square, and a
   * cut line loses the pedal. */
  brake: number;
  /** What is left of the handbrake, 0..1 — the one cable to the rear. */
  lever: number;
  /** Extra longitudinal drag, 1/s, on top of the surface's own: torn
   * bodywork, a scraping floor, a rim on the road. */
  drag: number;
  /** Constant retardation, m/s², whatever the speed — a seized engine on
   * the driven wheels, a hub ploughing the road. What actually stops a
   * car that can no longer drive: drag alone only ever slows one. */
  coastBrake: number;
  /** Gears taken away at the top of the box, 0..n. */
  gearsLost: number;
};

/** Is this car ever going to move under its own power again? The reason
 * it is not, or null while it still can. Read by step.ts, which retires
 * the run once such a car has come to rest — and which stands the wedge
 * rescue and the reset aside for it, because putting a dead car back on
 * the road only parks it there. */
export function beyondDriving(car: CarState): RetireReason | null {
  if (car.damage.systems.engine >= 1) return "engine";
  let off = 0;
  for (const part of WHEEL_PARTS) if (car.damage.broken.includes(part)) off += 1;
  return off >= 2 ? "wheels" : null;
}

/** The whole crush ledger as one depth, m — every zone plus the floorpan.
 * What the panels have taken, regardless of where. */
function totalCrush(car: CarState): number {
  let sum = car.damage.belly;
  for (const zone of car.damage.zones) sum += zone;
  return sum;
}

/** How far out of true the shell is pulled, m of crush: the right flank
 * (zones 1–3) against the left (5–7). The nose and the tail sit on the
 * centreline and pull nowhere. */
function crushBias(car: CarState): number {
  const z = car.damage.zones;
  return z[1] + z[2] + z[3] - (z[5] + z[6] + z[7]);
}

/** Drag from the panels a hit left on the road. Every part carries its own
 * cost, because a mirror and a bonnet are not the same hole in the car.
 * The wheels are on this list at zero: theirs is `wheelToll`'s. */
function partDrag(broken: DamagePart[]): number {
  let drag = 0;
  for (const part of broken) drag += C.partDrag[part];
  return drag;
}

/** THE MISFIRE. Under `misfireFrom` a hurt engine simply makes less power;
 * past it the ignition starts dropping beats outright, and the car lurches
 * down the road instead of pulling down it. Two out-of-tune sine waves make
 * a stutter that never settles into a rhythm the ear can follow, while
 * staying a pure function of the clock — the engine is deterministic, and a
 * misfire has to replay exactly on the same seed like everything else. */
function firing(engine: number, t: number): number {
  const past = clamp((engine - C.misfireFrom) / (1 - C.misfireFrom), 0, 1);
  if (past <= 0) return 1;
  const beat = Math.sin(t * C.misfireRate) + Math.sin(t * C.misfireRate * C.misfireDetune);
  // The dead band widens with the damage: an engine barely past the
  // threshold coughs once in a while, a dead one barely fires at all.
  return beat > 2 - 2 * C.misfireDuty * past ? 0 : 1;
}

/** What the four corners cost, added up: a flat tyre and a missing wheel
 * are the same three taxes at two sizes, and each one pulls the car toward
 * its own side. `pull` is in lock (positive right, the engine's right),
 * `grip` and `power` are what is left as fractions, `drag` is 1/s. */
function wheelToll(car: CarState): {
  grip: number;
  pull: number;
  drag: number;
  power: number;
  brake: number;
} {
  const toll = { grip: 1, pull: 0, drag: 0, power: 1, brake: 0 };
  const wheels = car.damage.wheels;
  for (let i = 0; i < WHEEL_PARTS.length; i++) {
    // FL, FR, RL, RR: the odd indices are the right side.
    const side = i % 2 === 1 ? 1 : -1;
    if (car.damage.broken.includes(WHEEL_PARTS[i])) {
      toll.grip *= 1 - C.wheelOffGrip;
      toll.pull += side * C.wheelOffPull;
      toll.drag += C.wheelOffDrag;
      toll.power *= C.wheelOffPower;
      toll.brake += C.hubBrake;
    } else if (wheels[i] >= C.wheelFlat) {
      toll.grip *= 1 - C.flatGrip;
      toll.pull += side * C.flatPull;
      toll.drag += C.flatDrag;
    }
  }
  return toll;
}

/** Read the whole ledger. `speed` is the car's pace in m/s (the wing that
 * is missing only matters where it was doing something) and `t` the run
 * clock in seconds. */
export function damageEffects(car: CarState, speed: number, t: number): DamageEffects {
  const d = car.damage;
  const sys = d.systems;
  // Structure is the headline gauge — the one the HUD draws the body's own
  // outline in — so it has to be felt in more than one place: the shell
  // twists under load (grip), it cannot hold its hubs square (brake), and
  // it is no longer the shape it was drawn as (drag).
  const wear = d.wear;
  const missingWing = d.broken.includes("spoiler");
  // The wing does nothing at a walking pace and everything at the top end,
  // so its loss fades in with speed rather than taxing the whole stage.
  const wingLoss = missingWing ? C.spoilerGrip * clamp(speed / C.spoilerSpeed, 0, 1) : 0;
  const wheels = wheelToll(car);
  const dead = sys.engine >= 1;
  // The floor under grip. The shell, the arms and the wing together never
  // take it under `gripFloor` — a car that cannot be pointed is not a
  // consequence — but a wheel that is no longer on the car is allowed to,
  // as far as its own, lower floor: three wheels genuinely steer badly.
  const held = Math.max(
    C.gripFloor,
    (1 - S.gripLoss * sys.suspension) * (1 - C.wearGrip * wear) * (1 - wingLoss),
  );
  return {
    power: dead ? 0 : (1 - S.powerLoss * sys.engine) * wheels.power,
    firing: dead ? 0 : firing(sys.engine, t),
    steering: 1 - S.steerLoss * sys.steering,
    pull: clamp(crushBias(car) * C.pullPerCrush + wheels.pull, -C.pullMax, C.pullMax),
    grip: Math.max(C.wheelOffGripFloor, held * wheels.grip),
    brake: (1 - C.wearBrake * wear) * (1 - S.brakeLoss * sys.brakes),
    lever: 1 - S.leverLoss * sys.brakes,
    drag:
      C.wearDrag * wear +
      C.bellyDrag * d.belly +
      C.crushDrag * totalCrush(car) +
      partDrag(d.broken) +
      wheels.drag,
    coastBrake: (dead ? C.deadEngineBrake : 0) + wheels.brake,
    gearsLost: sys.gearbox >= C.topGearAt ? 1 : 0,
  };
}
