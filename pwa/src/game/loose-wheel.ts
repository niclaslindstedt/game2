// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// A WHEEL OFF THE CAR — the one loose thing the generic tumbler
// (tumble.ts) cannot do justice to. A torn-off bumper is a plate that arcs,
// lands and lies there; a wheel is a twenty-kilo flywheel that leaves at
// road speed with its tread already turning at road speed, so what it does
// next is decided by real mechanics the eye knows by heart: it bounces
// high on its tyre, lands rolling and runs on down the road for a long
// way, wanders as it slows, keels over, and spends its last energy
// chattering flat on its face like a dropped coin. Every one of those beats
// is here as PHYSICS rather than as a timeline, because a wheel meets
// things — the ground it was thrown over, the car it came off, a trunk —
// and only a body with mass, inertia and a contact model answers a hit it
// was not scripted for.
//
// It is one rigid cylinder. Its contact with the ground is the deepest
// point of that cylinder against the terrain's own height and slope
// (the support point in the direction of the ground's normal), and every
// contact — ground, chassis, solid — is resolved as an impulse at a point
// with restitution and Coulomb friction, through the wheel's inertia about
// its axle and across it. That is what makes a rolling wheel roll rather
// than skid (the friction at the tread has nothing to do while spin and
// speed agree), a bouncing one lose energy at every touch, and a flat one
// spin itself down against the ground. The only thing the free flight has
// to know beyond gravity is the GYROSCOPE: torque-free rotation of a body
// symmetric about one axis has an exact solution (the transverse spin
// precesses about the axle at a rate set by the two inertias), and it is
// integrated exactly rather than by Euler, because an explicit step on that
// term grows energy at a rate the wheel's 60 rad/s makes ruinous. The
// precession is what keeps a fast wheel upright and lets a slow one fall.
//
// Nothing here writes GameState. The car is read as the box the engine
// collides it with, the solids as the circles the engine placed, and a
// wheel that hits either changes nothing about the run — the engine has
// already charged the contact that tore the wheel off. DOM-free on
// purpose: tests/loose_wheel_test.ts drives one over a plane and asserts
// the beats.

import * as THREE from "three";
import { TUNING, type CarState, type WildObstacle } from "@engine";

/** What a rally wheel and tyre weigh together, kg. */
export const WHEEL_MASS = 18;
/** How much of a solid disc's inertia the wheel carries about its axle —
 * the rim and the tyre are the mass, and they are at the edge. */
const RING = 0.75;
/** What the tyre gives back of the closing speed at a square hit... */
const RESTITUTION = 0.42;
/** ...tapering to nothing under this approach speed, m/s, so a wheel can
 * REST: a floor that bounces every gravitational sag reads as a wheel
 * humming on the spot. */
const BOUNCE_FROM = 1.6;
/** Coulomb friction of the tread on loose ground. */
const GRIP = 0.85;
/** ...and of the tyre against the car's own shell and a trunk, which it
 * slides off rather than bites into. */
const SHELL_GRIP = 0.35;
const SHELL_RESTITUTION = 0.3;
/** Rolling resistance as a share of g — a tyre on a rally verge, which is
 * grass and gravel rather than tarmac. Slow: the wheel rolls a long way. */
const ROLL_RESIST = 0.03;
/** A wheel on its face is a disc spinning against the whole of that face,
 * not one point of tread: what the single contact point cannot spend of
 * its spin, this drag does, per second of contact. It is the difference
 * between a rolling wheel's minute and a fallen one's few seconds. */
const FLAT_DRAG = 3.5;
/** How far over its axle a wheel counts as FLAT rather than rolling: the
 * cosine of the axle's angle off vertical. */
const FLAT_AT = 0.8;
/** Air: what a thrown wheel loses of its spin per second while it is off
 * the ground. Tiny — a wheel in the air keeps its spin — and only in the
 * air, because on the ground the tread would spend speed putting the spin
 * back, and a wheel rolling on a road does not slow at the rate air spins
 * it down. */
const AIR_SPIN_DRAG = 0.05;
/** Under this speed and this spin, and on the ground, the wheel is spent:
 * once it has stayed there this long it sleeps, and if it is lying flat it
 * is laid exactly flat on the ground. A wheel that is slow but still on its
 * tread is NOT asleep — it is about to fall over, and is given a nudge. */
