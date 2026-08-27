// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The contact model — what happens when the body meets something solid.
// The car is an oriented box in the ground plane, every solid is a circle
// (a trunk, a boulder, a fallen log), and a hit does three things at once:
// an impulse (the normal component bounces off soft, the tangential mostly
// survives — a glancing blow is a scrape, not a wall), a yaw kick from the
// lever arm (clipping a tree with a corner spins the car), and CRUSH — the
// panels of the struck zone fold in, permanently. Crush is the renderer's
// deformation input, the trigger that tears parts off their bolts, and the
// wear that eventually wrecks the chassis. The GROUND is a solid here too:
// a face the wheels cannot climb refuses the car exactly like a trunk does.
// Every contact also loads the springs (state.ride/pitchLoad), which is what
// makes a hit rock the car rather than nudge a sprite. The car's mass sets
// how much of all this it takes: heavier spins less, folds deeper. Numbers
// live in defs/tuning.ts.

import { clamp } from "../lib/math.ts";
import type { WildObstacle } from "../mapgen/index.ts";
import type { CarSpec } from "./defs/cars.ts";
import { TUNING } from "./defs/tuning.ts";
import {
  DAMAGE_ZONES,
  updateSlip,
  type CarState,
  type DamagePart,
  type GameEvent,
  type RunStats,
} from "./state.ts";

const T = TUNING;

/** Which zones hold each part on, and how much crush shears its bolts. A
 * part is listed under every zone whose folding can take it off. */
const PART_BOLTS: { part: DamagePart; zones: number[]; crushAt: number }[] = [
  { part: "bumperF", zones: [7, 0, 1], crushAt: T.collision.partAt.bumper },
  { part: "bumperR", zones: [3, 4, 5], crushAt: T.collision.partAt.bumper },
  { part: "mirrorR", zones: [1, 2], crushAt: T.collision.partAt.mirror },
  { part: "mirrorL", zones: [6, 7], crushAt: T.collision.partAt.mirror },
  { part: "spoiler", zones: [3, 4, 5], crushAt: T.collision.partAt.spoiler },
  { part: "hood", zones: [7, 0, 1], crushAt: T.collision.partAt.lid },
  { part: "hatch", zones: [3, 4, 5], crushAt: T.collision.partAt.lid },
];

/** The car's mass against the mass every collision number is written for.
 * Above 1 is a heavy car. */
function massRatio(spec: CarSpec): number {
  return spec.mass / T.collision.refMass;
}

/** The zone an impact angle lands in — angle 0 is the nose, positive is the
 * right side, each zone spans 45°. */
export function damageZoneAt(angle: number): number {
  const span = (Math.PI * 2) / DAMAGE_ZONES;
  return ((Math.round(angle / span) % DAMAGE_ZONES) + DAMAGE_ZONES) % DAMAGE_ZONES;
}

/** Crush reaching past the panels: which system lives nearest each zone,
 * as (system, share-of-transfer) pairs. */
function dealSystems(car: CarState, zone: number | null, crush: number): void {
  const S = T.collision.systems;
  const sys = car.damage.systems;
  const deal = (key: keyof typeof sys, amount: number): void => {
    sys[key] = Math.min(1, sys[key] + amount);
  };
  if (zone === null) {
    deal("suspension", crush * S.suspensionFromBelly);
    deal("gearbox", crush * S.gearboxFromBelly);
  } else if (zone === 0) {
    deal("engine", crush * S.engineFromNose);
  } else if (zone === 1 || zone === 7) {
    deal("engine", crush * S.engineFromNose * 0.5);
    deal("steering", crush * S.steeringFromCorner);
  } else if (zone === 2 || zone === 6) {
    deal("suspension", crush * S.suspensionFromFlank);
  } else if (zone === 3 || zone === 5) {
    deal("gearbox", crush * S.gearboxFromRear * 0.5);
    deal("suspension", crush * S.suspensionFromFlank * 0.5);
  } else {
    deal("gearbox", crush * S.gearboxFromRear);
  }
}

/** Book one dealt crush: fold the panels (a ring zone, or the underside
 * when `zone` is null), hurt the system living behind them, take the wear,
 * tear off whatever the folding sheared through, and tell the world. */
