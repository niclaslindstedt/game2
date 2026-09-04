// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT A BROKEN CAR DRIVES LIKE. collision.ts writes the ledger — folded
// panels, spent structure, hurt machinery, parts left on the road — and
// cooling.ts writes the temperature beside it; this module turns the whole
// of it into the handful of numbers the handling model multiplies through.
// Every entry in that ledger is answered here: nothing in `car.damage` is
// allowed to be decoration.
//
// The rule that shapes nearly every number below: damage DEGRADES. A hurt
// car drives — badly, crookedly, out of breath — for as long as it can
// drive at all, because a car that merely got slower on a gauge is a gauge
// and not a crash. Two things are past that: an engine at 1 is DEAD, and a
// car on fewer than three wheels is not a car. Both stop the car for good
// (`beyondDriving`), and step.ts retires the run where it comes to rest.
//
// TWO KINDS OF LOSS, and keeping them apart is what makes the model read
// right. A MECHANICAL loss — a rim on the road, a rubbing hub, a shell
// pulled out of square — is a share of the speed, so it is felt everywhere
// and hurts the exit of a hairpin as much as a straight. An AERODYNAMIC
// loss — a door, a bonnet, a windscreen — goes as the SQUARE of the speed,
// so it is nothing at all at 40 km/h and the whole top end at 140. A car
// that has lost its panels still launches like a rally car; it simply never
// arrives anywhere.
//
// The handling model READS this and never writes the ledger; collision.ts
// and cooling.ts write the ledger and never read this.

import { clamp } from "../lib/math.ts";
import { heatPower } from "./cooling.ts";
import { TUNING } from "./defs/tuning.ts";
import { WHEEL_PARTS, type CarState, type DamagePart, type RetireReason } from "./state.ts";

const S = TUNING.collision.systems;
const C = TUNING.collision.chassis;
const A = TUNING.collision.aero;

/** The multipliers a damaged car drives through. Each one is 1 (or 0) on a
 * sound car, so the handling model can apply them unconditionally. */