const SLEEP_SPEED = 0.12;
const SLEEP_SPIN = 0.6;
const SLEEP_AFTER = 0.35;
/** How much of the tread's half-width touches the ground when the wheel
 * is on its tread: the CROWN. A tyre's shoulders are rounded, so a leaning
 * wheel is carried on the middle of its tread rather than on the corner
 * of a flat-sided drum — which is the difference between a wheel that
 * keels over past a few degrees of lean and a barrel that stands up to
 * twenty. The face is still the full half-width once the wheel is over. */
const CROWN = 0.35;
/** A wheel rolling to a stop wanders and goes over; one stood exactly
 * upright on a plane never would, and the eye has never seen that. Under
 * this speed, m/s, on its tread, it is leaned the way it already leans at
 * up to this rate, rad/s² — enough to carry it past the crown's own
 * stability, after which gravity has it. */
const TOPPLE_UNDER = 1;
const TOPPLE = 20;
/** Once slow and nearly flat, how fast the last few degrees are taken up
 * so the wheel lies on the ground rather than on one rim point, per
 * second — the coin's last chatter, which the single contact point cannot
 * draw and the eye does not miss. */
const LAY_RATE = 6;
/** The physics substep, s — a wheel at road speed is turning sixty radians
 * a second, and a contact model at frame rate would let it fall through
 * the road between two frames. */
const SUBSTEP = 1 / 240;
/** How much of one long frame is honoured, s. Past this the wheel is
 * stepped no further — a frame that long is a stall, and a wheel that
 * jumps a metre is better than one that costs the next frame too. */
const FRAME_CAP = 0.2;
/** How far around the wheel the standing solids are asked for, m, once a
 * frame; and the finite difference the ground's slope is read over, m. */
const SOLIDS_NEAR = 5;
const SLOPE_STEP = 0.25;
/** Under this much tilt off dead flat (the sine of the axle's angle from
 * vertical) a wheel on its face meets the ground at the CENTRE of that
 * face rather than at a rim point: the whole face is touching, so there
 * is no lever for the ground to tip it with, and it rests instead of
 * chattering from one rim point to the next. */
const FACE_TILT = 0.01;

export type LooseWheel = {
  /** The mesh; its position and quaternion ARE the body's. Its own X axis
   * is the axle, which is how car/wheels.ts builds a wheel. */
  object: THREE.Object3D;
  radius: number;
  halfWidth: number;
  mass: number;
  /** World-frame velocity, m/s, and angular velocity, rad/s. */
  vel: THREE.Vector3;
  spin: THREE.Vector3;
  /** Inertia about the axle and across it, kg·m². */
  axial: number;
  transverse: number;
  /** Whether the wheel has left the car's box since it came off. Until it
   * has, the box does not push it: it was BORN inside it, at the arch, and
   * a contact there would throw it out of the car at whatever speed the
   * push chose. */
  free: boolean;
  /** How long it has been slow and spun down while on the ground, s. */
  still: number;
  /** Frame time not yet spent in substeps, s. */
  owed: number;
  asleep: boolean;
};

/** What a hit is resolved against: the other body's velocity at the point
 * of contact, and what the two surfaces give back and grip with. */
type Surface = {
  vel: THREE.Vector3;
  restitution: number;
  grip: number;
};

const STILL = new THREE.Vector3();
const GROUND: Surface = { vel: STILL, restitution: RESTITUTION, grip: GRIP };
const SHELL: Surface = {
  vel: new THREE.Vector3(),
  restitution: SHELL_RESTITUTION,
  grip: SHELL_GRIP,
};
const SOLID: Surface = { vel: STILL, restitution: SHELL_RESTITUTION, grip: SHELL_GRIP };

/** What the engine's terrain answers about what stands around a point —
 * the two queries `TerrainField` already carries, so `state.terrain` is
 * one of these. */
export type StandingSolids = {
  treesNear: (x: number, z: number, r: number) => readonly WildObstacle[];
  obstaclesNear: (x: number, z: number, r: number) => readonly WildObstacle[];
};

