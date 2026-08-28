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
import { KERB_MARKER, type KerbMarker, type WildObstacle } from "../mapgen/index.ts";
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
 * bite 1, and it is the only case in which nothing gives. Otherwise one of
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

/**
 * R26 — THE ANTI-CUT BLOCKS, resolved as what they are: things the car
 * rides OVER rather than into.
 *
 * A block is a slab of concrete a hand's width proud of the verge, laid
 * along the inside of a corner precisely where a driver wants to put two
 * wheels. Nothing about hitting one is a crash — the panels never touch it
 * and the body never folds — but it is the opposite of free, and this is
 * everything it costs:
 *
 *   SPEED   the tyres climb it and drop off the far side, and a share of
 *           what the car was carrying goes into doing that.
 *   THE CAR the wheels on one side go up while the other side stays down,
 *           so the body rolls away from it and rocks on its springs. That
 *           is the wobble, and it is the part the player feels first.
 *   THE LINE the block shoves the car back out of the inside of the corner
 *           and drags the nose round with it — which is exactly the job an
 *           anti-cut block is laid to do.
 *
 * A block is treated as a circle like every other solid, and the radius is
 * its half-width because that is the dimension across the road. `kerbFrom`
 * keeps one block to one bite: it is 0.6 m of road and the car is inside
 * one for several steps at any speed.
 */
