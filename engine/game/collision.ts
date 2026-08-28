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

/** WHAT THE THING ON THE OTHER SIDE DOES ABOUT IT. Returns `bite`: the
 * fraction of a dead-wall exchange this contact actually is, 0..1, plus
 * whether the solid stayed where it was.
 *
 * Held fast by the ground, a solid takes the whole impulse the car can
 * deliver — `(1+e)·closing·mass` — and hands every bit of it back; that is
 * bite 1, and it is the only case the model used to have. Otherwise one of
 * two things gives first, whichever is weaker:
 *
 *   the GROUND'S HOLD → the thing comes out of its bed and the contact is
 *   two free bodies. Bite falls to the mass ratio, so a football-sized
 *   stone is a bang and a scratch (and the stone is the thing that leaves),
 *   while a boulder several times the car's weight is still very nearly a
 *   wall.
 *
 *   its own STRUCTURE → it breaks, and the car pays exactly the impulse
 *   that took and drives through what is left. Trees live here: the small
 *   ones go down under an ordinary excursion, the big ones only when you
 *   are properly committed — and then they take 90 km/h with them.
 *
 * Below the scuff floor nothing gives at all: leaning on a rock in the
 * gravel is not an accident, and it must not quietly delete the rock. */
function meetSolid(
  ob: WildObstacle,
  closing: number,
  carMass: number,
): { bite: number; yields: boolean; broke: boolean } {
  const S = T.collision.solids;
  const wall = { bite: 1, yields: false, broke: false };
  if (closing <= T.collision.scuffSpeed) return wall;
  const delivered = (1 + T.collision.restitution) * closing * carMass;
  const anchor = ob.mass * ob.rooted * S.anchorPerMass;
  if (delivered <= Math.min(ob.snap, anchor)) return wall;
  if (ob.snap <= anchor) {
    return { bite: Math.min(1, ob.snap / delivered), yields: true, broke: true };
  }
  return { bite: ob.mass / (ob.mass + carMass), yields: true, broke: false };
}

/** THE TRIP — the roll a low solid puts into the body. A rock that stands
 * below the car's centre of mass catches the bottom of it and lets the top
 * keep going, which is how a rally car actually rolls: not off a bank, off
 * something small and hard at the side of the road. A trunk, which meets
 * the whole flank at once, does nothing of the sort — so the effect fades
 * out as the solid grows past the middle of the body.
 *
 * `dW` is the sideways velocity the contact took OUT of the car, so it
 * points against the slide: a car sliding to its right is checked leftward
 * at the sill while the body above keeps going, and goes over onto its
 * right — which is negative roll, since positive roll lifts the right side.
 * Past `tripLaunch` the inside wheels genuinely leave the ground and the
 * car is FLYING: car.ts keeps rolling it from there, and whatever it does
 * next it does in the air. */
function tripRoll(car: CarState, ob: WildObstacle, dW: number, mass: number): void {
  const S = T.collision.solids;
  const top = ob.y + ob.height - car.y;
  const low = clamp((S.tripFade - top) / (S.tripFade - S.tripTop), 0, 1);
  if (low <= 0) return;
  const trip = (dW * S.trip * low) / mass;
  car.rollRate += trip;
  if (Math.abs(trip) < S.tripLaunch || car.airborne) return;
  car.airborne = true;
  car.settling = false;
  car.airTime = 0;
  car.vy = Math.abs(trip) * S.tripLift;
}

/** Resolve the car against every solid in reach. Mutates position (pushed
 * out of penetration), velocity (impulse), yaw rate (lever kick), roll (the
 * trip), and the damage ledger. `fell` is how the world is told a solid is
 * no longer standing — the terrain field stops placing it and the renderer
 * is handed the piece to send flying. A contact never ends the excursion
 * however hard it lands: the car bends and drives on, and step.ts decides
 * when a car that has stopped moving altogether gets put back on the road. */
export function collideCar(
  spec: CarSpec,
  car: CarState,
  solids: WildObstacle[],
  events: GameEvent[],
  stats: RunStats,
  fell?: (ob: WildObstacle) => void,
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

    // The impulse: velocity into the surface comes back at `restitution`,
    // velocity along it keeps `tangentKeep` — then the lever arm turns the
    // net velocity change into spin. Velocity in the car frame is (w, u)
    // on the (right, fwd) axes the normal is expressed in.
    const closing = car.u * ez + car.w * ex;
    if (closing <= 0) continue;

    // How much of a WALL this solid turns out to be. Everything below is
    // scaled by it, so one number carries the difference between a boulder
    // and a stone the car flicks into the trees: the speed lost, the paint
    // scrubbed off the flank, the fold in the panels, and the spin.
    const { bite, yields, broke } = meetSolid(ob, closing, spec.mass);
    const e = T.collision.restitution;
    // Only what did NOT give way pushes the car back out: a rock knocked
    // off its bed is not still occupying the ground the car is standing on.
    const push = penetration * (yields ? 1 - bite : 1);
    car.x -= (cosH * ex + sinH * ez) * push;
    car.z -= (-sinH * ex + cosH * ez) * push;

    const tanR = car.w - closing * ex;
    const tanF = car.u - closing * ez;
    // Normal velocity after the exchange — `-e·closing` against a wall,
    // barely dented by something light, and `closing − snap/mass` through
    // something that broke.
    const after = closing - (1 + e) * bite * closing;
    const keep = 1 - (1 - T.collision.tangentKeep) * bite;
    const newW = after * ex + keep * tanR;
    const newU = after * ez + keep * tanF;
    // Lever kick: force at the contact point, torque about the center.
    // Sign check: a nose contact (pz=+hl) whose velocity change points
    // right swings the nose right — heading grows, like positive steer.
    // ...divided by the car's inertia: the same clip that spins a light
    // hatch barely disturbs something that weighs a third more.
    car.yawRate += (T.collision.yawKick / mass) * ((newW - car.w) * pz - (newU - car.u) * px);
    const dW = newW - car.w;
    car.u = newU;
    car.w = newW;
    updateSlip(car);
    loadSprings(car, closing * bite, ez);
    tripRoll(car, ob, dW, mass);

    if (yields) {
      // Out of the world: nothing collides with it again and nothing draws
      // it standing. What is left is a loose body the renderer tumbles,
      // leaving along the contact normal with the momentum the car gave it
      // (capped — past `throwMax` a stone reads as a bullet rather than as
      // something heavy that was hit very hard).
      fell?.(ob);
      // What broke keeps only a share of the closing speed — the impulse
      // that snapped a trunk went into snapping it, not into throwing it,
      // so a felled tree comes down where it stood. What merely came out of
      // the ground leaves with the momentum it was actually given.
      const S = T.collision.solids;
      const speed = broke
        ? closing * S.toppleKeep
        : Math.min(S.throwMax, ((1 + e) * bite * closing * spec.mass) / ob.mass);
      events.push({
        type: "solidBreak",
        solid: ob,
        broke,
        vx: (sinH * ez + cosH * ex) * speed,
        vy: speed * S.throwLift,
        vz: (cosH * ez - sinH * ex) * speed,
      });
    }

    // The car only folds around what it did not move: `bite` is the share
    // of the closing speed the contact actually made it pay.
    const crush =
      T.collision.crushPerSpeed * Math.max(0, closing * bite - T.collision.scuffSpeed) * mass;
    if (crush > 0) {
      dealCrush(
        car,
        damageZoneAt(Math.atan2(ex, ez)),
        crush,
        Math.atan2(ex, ez),
        closing * bite,
        events,
        stats,
      );
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