/** A wheel let go from where its mesh stands, with the velocity and spin
 * it left with. `radius` and `halfWidth` are the tyre's, off the car's
 * own spec, so a small car's wheel is a small wheel. */
export function looseWheel(
  object: THREE.Object3D,
  vel: THREE.Vector3,
  spin: THREE.Vector3,
  radius: number,
  halfWidth: number,
  mass = WHEEL_MASS,
): LooseWheel {
  const axial = RING * mass * radius * radius;
  return {
    object,
    radius,
    halfWidth,
    mass,
    vel,
    spin,
    axial,
    transverse: axial / 2 + (mass * halfWidth * halfWidth) / 3,
    free: false,
    still: 0,
    owed: 0,
    asleep: false,
  };
}

/** The velocity a wheel leaves a car with: the car's own at that corner
 * (the yaw rate turns a rear corner sideways in a spin), thrown up and
 * out of the arch — and the spin it keeps, which is the tread still
 * turning at road speed about the axle it was just on. `axle` is that
 * axle as a world direction. */
export function throwWheel(
  car: CarState,
  corner: { fwd: number; right: number },
  axle: THREE.Vector3,
  radius: number,
  kick: { out: number; up: number },
): { vel: THREE.Vector3; spin: THREE.Vector3 } {
  const sinH = Math.sin(car.heading);
  const cosH = Math.cos(car.heading);
  // The corner's own velocity: the body's, plus what the yaw rate adds at
  // `fwd` metres ahead of the middle and `right` metres beside it.
  const u = car.u - car.yawRate * corner.right;
  const w = car.w + car.yawRate * corner.fwd;
  const side = Math.sign(corner.right) || 1;
  const vel = new THREE.Vector3(
    sinH * u + cosH * (w + side * kick.out),
    car.vy + kick.up,
    cosH * u - sinH * (w + side * kick.out),
  );
  // A wheel turning forward about the car's right-hand axle spins
  // NEGATIVELY about +X in this handedness: car-mesh.ts drives the tread by
  // adding speed/radius to rotation.x, and the mesh's own X is the axle
  // (car/wheels.ts), so the same sign is kept here.
  const spin = axle.clone().multiplyScalar(car.u / radius);
  return { vel, spin };
}

const axis = new THREE.Vector3();
const local = new THREE.Vector3();
const inverse = new THREE.Quaternion();
const turn = new THREE.Quaternion();
const normal = new THREE.Vector3();
const support = new THREE.Vector3();
const rc = new THREE.Vector3();
const vc = new THREE.Vector3();
const tangent = new THREE.Vector3();
const dw = new THREE.Vector3();
const scratch = new THREE.Vector3();
const partial = new THREE.Quaternion();

/** Angular velocity change from an impulse `j` applied at `rc` off the
 * centre: `I⁻¹ (rc × j)`, with the inertia diagonal in the wheel's own
 * frame. */
function angularFrom(w: LooseWheel, at: THREE.Vector3, j: THREE.Vector3, out: THREE.Vector3): void {
  out.crossVectors(at, j);
  out.applyQuaternion(inverse.copy(w.object.quaternion).invert());
  out.x /= w.axial;
  out.y /= w.transverse;
  out.z /= w.transverse;
  out.applyQuaternion(w.object.quaternion);
}

/** The inverse effective mass the wheel presents along `dir` at `at`. */
function softness(w: LooseWheel, at: THREE.Vector3, dir: THREE.Vector3): number {
  angularFrom(w, at, dir, dw);
  return 1 / w.mass + scratch.crossVectors(dw, at).dot(dir);
}

/** Resolve one contact at world point `p` with outward normal `n` against
 * `surface`, changing the wheel's velocity and spin. Returns the normal
 * impulse, N·s — zero when the two were already separating. */
