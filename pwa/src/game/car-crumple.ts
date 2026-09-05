// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// HOW SHEET METAL FOLDS — the field that turns the engine's damage ledger
// into a displacement of every vertex on the car. Pure arithmetic over a
// vertex's REST position: no three.js, no DOM, so the root suite can hold
// the shape to its rules and every mesh on the car (the shell, the lenses,
// the bolt-on panels, the cabin) is bent by one function and stays joined.
//
// The full-fat way to do this is a soft body — Wreckfest builds every panel
// as its own piece with a material and lets the physics squash the lot —
// and it is out of the question on a phone. The shortcut the whole trade
// uses instead is a displacement field driven by a handful of control
// values with a falloff (the ledger's eight zones, belly and roof are the
// controls here), and the realism is all in the SHAPE of that field:
//
// - The metal TELESCOPES. A hit face folds back from its rim, and the fold
//   dies out with depth: the bumper goes furthest, the bulkhead not at all.
//   A car that has hit something square is shorter, not smaller.
// - Metal that is pushed in has to go somewhere, so the crush zone BULGES
//   outward through its own surface — a bonnet tents, a wing bows out.
// - It CORRUGATES: a compressed panel buckles in an accordion of creases
//   across the fold, which is the one shape a crumple is recognised by.
// - It TEARS: a low-frequency noise over the rest position roughens the
//   folded metal. Over the position, never over the vertex index — this
//   shell is flat-shaded and non-indexed, so two triangles meeting at a
//   corner hold two copies of that corner, and anything hashed per vertex
//   pulls the copies apart into a burst of splinters. Two copies of one
//   point evaluate one field to one answer, so the skin stays closed.
// - The FRAME KINKS. A corner that took more than the other bends the
//   whole nose or tail section about the bulkhead, toward the hit, and a
//   square hit drops it; the cabin stays straight. Cheap, and the thing a
//   real wreck is recognised by from across a car park.
//
// The belly sags and the roof caves on top of that, as the two faces the
// plan-view ring has no room for.

import { DAMAGE_ZONES } from "@engine";

/** What the field needs to know about the body it is bending. */
export type CrumpleFrame = {
  /** The body's reach from its centre at each bearing, m — `RIM_BINS`
   * bins round the compass from the nose, clockwise in plan. */
  rim: Float32Array;
  /** The belt line's half-width, m. */
  halfWidth: number;
  /** The underside, the widest line and the roof, m above the wheel plane. */
  floorY: number;
  beltY: number;
  roofY: number;
  /** The caps, m along the car. */
  noseZ: number;
  tailZ: number;
};

/** The subset of the ledger the field reads: crush in metres per face. */
export type CrumpleLedger = {
  zones: readonly number[];
  belly: number;
  roof: number;
};

export const RIM_BINS = 48;

/** How far the fold reaches at full crush, as a multiple of the ledger's
 * metres: a head-on at 100 km/h writes a third of a metre down, and the
 * nose it leaves has to read as half a metre shorter and a wreck, not as a
 * bumper pushed in — the front of a car that has hit something square is
 * the part that no longer exists. */
export const FOLD = 1.6;
/** ...and at a flank, where the ledger's same metre is a door skin driven
 * toward the seats rather than an engine bay collapsing: a severe side
 * impact intrudes a third of a metre, and past that the sheet would stand
 * inside the cabin it is meant to be closing. */
export const FOLD_FLANK = 0.9;
/** How deep into the body a fold at a cap reaches, m — the engine bay or
 * the boot, up to the bulkhead. Past it the metal is unmoved. */
const REACH_END = 0.95;
/** ...and into a flank, m: a door skin folds in, the tunnel behind it
 * does not. */
const REACH_FLANK = 0.5;
/** Outward bulge of the crumple zone as a share of the fold's rim depth:
 * the displaced metal tenting up and out through its own surface... */
const BULGE = 0.5;
/** ...and the share of that a FLANK keeps. A folded cap has a bonnet or a
 * boot lid to tent; a folded door has a roof rail over it that a side
 * impact barely lifts. */
const BULGE_FLANK = 0.3;
/** The corrugation's amplitude at the rim as a share of the fold... */
const RIPPLE = 0.22;
/** ...and its wavelength, m — the pitch of the creases across a crumpled
 * panel. */
const RIPPLE_LENGTH = 0.2;
/** The tear's amplitude as a share of the fold, and the size of its
 * features, m. Coarser than the ripple, so the two read as different
 * things rather than as one noise. */
const TEAR = 0.3;
const TEAR_SCALE = 0.3;
/** How far a folded section bends toward the corner that took the hit, rad
 * per metre of difference between the two corners' folds... */
const KINK_YAW = 0.55;
/** ...and how far a square hit drops the section, rad per metre of fold. */
const KINK_PITCH = 0.3;
/** The kink's hinge: this far behind the cap, m — the bulkhead — and the
 * length it bends over rather than creasing at, m. */