export type DamageEffects = {
  /** Engine output, 0..1 — a folded radiator starves the motor, a hot one
   * has its timing pulled, a corner on its hub wastes what is left... */
  power: number;
  /** ...and past a point it stops running cleanly at all: 1 while the
   * engine is firing this instant, 0 through a misfire's dead beat — and
   * 0 for good once the engine is dead. */
  firing: number;
  /** Steering authority, 0..1 — a bent rack answers late and short, and a
   * driver with no windscreen in front of them answers late too. */
  steering: number;
  /** Lock the car carries with the wheel straight, -1..1 — the pull of a
   * shell folded harder down one side than the other, of bent tie rods, of
   * a flat or a missing wheel on one side, and of the air spilling through
   * a hole in one flank. Positive pulls right. */
  pull: number;
  /** Lateral grip, 0..1 — bent arms, a twisted floorpan, flat tyres, and
   * the downforce that is no longer being made. */
  grip: number;
  /** Braking, 0..1 — a spent chassis cannot hold its hubs square, and a
   * cut line loses the pedal. */
  brake: number;
  /** What is left of the handbrake, 0..1 — the one cable to the rear. */
  lever: number;
  /** Extra MECHANICAL drag, 1/s, on top of the surface's own: a scraping
   * floor, a rim on the road, a shell rubbing where it should not. */
  drag: number;
  /** Extra AERODYNAMIC drag as CdA, m² — the holes the crash left in the
   * bodywork, spent by car.ts against the square of the speed and the car's
   * own mass. This is the number that decides whether the car ever sees its
   * top end again. Zero on a sound car, and slightly NEGATIVE on one whose
   * only loss is the rear wing, which is drag it was carrying on purpose. */
  aero: number;
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

/** HOW MUCH LIGHT IS LEFT at one end of the car, 0..1 — the share of
 * `lamps` (`FRONT_LAMPS` or `REAR_LAMPS`) still bolted to it. The one
 * damage effect the handling model has no use for and the WORLD does: one
 * headlamp gone is half the beam down a night stage, which is a real cost
 * paid on every corner after it and nowhere on the car's own numbers. The
 * renderer reads it for the beams and for the blooms; the engine states it
 * here so the two can never disagree about which lamp went. */
export function lampShare(car: CarState, lamps: readonly DamagePart[]): number {
  let lit = 0;
  for (const lamp of lamps) if (!car.damage.broken.includes(lamp)) lit += 1;
  return lamps.length === 0 ? 0 : lit / lamps.length;
}

/** The whole crush ledger as one depth, m — every zone, the floorpan and
 * the roof. What the panels have taken, regardless of where. */
function totalCrush(car: CarState): number {
  let sum = car.damage.belly + car.damage.roof;
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

/** WHICH FLANK a missing part leaves open, in the engine's frame (positive
 * is the right side). Only the parts that are one of a pair are here: a
 * bonnet or a windscreen is a hole on the centreline and pulls nowhere.
 * Everything read off this table is read off `aero.part` as well, so the
 * yaw a hole makes is always in proportion to the drag it makes. */
const OPEN_SIDE: Partial<Record<DamagePart, number>> = {
  mirrorL: -1,
  mirrorR: 1,
  lampFL: -1,
  lampFR: 1,
  lampRL: -1,
  lampRR: 1,
  glassL: -1,
  glassR: 1,
  doorL: -1,
  doorR: 1,
};

/** How hard the air is working, 0..1 — the square of the pace against the
 * pace every aerodynamic number in the group is quoted at. Everything aero
 * fades on this rather than on speed itself, because that is what the air
 * actually does: a car with no doors is a normal car in a village. */
function aeroLoad(speed: number): number {
  const q = Math.abs(speed) / A.speed;
  return Math.min(1, q * q);
}

/** THE AIR, added up over what is no longer bolted to the car: the drag it
 * costs (1/m, quadratic), the downforce it stops making (a fraction of
 * lateral grip at `aero.speed`), and the yaw a hole down ONE side pulls the
 * car into. */
function aeroToll(broken: DamagePart[]): { drag: number; lift: number; side: number } {
  const toll = { drag: 0, lift: 0, side: 0 };
  for (const part of broken) {
    const drag = A.part[part];
    toll.drag += drag;
    toll.lift += A.lift[part];
    toll.side += (OPEN_SIDE[part] ?? 0) * drag;
  }
  return toll;
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

/** How many ratios the box has lost off the top. A hurt gearbox is finished
 * on what is left of it, which caps the stage's top end twice over without
 * ever stopping the car. */
function gearsLost(gearbox: number): number {
  if (gearbox >= C.secondGearAt) return 2;
  return gearbox >= C.topGearAt ? 1 : 0;
}

/** Read the whole ledger. `speed` is the car's pace in m/s — every
 * aerodynamic term is quoted against it — and `t` the run clock in
 * seconds. */
export function damageEffects(car: CarState, speed: number, t: number): DamageEffects {
  const d = car.damage;
  const sys = d.systems;
  // Structure is the headline gauge — the one the HUD draws the body's own
  // outline in — so it has to be felt in more than one place: the shell
  // twists under load (grip), it cannot hold its hubs square (brake), and
  // it is no longer the shape it was drawn as (drag).
  const wear = d.wear;
  const air = aeroLoad(speed);
  const aero = aeroToll(d.broken);
  const wheels = wheelToll(car);
  const dead = sys.engine >= 1;
  // The floor under grip. The shell, the arms and the downforce together
  // never take it under `gripFloor` — a car that cannot be pointed is not a
  // consequence — but a wheel that is no longer on the car is allowed to,
  // as far as its own, lower floor: three wheels genuinely steer badly.
  const held = Math.max(
    C.gripFloor,
    (1 - S.gripLoss * sys.suspension) * (1 - C.wearGrip * wear) * (1 - aero.lift * air),
  );
  // A BENT RACK ANSWERS CROOKED. Which way is the front corner that is
  // folded deeper: a nose driven in square bends both tie rods the same
  // and pulls nowhere, which is why this is a difference and not a total.
  const corners = d.zones[1] - d.zones[7];
  const rackPull = C.steerPull * sys.steering * Math.sign(corners);
  return {
    power: dead ? 0 : (1 - S.powerLoss * sys.engine) * heatPower(car) * wheels.power,
    firing: dead ? 0 : firing(sys.engine, t),
    // The blast through a screen that is no longer there is the driver's
    // loss, not the rack's — so it fades with the air like the drag does.
    steering:
      (1 - S.steerLoss * sys.steering) * (1 - (d.broken.includes("glassF") ? A.blast : 0) * air),
    pull: clamp(
      crushBias(car) * C.pullPerCrush + rackPull + wheels.pull + aero.side * A.yawPerDrag * air,
      -C.pullMax,
      C.pullMax,
    ),
    grip: Math.max(C.wheelOffGripFloor, held * wheels.grip),
    brake: (1 - C.wearBrake * wear) * (1 - S.brakeLoss * sys.brakes),
    lever: 1 - S.leverLoss * sys.brakes,
    drag: C.wearDrag * wear + C.bellyDrag * d.belly + C.crushDrag * totalCrush(car) + wheels.drag,
    aero: aero.drag + A.crush * totalCrush(car),
    coastBrake: (dead ? C.deadEngineBrake : 0) + wheels.brake,
    gearsLost: gearsLost(sys.gearbox),
  };
}