function contact(w: LooseWheel, p: THREE.Vector3, n: THREE.Vector3, surface: Surface): number {
  rc.subVectors(p, w.object.position);
  vc.crossVectors(w.spin, rc).add(w.vel).sub(surface.vel);
  const closing = -vc.dot(n);
  if (closing <= 0) return 0;
  // The bounce is the tyre's at a real hit and nothing at a sag: a
  // restitution that fires on the millimetre-a-step gravity puts back is
  // a wheel that never sits down.
  const e = surface.restitution * smoothstep(0, BOUNCE_FROM, closing);
  const jn = ((1 + e) * closing) / softness(w, rc, n);
  scratch.copy(n).multiplyScalar(jn);
  w.vel.addScaledVector(scratch, 1 / w.mass);
  angularFrom(w, rc, scratch, dw);
  w.spin.add(dw);
  // Friction along whatever slide is left at the contact, capped by what
  // the normal impulse can hold. A rolling wheel's tread is still against
  // the ground and this does nothing; a skidding one is dragged toward
  // rolling, and a flat one is spun down.
  vc.crossVectors(w.spin, rc).add(w.vel).sub(surface.vel);
  tangent.copy(vc).addScaledVector(n, -vc.dot(n));
  const slide = tangent.length();
  if (slide > 1e-5) {
    tangent.divideScalar(slide);
    const jt = Math.min(slide / softness(w, rc, tangent), surface.grip * jn);
    scratch.copy(tangent).multiplyScalar(-jt);
    w.vel.addScaledVector(scratch, 1 / w.mass);
    angularFrom(w, rc, scratch, dw);
    w.spin.add(dw);
  }
  return jn;
}

/** The ground's normal under a point, off its slope. */
function groundNormal(ground: (x: number, z: number) => number, x: number, z: number): void {
  const dx = ground(x + SLOPE_STEP, z) - ground(x - SLOPE_STEP, z);
  const dz = ground(x, z + SLOPE_STEP) - ground(x, z - SLOPE_STEP);
  normal.set(-dx, 2 * SLOPE_STEP, -dz).normalize();
}

/** The point of the cylinder furthest along `dir`: the axle end that way,
 * plus the rim in the part of `dir` that lies across the axle. With `dir`
 * down the axle — a wheel on its face — the whole face is level with the
 * ground and its centre is the contact. */
function supportPoint(w: LooseWheel, dir: THREE.Vector3, out: THREE.Vector3): void {
  axis.set(1, 0, 0).applyQuaternion(w.object.quaternion);
  const along = dir.dot(axis);
  const reach = w.halfWidth * (CROWN + (1 - CROWN) * Math.abs(along));
  out.copy(w.object.position).addScaledVector(axis, Math.sign(along) * reach);
  scratch.copy(dir).addScaledVector(axis, -along);
  const tilt = scratch.length();
  if (tilt < FACE_TILT) return;
  out.addScaledVector(scratch.divideScalar(tilt), w.radius);
}

/** The wheel against the car it came off, as the box the engine collides
 * the car with and the wheel as a ball its own radius across. */
function meetCar(w: LooseWheel, car: CarState): void {
  const p = w.object.position;
  const sinH = Math.sin(car.heading);
  const cosH = Math.cos(car.heading);
  const dx = p.x - car.x;
  const dz = p.z - car.z;
  const fwd = dx * sinH + dz * cosH;
  const right = dx * cosH - dz * sinH;
  const up = p.y - car.y;
  const { halfLength, halfWidth, roofY } = TUNING.collision;
  const r = w.radius;
  const outside =
    Math.abs(fwd) > halfLength + r || Math.abs(right) > halfWidth + r || up > roofY + r || up < -r;
  if (!w.free) {
    if (outside) w.free = true;
    return;
  }
  if (outside) return;
  // The nearest point of the box to the wheel's centre, in the car's
  // frame; a centre INSIDE the box leaves by its nearest face.
  const cf = Math.max(-halfLength, Math.min(halfLength, fwd));
  const cr = Math.max(-halfWidth, Math.min(halfWidth, right));
  const cu = Math.max(0, Math.min(roofY, up));
  let nf = fwd - cf;
  let nr = right - cr;
  let nu = up - cu;
  let gap = Math.hypot(nf, nr, nu);
  if (gap < 1e-6) {
    const toEnd = halfLength - Math.abs(fwd);
    const toSide = halfWidth - Math.abs(right);
    const toRoof = roofY - up;
    if (toSide <= toEnd && toSide <= toRoof) {
      nf = 0;
      nr = Math.sign(right) || 1;
      nu = 0;
      gap = -toSide;
    } else if (toEnd <= toRoof) {
      nf = Math.sign(fwd) || 1;
      nr = 0;
      nu = 0;
      gap = -toEnd;
    } else {
      nf = 0;
      nr = 0;
      nu = 1;
      gap = -toRoof;
    }
  } else {
    nf /= gap;
    nr /= gap;
    nu /= gap;
  }
  if (gap >= r) return;
  normal.set(nf * sinH + nr * cosH, nu, nf * cosH - nr * sinH);
  p.addScaledVector(normal, r - gap);
  support.copy(p).addScaledVector(normal, -r);
  SHELL.vel.set(sinH * car.u + cosH * car.w, car.vy, cosH * car.u - sinH * car.w);
  contact(w, support, normal, SHELL);
}