export function clipKerbs(
  spec: CarSpec,
  car: CarState,
  now: number,
  blocks: KerbMarker[],
  events: GameEvent[],
): void {
  const K = T.collision.kerb;
  if (now < car.kerbFrom) return;
  // A car in the air is over the whole thing; one whose wheels are well
  // above the slab has already climbed something else to get there.
  if (car.airborne) return;

  // A heavier car is shrugged around less by the same slab, exactly as it
  // is by the same trunk.
  const mass = massRatio(spec);
  const hl = T.collision.halfLength;
  const hw = T.collision.halfWidth;
  const radius = KERB_MARKER.block.width / 2;
  const sinH = Math.sin(car.heading);
  const cosH = Math.cos(car.heading);

  for (const block of blocks) {
    if (Math.abs(car.y - block.y) > KERB_MARKER.block.height + 0.5) continue;
    // The block's centre in the car frame: `fwd` along the nose, `right`
    // along the right axis — the same box the body meets a trunk with.
    const dx = block.x - car.x;
    const dz = block.z - car.z;
    const fwd = dx * sinH + dz * cosH;
    const right = dx * cosH - dz * sinH;
    const ex = right - clamp(right, -hw, hw);
    const ez = fwd - clamp(fwd, -hl, hl);
    if (Math.hypot(ex, ez) >= radius) continue;

    // Closing speed into the block, measured along the line from the body
    // to it — a car running down the row parallel to the road barely
    // touches one, a car cutting across the apex mounts it square.
    const d = Math.hypot(ex, ez) || 1;
    const nx = ex / d;
    const nz = ez / d;
    const closing = car.u * nz + car.w * nx;
    if (closing <= K.clipSpeed) continue;

    car.kerbFrom = now + K.again;
    // Everything the car is carrying pays the same share: a block does not
    // care which way the speed was pointing, only that the wheels had to
    // climb it.
    car.u *= K.keep;
    car.w *= K.keep;
    // ...then the shove back out of the inside, along the contact normal,
    // with the nose dragged round after it.
    const shove = (closing * K.shove) / mass;
    car.u -= nz * shove;
    car.w -= nx * shove;
    car.yawRate -= (Math.sign(right) * closing * K.yaw) / mass;
    updateSlip(car);

    // The body over the wheels. Positive roll lifts the car's RIGHT side,
    // so a block under the right wheels rolls the car positive — and the
    // lift is capped well under `solids.tripLaunch`, because a kerb that
    // can put a car on its roof is a barrier and not a kerb.
    const lift = Math.min(K.liftMax, (closing * K.lift) / mass);
    car.rollRate += Math.sign(right) * lift;
    loadSprings(car, closing * K.heave, nz);
    events.push({ type: "kerbHit", speed: closing });
    // One bite per step: a car crossing two blocks at once has ridden over
    // a kerb, not over two of them, and it should thump once.
    return;
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

// ── THE OTHER CAR ─────────────────────────────────────────────────────────
// Everything above is the car against something the world is holding. This
// is the car against something that is DRIVING: the crew you have caught,
// or the one that has caught you. It is a different problem — neither side
// is anchored, so the momentum has to go somewhere real — and it is the one
// contact in the game where both ledgers are written at once.
//
// The body is a CAPSULE here rather than the box the solids meet: a segment
// down the middle of the car with the box's own half-width as its radius.
// Two boxes need a separating-axis solve to find a normal, and the normal
// it yields snaps between faces as they slide past each other, which is
// exactly the contact that must feel smooth — the long scrape down a flank.
// Two capsules give one continuous normal and round the corners off, which
// is what a bumper actually is.

/** One side of a car-to-car contact: the car, and where its half of the
 * damage is booked. */
export type ContactSide = {
  spec: CarSpec;
  car: CarState;
  events: GameEvent[];
  stats: RunStats;
};

/** Half the length of the capsule's spine, m — the box's half-length with
 * the cap radius taken off, so the capsule ends where the box does. */
const SPINE = T.collision.halfLength - T.collision.halfWidth;

/** Where two spines come closest, as the parameters along each (0..1 from
 * `-SPINE` to `+SPINE`). Ericson's segment-to-segment solve, flattened to
 * the ground plane and to two segments of equal, non-zero length — which is
 * every pair of cars, so the degenerate branches are not needed. */
function nearestOnSpines(
  ax: number,
  az: number,
  adx: number,
  adz: number,
  bx: number,
  bz: number,
  bdx: number,
  bdz: number,
): { s: number; t: number } {
  // The spines as (start, direction × full length).
  const ux = adx * 2 * SPINE;
  const uz = adz * 2 * SPINE;
  const vx = bdx * 2 * SPINE;
  const vz = bdz * 2 * SPINE;
  const wx = ax - adx * SPINE - (bx - bdx * SPINE);
  const wz = az - adz * SPINE - (bz - bdz * SPINE);
  const a = ux * ux + uz * uz;
  const b = ux * vx + uz * vz;
  const c = vx * vx + vz * vz;
  const d = ux * wx + uz * wz;
  const e = vx * wx + vz * wz;
  const det = a * c - b * b;
  // Parallel spines — two cars nose to tail in the same line — leave the
  // solve singular. Pin one end and slide the other along it.
  let s = det < 1e-8 ? 0 : clamp((b * e - c * d) / det, 0, 1);
  let t = clamp((b * s + e) / c, 0, 1);
  s = clamp((b * t - d) / a, 0, 1);
  return { s, t };
}

/** Resolve one pair of cars. Mutates both: position (pushed apart by the
 * share of the overlap each one's mass earns), velocity (a two-body impulse
 * with a friction term along the contact), yaw rate (the lever arm on each
 * body), the springs, and both damage ledgers.
 *
 * Contacts are only ever resolved between cars that are both ON THE ROAD.
 * A car still in the start control is not somewhere the world can reach —
 * which is what lets the whole field spawn on one start line. */
export function collideCars(a: ContactSide, b: ContactSide): void {
  const C = T.collision.cars;
  const carA = a.car;
  const carB = b.car;
  // One of them is over the other: a landing on somebody's roof is not this
  // model's contact to resolve.
  if (Math.abs(carA.y - carB.y) > C.reach) return;

  const sinA = Math.sin(carA.heading);
  const cosA = Math.cos(carA.heading);
  const sinB = Math.sin(carB.heading);
  const cosB = Math.cos(carB.heading);
  const { s, t } = nearestOnSpines(carA.x, carA.z, sinA, cosA, carB.x, carB.z, sinB, cosB);
  // Back from the parameters to the world points, as offsets from each
  // car's own centre: the lever arms the yaw kick needs.
  const raF = (s * 2 - 1) * SPINE;
  const rbF = (t * 2 - 1) * SPINE;
  const pax = carA.x + sinA * raF;
  const paz = carA.z + cosA * raF;
  const pbx = carB.x + sinB * rbF;
  const pbz = carB.z + cosB * rbF;

  let nx = pbx - pax;
  let nz = pbz - paz;
  let d = Math.hypot(nx, nz);
  const reach = T.collision.halfWidth * 2;
  if (d >= reach) return;
  // How far inside each other they are, read off the spines BEFORE any
  // fallback normal replaces the measurement — a car that has been put
  // inside another one is fully overlapped, not somehow further apart.
  const penetration = reach - d;
  if (d < 1e-6) {
    // Spines lying along each other (two cars nose to tail on one line, or
    // one dropped on top of the other): there is no direction between the
    // closest points to take, so use the line between the two centres, and
    // failing that an arbitrary axis — anything but a zero normal, which
    // would push nothing apart forever.
    nx = carB.x - carA.x;
    nz = carB.z - carA.z;
    d = Math.hypot(nx, nz);
    if (d < 1e-6) {
      nx = 1;
      nz = 0;
      d = 1;
    }
  }
  nx /= d;
  nz /= d;

  // World velocities, contact point included: a car swinging its tail into
  // the one beside it delivers the tail's speed, not the hub's. The engine's
  // right axis is (cos h, -sin h), so a point `r` ahead of centre moves at
  // `yawRate × r` along it as the heading grows.
  const vax = carA.u * sinA + carA.w * cosA + carA.yawRate * raF * cosA;
  const vaz = carA.u * cosA - carA.w * sinA - carA.yawRate * raF * sinA;
  const vbx = carB.u * sinB + carB.w * cosB + carB.yawRate * rbF * cosB;
  const vbz = carB.u * cosB - carB.w * sinB - carB.yawRate * rbF * sinB;
  const relX = vax - vbx;
  const relZ = vaz - vbz;
  const closing = relX * nx + relZ * nz;
  if (closing <= 0) return;

  const mA = a.spec.mass;
  const mB = b.spec.mass;
  const invA = 1 / mA;
  const invB = 1 / mB;
  const invSum = invA + invB;
  // Along the normal: the exchange. Across it: friction, which bleeds the
  // relative slide by whatever `tangentKeep` does not keep.
  const jn = ((1 + C.restitution) * closing) / invSum;
  const tanX = relX - closing * nx;
  const tanZ = relZ - closing * nz;
  const jt = (1 - C.tangentKeep) / invSum;
  const impX = -(jn * nx + jt * tanX);
  const impZ = -(jn * nz + jt * tanZ);

  // Out of each other, by the share of the overlap each one's mass earns —
  // the lighter car gives more ground, exactly as it takes more speed.
  carA.x -= nx * penetration * (invA / invSum);
  carA.z -= nz * penetration * (invA / invSum);
  carB.x += nx * penetration * (invB / invSum);
  carB.z += nz * penetration * (invB / invSum);

  applyContact(a, impX * invA, impZ * invA, sinA, cosA, raF, nx, nz);
  applyContact(b, -impX * invB, -impZ * invB, sinB, cosB, rbF, -nx, -nz);

  // What each side PAID, m/s: the share of the closing speed its own mass
  // could not refuse. It is what the panels fold around, and — unlike the
  // closing speed itself — it is what makes a heavy car shrug off the light
  // one that ran into it.
  const share = C.crushShare * T.collision.crushPerSpeed;
  dealContactCrush(a, closing * (mB / (mA + mB)), share, sinA, cosA, nx, nz);
  dealContactCrush(b, closing * (mA / (mA + mB)), share, sinB, cosB, -nx, -nz);
}

/** Spend one side's half of a car-to-car impulse: the velocity change into
 * the body frame, the lever arm's yaw kick, and the springs. `dvx/dvz` is
 * the world velocity change, `(nx, nz)` the contact normal pointing AWAY
 * from this car, and `rF` how far ahead of its centre the contact sits. */
function applyContact(
  side: ContactSide,
  dvx: number,
  dvz: number,
  sinH: number,
  cosH: number,
  rF: number,
  nx: number,
  nz: number,
): void {
  const car = side.car;
  // Into the car frame: `dU` along the nose, `dW` along the right axis.
  const dU = dvx * sinH + dvz * cosH;
  const dW = dvx * cosH - dvz * sinH;
  car.u += dU;
  car.w += dW;
  updateSlip(car);
  // The contact sits on the spine, so its only lever is along the nose —
  // sideways velocity change at a point ahead of centre swings the nose
  // that way, which is the tap that puts a car round.
  car.yawRate += (T.collision.cars.yawKick / massRatio(side.spec)) * dW * rF;
  const ez = nx * sinH + nz * cosH;
  loadSprings(car, Math.hypot(dU, dW), ez);
}

/** Book one side's bodywork. `paid` is the closing speed this car's mass
 * could not refuse, m/s; `perSpeed` the metres of fold each of them costs. */
function dealContactCrush(
  side: ContactSide,
  paid: number,
  perSpeed: number,
  sinH: number,
  cosH: number,
  nx: number,
  nz: number,
): void {
  const crush = perSpeed * Math.max(0, paid - T.collision.scuffSpeed) * massRatio(side.spec);
  if (crush <= 0) return;
  // The struck zone: the contact normal read in the car's own frame, where
  // `ez` is along the nose and `ex` along the right axis.
  const ez = nx * sinH + nz * cosH;
  const ex = nx * cosH - nz * sinH;
  const angle = Math.atan2(ex, ez);
  dealCrush(side.car, damageZoneAt(angle), crush, angle, paid, side.events, side.stats);
}