const HINGE_BACK = 1.05;
const HINGE_BLEND = 0.55;
/** The body sits this much lower per metre of belly crush (shot springs),
 * and its low panels wrinkle by this share of it. */
const BELLY_SAG = 0.6;
const BELLY_WRINKLE = 0.5;
/** THE CAVED ROOF. How far the deck comes down per metre of roof crush —
 * more than one, as the belly's sag is less: the ledger measures the fold,
 * and a roof folding takes the pillars under it with it... */
const ROOF_FOLD = 1.3;
/** ...and how far over, as a share of that: a roof does not come straight
 * down, it goes over to the side the car was turning onto. */
const ROOF_LEAN = 0.45;
/** The floor no vertex may be pushed under, m — the shadow plane. */
const FLOOR = 0.05;

/** Hash a lattice point to 0..1 — any cheap deterministic mix works; the
 * shape only has to look torn, not be reproducible across sessions. */
function hash(ix: number, iy: number, iz: number): number {
  const x = Math.sin(ix * 127.1 + iy * 311.7 + iz * 74.7) * 43758.5453;
  return x - Math.floor(x);
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Value noise over metres, -1..1: trilinear over a hashed lattice, so it
 * is continuous — which is the whole point of it. */
export function noise(x: number, y: number, z: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const fx = smooth(x - ix);
  const fy = smooth(y - iy);
  const fz = smooth(z - iz);
  const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
  const x00 = lerp(hash(ix, iy, iz), hash(ix + 1, iy, iz), fx);
  const x10 = lerp(hash(ix, iy + 1, iz), hash(ix + 1, iy + 1, iz), fx);
  const x01 = lerp(hash(ix, iy, iz + 1), hash(ix + 1, iy, iz + 1), fx);
  const x11 = lerp(hash(ix, iy + 1, iz + 1), hash(ix + 1, iy + 1, iz + 1), fx);
  return lerp(lerp(x00, x10, fy), lerp(x01, x11, fy), fz) * 2 - 1;
}

/** The body's reach at each bearing, from a rest position buffer (x, y, z
 * triples) — the shell's, which is the outline everything else sits
 * inside. A bin nothing lands in takes its neighbours' reach. */
export function rimOf(rest: ArrayLike<number>): Float32Array {
  const rim = new Float32Array(RIM_BINS);
  for (let i = 0; i + 2 < rest.length; i += 3) {
    const x = rest[i];
    const z = rest[i + 2];
    const r = Math.hypot(x, z);
    const bin = binOf(Math.atan2(x, z));
    if (r > rim[bin]) rim[bin] = r;
  }
  for (let pass = 0; pass < RIM_BINS; pass++) {
    let holes = 0;
    for (let b = 0; b < RIM_BINS; b++) {
      if (rim[b] > 0) continue;
      const prev = rim[(b + RIM_BINS - 1) % RIM_BINS];
      const next = rim[(b + 1) % RIM_BINS];
      if (prev > 0 || next > 0) rim[b] = Math.max(prev, next);
      else holes++;
    }
    if (holes === 0) break;
  }
  return rim;
}

function binOf(bearing: number): number {
  const t = (bearing / (Math.PI * 2)) * RIM_BINS;
  return ((Math.round(t) % RIM_BINS) + RIM_BINS) % RIM_BINS;
}

/** The rim's reach at a bearing, interpolated between bins. */
function rimAt(rim: Float32Array, bearing: number): number {
  const t = (bearing / (Math.PI * 2)) * RIM_BINS;
  const lo = Math.floor(t);
  const frac = t - lo;
  const a = rim[((lo % RIM_BINS) + RIM_BINS) % RIM_BINS];
  const b = rim[(((lo + 1) % RIM_BINS) + RIM_BINS) % RIM_BINS];
  return a + (b - a) * frac;
}

/** The ledger's crush at a bearing, m — blended between the two nearest
 * zones so a fold wraps a corner instead of stepping at it. */
export function crushAt(zones: readonly number[], bearing: number): number {
  const t = bearing / ((Math.PI * 2) / DAMAGE_ZONES);
  const lo = Math.floor(t);
  const frac = t - lo;
  const a = ((lo % DAMAGE_ZONES) + DAMAGE_ZONES) % DAMAGE_ZONES;
  const b = (a + 1) % DAMAGE_ZONES;
  return zones[a] * (1 - frac) + zones[b] * frac;
}

/** A vertex bent by the ledger. `out` receives the position; the return
 * value is how hard the metal folded at that vertex, m of local crush —
 * what the paint's scuffing is read from. */
export function crumple(
  ledger: CrumpleLedger,
  frame: CrumpleFrame,
  x0: number,
  y0: number,
  z0: number,
  out: { x: number; y: number; z: number },
): number {
  const bearing = Math.atan2(x0, z0);
  const r = Math.hypot(x0, z0);
  const crush = crushAt(ledger.zones, bearing);
  const zones = ledger.zones;

  let x = x0;
  let y = y0;
  let z = z0;
  let local = 0;

  // THE KINK: the nose section, then the tail, bent about its bulkhead.
  const kink = (ahead: number, over: number, right: number, left: number, square: number): void => {
    if (ahead <= 0) return;
    const t = smooth(Math.min(1, ahead / HINGE_BLEND));
    const yaw = KINK_YAW * (right - left) * FOLD;
    const pitch = KINK_PITCH * square * FOLD;
    x += over * t * yaw * ahead;
    y -= t * pitch * ahead;
  };
  const front = (zones[7] + 2 * zones[0] + zones[1]) / 4;
  const rear = (zones[3] + 2 * zones[4] + zones[5]) / 4;
  kink(z0 - (frame.noseZ - HINGE_BACK), 1, zones[1], zones[7], front);
  kink(frame.tailZ + HINGE_BACK - z0, 1, zones[3], zones[5], rear);

  if (crush > 0 && r > 1e-6) {
    // THE FOLD: back from the rim, dying out with depth. A cap folds deep
    // (the whole engine bay), a flank shallow (the door skin).
    const along = Math.abs(z0 / r);
    const endness = along * along;
    const reach = REACH_FLANK + (REACH_END - REACH_FLANK) * endness;
    const depth = Math.max(0, rimAt(frame.rim, bearing) - r);
    const u = Math.min(1, depth / reach);
    const die = (1 - u) * (1 - u);
    const fold = crush * (FOLD_FLANK + (FOLD - FOLD_FLANK) * endness);
    local = crush * die;
    const inward = Math.min(fold * die, r * 0.8);
    x -= (x0 / r) * inward;
    z -= (z0 / r) * inward;

    // The metal that did not go in went OUT, through the section's own
    // surface: up off a deck, sideways off a flank, down off the floor.
    const coreY = (frame.floorY + frame.roofY) / 2;
    let mx = x0 / frame.halfWidth;
    let my = (y0 - coreY) / ((frame.roofY - frame.floorY) / 2);
    const ml = Math.hypot(mx, my);
    if (ml > 1e-6) {
      mx /= ml;
      my /= ml;
    } else {
      mx = 0;
      my = 1;
    }
    const bulge =
      BULGE * (BULGE_FLANK + (1 - BULGE_FLANK) * endness) * fold * Math.sin(Math.PI * u);
    const ripple =
      RIPPLE * fold * (1 - u) * Math.sin((Math.PI * 2 * depth) / RIPPLE_LENGTH + bearing * 3);
    const tear = TEAR * fold * (1 - u) * noise(x0 / TEAR_SCALE, y0 / TEAR_SCALE, z0 / TEAR_SCALE);
    const outward = bulge + ripple + tear;
    x += mx * outward;
    y += my * outward;
    // ...and a share of the tear along the fold, so the creases are not
    // all in one plane.
    const tx = z0 / r;
    const tz = -x0 / r;
    const sideways =
      TEAR * 0.5 * fold * (1 - u) * noise(z0 / TEAR_SCALE + 7.3, y0 / TEAR_SCALE, x0 / TEAR_SCALE);
    x += tx * sideways;
    z += tz * sideways;
  }

  // THE BELLY: the whole body settles on its shot springs, and the low
  // panels wrinkle — a beaten floorpan reads in the rocker line.
  if (ledger.belly > 0) {
    const low = Math.max(0, 1 - (y0 - frame.floorY) / (frame.roofY - frame.floorY));
    y -= ledger.belly * BELLY_SAG * low;
    const wrinkle = ledger.belly * low * BELLY_WRINKLE * noise(x0 * 4 + 3.1, y0 * 4, z0 * 4);
    x += wrinkle;
    z += wrinkle;
    local += ledger.belly * low;
  }

  // THE ROOF: the one fold a car cannot get without having been upside
  // down. Only the greenhouse moves — the deck comes down and goes over,
  // the pillars under it take a share, and the waist and everything below
  // it stay where they were.
  if (ledger.roof > 0) {
    const high = Math.min(1, Math.max(0, (y0 - frame.beltY) / (frame.roofY - frame.beltY)));
    const rough = 1 + 0.5 * noise(x0 * 3 + 11.7, y0 * 3, z0 * 3);
    const cave = ledger.roof * ROOF_FOLD * high * rough;
    y -= cave;
    x += cave * ROOF_LEAN;
    // Corrugated across the car: the roof skin buckles between the rails.
    y += ledger.roof * RIPPLE * high * Math.sin((Math.PI * 2 * z0) / RIPPLE_LENGTH);
    local += ledger.roof * high;
  }

  out.x = x;
  out.y = Math.max(FLOOR, y);
  out.z = z;
  return local;
}