/** The wheel against a standing solid: a post the engine's circle and
 * height tall, met by the wheel as a ball. */
function meetSolid(w: LooseWheel, solid: WildObstacle): void {
  const p = w.object.position;
  const r = w.radius;
  if (p.y - r > solid.y + solid.height || p.y + r < solid.y) return;
  const dx = p.x - solid.x;
  const dz = p.z - solid.z;
  const d = Math.hypot(dx, dz);
  const reach = solid.radius + r;
  if (d >= reach) return;
  if (d < 1e-6) normal.set(1, 0, 0);
  else normal.set(dx / d, 0, dz / d);
  p.addScaledVector(normal, reach - d);
  support.copy(p).addScaledVector(normal, -r);
  contact(w, support, normal, SOLID);
}

/** The wheel against the ground: its deepest point against the height
 * there, pushed out along the slope's normal and hit as a contact. Returns
 * whether it touched. */
function meetGround(w: LooseWheel, ground: (x: number, z: number) => number): boolean {
  const p = w.object.position;
  groundNormal(ground, p.x, p.z);
  scratch.copy(normal).negate();
  supportPoint(w, scratch, support);
  const depth = ground(support.x, support.z) - support.y;
  if (depth <= 0) return false;
  // The vertical penetration of a point under a plane is its normal
  // penetration over the normal's own rise: out along the normal by that.
  p.addScaledVector(normal, depth * normal.y);
  support.addScaledVector(normal, depth * normal.y);
  contact(w, support, normal, GROUND);
  return true;
}

/** Torque-free rotation of a body symmetric about its X axis, exactly: the
 * spin about the axle is constant and the spin across it precesses about
 * the axle at `ωx (Ia − It) / It`. */
function precess(w: LooseWheel, dt: number): void {
  local.copy(w.spin).applyQuaternion(inverse.copy(w.object.quaternion).invert());
  const rate = (local.x * (w.axial - w.transverse)) / w.transverse;
  const c = Math.cos(rate * dt);
  const s = Math.sin(rate * dt);
  const y = local.y * c - local.z * s;
  const z = local.y * s + local.z * c;
  local.y = y;
  local.z = z;
  w.spin.copy(local).applyQuaternion(w.object.quaternion);
}

/** How far over the wheel lies: |cos| of the axle's angle from vertical,
 * 0 on its tread and 1 flat on its face. */
export function flatness(w: LooseWheel): number {
  return Math.abs(axis.set(1, 0, 0).applyQuaternion(w.object.quaternion).y);
}

/** Turn the axle toward vertical by the shortest way, `t` of the distance,
 * keeping whatever the wheel's own spin about that axle is showing. */
function layFlat(w: LooseWheel, t: number): void {
  axis.set(1, 0, 0).applyQuaternion(w.object.quaternion);
  scratch.set(0, axis.y < 0 ? -1 : 1, 0);
  turn.setFromUnitVectors(axis, scratch);
  if (t >= 1) w.object.quaternion.premultiply(turn);
  else w.object.quaternion.premultiply(partial.identity().slerp(turn, t));
}

function smoothstep(a: number, b: number, t: number): number {
  const u = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return u * u * (3 - 2 * u);
}