function dealCrush(
  car: CarState,
  zone: number | null,
  crush: number,
  angle: number,
  speed: number,
  events: GameEvent[],
  stats: RunStats,
): void {
  const damage = car.damage;
  damage.wear = Math.min(1, damage.wear + crush * T.collision.wearPerCrush);
  damage.version += 1;
  stats.impacts += 1;
  events.push({ type: "impact", speed, angle, belly: zone === null });
  dealSystems(car, zone, crush);
  if (zone === null) {
    damage.belly = Math.min(T.collision.zoneMax, damage.belly + crush);
    return;
  }
  damage.zones[zone] = Math.min(T.collision.zoneMax, damage.zones[zone] + crush);
  for (const bolt of PART_BOLTS) {
    if (!bolt.zones.includes(zone)) continue;
    if (damage.zones[zone] < bolt.crushAt) continue;
    if (damage.broken.includes(bolt.part)) continue;
    damage.broken.push(bolt.part);
    events.push({ type: "partBreak", part: bolt.part });
  }
}

/** The ground hitting back at touchdown. `slam` is the descent speed
 * relative to the ground, m/s; what the suspension cannot absorb crushes
 * the underside — or the flank, on a car that came down on its side (the
 * roll decides, and positive roll lifts the RIGHT side, so it is the left
 * flank that meets the ground). */
export function landingDamage(
  spec: CarSpec,
  car: CarState,
  slam: number,
  events: GameEvent[],
  stats: RunStats,
): void {
  // Shot dampers absorb less: suspension damage narrows what lands free.
  const tolerance =
    T.collision.hardLandSpeed *
    (1 - T.collision.systems.landTolerance * car.damage.systems.suspension);
  const over = slam - tolerance;
  if (over <= 0) return;
  const crush = T.collision.crushPerSpeed * over * massRatio(spec);
  if (Math.abs(car.roll) > T.air.rollLandLimit) {
    const zone = car.roll > 0 ? 6 : 2;
    dealCrush(car, zone, crush, zone === 2 ? Math.PI / 2 : -Math.PI / 2, slam, events, stats);
  } else {
    dealCrush(car, null, crush, 0, slam, events, stats);
  }
}

/** Resolve the car against every solid in reach. Mutates position (pushed
 * out of penetration), velocity (impulse), yaw rate (lever kick), and the
 * damage ledger. A contact never ends the excursion however hard it lands:
 * the car bends and drives on, and step.ts decides when a car that has
 * stopped moving altogether gets put back on the road. */
export function collideCar(
  spec: CarSpec,
  car: CarState,
  solids: WildObstacle[],
  events: GameEvent[],
  stats: RunStats,
): void {
  const mass = massRatio(spec);
  const hl = T.collision.halfLength;
  const hw = T.collision.halfWidth;

  for (const ob of solids) {
    // Vertical gate: a flight clears what it is higher than, and a trunk
    // whose foot is up a bank the car is below never reaches down to it.
    if (car.y > ob.y + ob.height) continue;
    if (ob.y > car.y + 2) continue;

    const sinH = Math.sin(car.heading);
    const cosH = Math.cos(car.heading);
    // The solid's center in the car frame: `fwd` along the nose, `right`
    // along the right axis (world right is (cos h, -sin h)).
    const dx = ob.x - car.x;
    const dz = ob.z - car.z;
    const fwd = dx * sinH + dz * cosH;
    const right = dx * cosH - dz * sinH;

    // Closest point on the body box to the circle's center.
    const px = clamp(right, -hw, hw);
    const pz = clamp(fwd, -hl, hl);
    let ex = right - px;
    let ez = fwd - pz;
    let d = Math.hypot(ex, ez);
    if (d >= ob.radius) continue;
    if (d < 1e-6) {
      // Center swallowed by the box (a huge step into a thin trunk): take
      // the line from body center to the solid as the normal.
      d = Math.hypot(right, fwd) || 1;
      ex = right / d;
      ez = fwd / d;
      d = 1e-6;
    } else {
      ex /= d;
      ez /= d;
    }
    const penetration = ob.radius - d;

    // Push the body back out along the contact normal, in world space.
    car.x -= (cosH * ex + sinH * ez) * penetration;
    car.z -= (-sinH * ex + cosH * ez) * penetration;

    // The impulse: velocity into the surface comes back at `restitution`,
    // velocity along it keeps `tangentKeep` — then the lever arm turns the
    // net velocity change into spin. Velocity in the car frame is (w, u)
    // on the (right, fwd) axes the normal is expressed in.
    const closing = car.u * ez + car.w * ex;
    if (closing > 0) {
      const tanR = car.w - closing * ex;
      const tanF = car.u - closing * ez;
      const newW = -T.collision.restitution * closing * ex + T.collision.tangentKeep * tanR;
      const newU = -T.collision.restitution * closing * ez + T.collision.tangentKeep * tanF;
      // Lever kick: force at the contact point, torque about the center.
      // Sign check: a nose contact (pz=+hl) whose velocity change points
      // right swings the nose right — heading grows, like positive steer.
      // ...divided by the car's inertia: the same clip that spins a light
      // hatch barely disturbs something that weighs a third more.
      car.yawRate += (T.collision.yawKick / mass) * ((newW - car.w) * pz - (newU - car.u) * px);
      car.u = newU;
      car.w = newW;
      updateSlip(car);
      loadSprings(car, closing, ez);

      const crush =
        T.collision.crushPerSpeed * Math.max(0, closing - T.collision.scuffSpeed) * mass;
      if (crush > 0) {
        dealCrush(
          car,
          damageZoneAt(Math.atan2(ex, ez)),
          crush,
          Math.atan2(ex, ez),
          closing,
          events,
          stats,
        );
      }
    }
  }
}