function substep(
  w: LooseWheel,
  dt: number,
  ground: (x: number, z: number) => number,
  car: CarState | null,
  trees: readonly WildObstacle[],
  rocks: readonly WildObstacle[],
): void {
  const g = TUNING.air.gravity;
  const p = w.object.position;
  w.vel.y -= g * dt;
  precess(w, dt);
  p.addScaledVector(w.vel, dt);
  const rate = w.spin.length();
  if (rate > 1e-9) {
    turn.setFromAxisAngle(scratch.copy(w.spin).divideScalar(rate), rate * dt);
    w.object.quaternion.premultiply(turn).normalize();
  }

  if (car) meetCar(w, car);
  for (const solid of trees) meetSolid(w, solid);
  for (const solid of rocks) meetSolid(w, solid);
  const grounded = meetGround(w, ground);
  if (!grounded) {
    w.spin.multiplyScalar(Math.exp(-AIR_SPIN_DRAG * dt));
    w.still = 0;
    return;
  }

  const flat = flatness(w);
  if (flat < FLAT_AT) {
    // Rolling: the tread's own resistance, spent on the travel and on the
    // spin together so the two stay in step rather than friction putting
    // the speed back from the spin a moment later.
    const along = Math.hypot(w.vel.x, w.vel.z);
    if (along > 1e-6) {
      const f = Math.max(0, 1 - (ROLL_RESIST * g * dt) / along);
      w.vel.x *= f;
      w.vel.z *= f;
      w.spin.multiplyScalar(f);
    }
    // ...and, nearly stopped, it goes over the way it is leaning. A tip is
    // a turn about the CONTACT — the tread stays put and the centre moves
    // over it — so the centre is given the velocity that turn implies, or
    // the tread's own friction reads the lean as a sideways skid and
    // cancels it on the next step.
    if (along < TOPPLE_UNDER) {
      axis.set(1, 0, 0).applyQuaternion(w.object.quaternion);
      const lean = axis.y !== 0 ? Math.sign(axis.y) : Math.random() < 0.5 ? -1 : 1;
      scratch.crossVectors(scratch.set(0, 1, 0), axis).normalize();
      dw.copy(scratch).multiplyScalar(-lean * TOPPLE * (1 - along / TOPPLE_UNDER) * dt);
      w.spin.add(dw);
      rc.subVectors(p, support);
      w.vel.add(scratch.crossVectors(dw, rc));
    }
    w.still = 0;
    return;
  }
  // On its face: the whole disc is dragging, not one point of it.
  const f = Math.exp(-FLAT_DRAG * dt);
  w.vel.x *= f;
  w.vel.z *= f;
  w.spin.multiplyScalar(f);
  const slow = w.vel.length() < SLEEP_SPEED && w.spin.length() < SLEEP_SPIN;
  if (!slow) {
    w.still = 0;
    return;
  }
  // Nearly flat and spent: take up the last degrees, and sleep.
  layFlat(w, 1 - Math.exp(-LAY_RATE * dt));
  w.still += dt;
  if (w.still >= SLEEP_AFTER) {
    layFlat(w, 1);
    w.vel.set(0, 0, 0);
    w.spin.set(0, 0, 0);
    p.y = ground(p.x, p.z) + w.halfWidth;
    w.asleep = true;
  }
}

const NOTHING: readonly WildObstacle[] = [];

/**
 * One frame of one loose wheel, in fixed substeps. `ground` is the drawn
 * ground, `car` the car it came off (null once nothing is there to hit),
 * `standing` the engine's solids, asked once a frame for what is within
 * reach. Returns false once the wheel has settled and is scenery.
 */
export function stepLooseWheel(
  w: LooseWheel,
  dt: number,
  ground: (x: number, z: number) => number,
  car: CarState | null,
  standing: StandingSolids | null = null,
): boolean {
  if (w.asleep) return false;
  const p = w.object.position;
  const reach = SOLIDS_NEAR + w.radius;
  const trees = standing ? standing.treesNear(p.x, p.z, reach) : NOTHING;
  const rocks = standing ? standing.obstaclesNear(p.x, p.z, reach) : NOTHING;
  w.owed = Math.min(FRAME_CAP, w.owed + dt);
  while (w.owed >= SUBSTEP && !w.asleep) {
    substep(w, SUBSTEP, ground, car, trees, rocks);
    w.owed -= SUBSTEP;
  }
  return !w.asleep;
}