/** What a contact does to the SPRINGS: the wheels stop, the body does not.
 * `closing` is the speed into the surface, `ez` how much of the contact
 * normal points along the nose (+1 dead ahead, -1 dead astern) — so a
 * head-on dips the nose and a rear-ender lifts it. This is the beat of
 * rocking after a hit that reads as the car having weight. */
function loadSprings(car: CarState, closing: number, ez: number): void {
  const S = T.suspension;
  car.rideRate = clamp(car.rideRate - closing * S.impactHeave, -S.rateMax, S.rateMax);
  car.pitchLoad -= closing * S.impactPitch * ez;
}

/** The ground refusing the car. Off the road the terrain is a solid like
 * any other: below `climbLimit` a rise is a hill the wheels scrabble up and
 * the grade term in car.ts pushes back on, above it the face starts giving
 * the car back its own speed, and at `wallSlope` it is a cliff that takes
 * all of it. Returns how much of this step's move the face refused, 0..1,
 * for the caller to undo — a car cannot be inside a mountain.
 *
 * `gradientAt` answers the terrain's horizontal gradient (dy/dx, dy/dz) at
 * a world position; the uphill direction it gives IS the contact normal,
 * which is why a car meeting a bank at an angle keeps sliding along it
 * instead of stopping dead. */
export function collideSlope(
  spec: CarSpec,
  car: CarState,
  faceSlope: number,
  gradient: { x: number; z: number },
  events: GameEvent[],
  stats: RunStats,
): number {
  const C = T.collision;
  const bite = clamp((faceSlope - C.climbLimit) / (C.wallSlope - C.climbLimit), 0, 1);
  if (bite <= 0) return 0;
  const g = Math.hypot(gradient.x, gradient.z);
  if (g < 1e-6) return 0;
  // The uphill direction in the car frame: `ez` along the nose, `ex` along
  // the right axis (world right is (cos h, -sin h)) — the same (right, fwd)
  // pair collideCar's contact normal lives in.
  const sinH = Math.sin(car.heading);
  const cosH = Math.cos(car.heading);
  const ez = (gradient.x * sinH + gradient.z * cosH) / g;
  const ex = (gradient.x * cosH - gradient.z * sinH) / g;
  const closing = car.u * ez + car.w * ex;
  if (closing <= 0) return 0;

  // Only the refused fraction is taken out of the velocity, and it comes
  // back at `restitution`. What runs ALONG the face is untouched: that is
  // what turns a glancing bank into a berm to lean on rather than a wall.
  const refused = closing * bite;
  const kick = refused * (1 + C.restitution);
  car.u -= kick * ez;
  car.w -= kick * ex;
  updateSlip(car);
  loadSprings(car, refused, ez);

  const crush = C.crushPerSpeed * Math.max(0, refused - C.scuffSpeed) * massRatio(spec);
  if (crush > 0) {
    const angle = Math.atan2(ex, ez);
    dealCrush(car, damageZoneAt(angle), crush, angle, refused, events, stats);
  }
  return bite;
}
