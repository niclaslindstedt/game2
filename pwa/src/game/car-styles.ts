// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The cars' LOOKS: one CarBodySpec per catalog car, keyed by id. Handling
// numbers live in engine/game/defs/cars.ts; this file only shapes and
// colors the meshes. Pure data — no three.js import — so Node tooling
// (scripts/car-preview.mjs) can load it too.
//
// Three period rally silhouettes ship, one glance apart: a short upright
// two-box hatch, a long low three-box race sedan, and a wide-arched
// two-door coupe. They differ on the axes that survive being 30 px tall in
// a chase cam — overall shape, roof color, body color — before they differ
// on any of the detail below.
//
// Every one of them is an ORIGINAL design in a period idiom. Nothing here
// reproduces a real manufacturer's model, badge, wordmark or team livery;
// the shapes are generic 1970s-80s rally vocabulary and the liveries are
// plain color blocking and a door number.
//
// Dimensions are metres and honest: these are 3.8-4.1 m cars on a 2.4 m
// wheelbase, which is what the camera, the dust and the road width are
// tuned around. The longest point of the longest car (its front bumper
// face) is what TUNING.collision.halfLength has to contain.

import type { CarSpec } from "@engine";
import type { CarBodySpec } from "./car-body.ts";
import { applyLivery, type Livery } from "./car-livery.ts";

/** The front-driver: a short, tall, slab-sided two-box hatch. Stubby nose, near
 * vertical screen, a long flat roof over a steep tailgate, and heavy
 * plastic everywhere — bumpers, arch trim, rubbing strip. Reads small,
 * upright and eager. */
export const COMPACT_BODY: CarBodySpec = {
  profile: [
    { z: 1.91, topY: 0.9, half: 0.735 },
    { z: 1.76, topY: 0.91, half: 0.78 },
    { z: 1.15, topY: 0.93, half: 0.8 },
    { z: 0.6, topY: 0.99, half: 0.8 },
    { z: -1.15, topY: 1.01, half: 0.8 },
    { z: -1.74, topY: 1.0, half: 0.78 },
    { z: -1.91, topY: 0.95, half: 0.735 },
  ],
  floorY: 0.3,
  beltY: 0.84,
  // Almost no tuck: the flanks are flat sheet from the sills to the
  // shoulder, which is the whole read of a car shaped like this.
  side: { rocker: 0.95, shoulder: 0.94 },
  wheelbase: 2.4,
  trackHalf: 0.735,
  wheelRadius: 0.31,
  wheelWidth: 0.24,
  wheelStyle: "steel",
  arches: {
    radius: 0.42,
    lift: 0.01,
    trim: { width: 0.035, drop: 0.075, color: 0x1b1e23 },
  },
  cabin: {
    cowlZ: 0.6,
    roofFrontZ: 0.02,
    roofRearZ: -1.16,
    baseRearZ: -1.8,
    roofY: 1.4,
    roofHalf: 0.665,
    // One long door glass, a small kicked-up quarter behind it, and a
    // heavy C-pillar: the three-door greenhouse.
    pillars: {
      a: 0.09,
      b: 0.1,
      c: 0.3,
      sill: 0.06,
      header: 0.05,
      split: 0.56,
      quarterRise: 0.02,
    },
    gutter: { width: 0.028 },
    wipers: true,
    seal: 0.018,
  },
  flare: { extra: 0.02, length: 1.0 },
  spoiler: { kind: "roof", z: -1.4, y: 1.44, span: 1.26, chord: 0.26 },
  doorSeams: [0.44, -0.66],
  handles: { z: [-0.3], y: 0.8 },
  sideBands: [
    // The sill skirt, then the rubbing strip under the belt line. Both are
    // plastic hardware rather than paint, so a repaint keeps them.
    { role: "trim", zFrom: 0.72, zTo: -0.72, yFrom: 0.31, yTo: 0.44, color: 0x1b1e23, proud: 0.01 },
    {
      role: "trim",
      zFrom: 1.72,
      zTo: -1.74,
      yFrom: 0.765,
      yTo: 0.81,
      color: 0x1b1e23,
      proud: 0.014,
    },
  ],
  raceNumber: { text: "5", z: -0.11, y: 0.6, size: 0.24, color: 0x1b1e23 },
  front: {
    grille: {
      width: 1.16,
      height: 0.22,
      y: 0.72,
      depth: 0.06,
      surround: 0.022,
      surroundColor: 0xc4211d,
      color: 0x101317,
      bars: 4,
      barColor: 0x24282e,
    },
    lights: { kind: "round", x: 0.43, y: 0.72, size: 0.105, bezel: 0.014, bezelColor: 0x2a2e34 },
    indicators: { y: 0.5, x: 0.52, width: 0.16, height: 0.07 },
    bumper: { y: 0.5, height: 0.16, depth: 0.16, wrap: 0.3, color: 0x1e2126 },
    splitter: { y: 0.37, height: 0.1, depth: 0.2, span: 1.24, color: 0x1e2126 },
    hood: { half: 0.6, zFrom: 1.8, zTo: 0.62 },
  },
  rear: {
    lights: { x: 0.5, y: 0.72, width: 0.34, height: 0.24, lower: 0.35 },
    bumper: { y: 0.5, height: 0.16, depth: 0.16, wrap: 0.26, color: 0x1e2126 },
    plate: { y: 0.65, width: 0.3, height: 0.1 },
    exhaust: { x: -0.45, y: 0.36, radius: 0.035 },
  },
  colors: {
    paint: 0xf1efe9,
    accent: 0xc4211d,
    glass: 0x8fb0d2,
    trim: 0x1b1e23,
    hub: 0xc9ced5,
    bumper: 0x1e2126,
    shadow: 0x14171b,
  },
};

/** The rear-driver: a low three-box race sedan on chrome blades and a red
 * air dam. Long flat hood, notchback roof over a short high boot, four-spoke
 * wheels under lip flares, and a full circuit livery — red roof and nose,
 * raked fender stripes, a blue rocker band and a door number. */
export const CLASSIC_BODY: CarBodySpec = {
  profile: [
    { z: 2.02, topY: 0.84, half: 0.715 },
    { z: 1.88, topY: 0.88, half: 0.76 },
    { z: 1.2, topY: 0.9, half: 0.785 },
    { z: 0.7, topY: 0.96, half: 0.785 },
    { z: -1.02, topY: 0.98, half: 0.785 },
    { z: -1.5, topY: 0.94, half: 0.78 },
    { z: -1.9, topY: 0.92, half: 0.75 },
    { z: -2.02, topY: 0.86, half: 0.715 },
  ],
  floorY: 0.26,
  beltY: 0.8,
  side: { rocker: 0.94, shoulder: 0.9 },
  wheelbase: 2.44,
  axleShift: 0.04,
  trackHalf: 0.75,
  wheelRadius: 0.32,
  wheelWidth: 0.29,
  wheelStyle: "split",
  arches: { radius: 0.4 },
  cabin: {
    cowlZ: 0.7,
    roofFrontZ: 0.1,
    roofRearZ: -1.0,
    baseRearZ: -1.46,
    roofY: 1.36,
    roofHalf: 0.645,
    roofPaint: "accent",
    pillars: {
      a: 0.1,
      b: 0.09,
      c: 0.24,
      sill: 0.055,
      header: 0.045,
      split: 0.6,
      quarterRise: 0.03,
    },
    gutter: { width: 0.026 },
    wipers: true,
    seal: 0.016,
  },
  flare: { extra: 0.055, length: 1.05 },
  spoiler: { kind: "lip", z: -1.9, y: 1.0, span: 1.3 },
  stripes: { offsets: [0], width: 1.16, zFrom: 1.98, zTo: 1.46, color: 0xc4211d },
  doorSeams: [0.52, -0.72],
  handles: { z: [-0.4], y: 0.76 },
  sideBands: [
    {
      zFrom: 1.94,
      zTo: -1.94,
      yFrom: 0.4,
      yTo: 0.5,
      color: 0x1f4fa8,
      proud: 0.008,
      overArch: "ride",
    },
    // Two raked fender stripes: `rise` carries the front end up over the
    // wheel and lets it fall away toward the door.
    { zFrom: 1.9, zTo: 0.62, yFrom: 0.6, yTo: 0.665, rise: 0.16, color: 0xc4211d, proud: 0.01 },
    { zFrom: 1.9, zTo: 0.62, yFrom: 0.53, yTo: 0.595, rise: 0.16, color: 0x1f4fa8, proud: 0.01 },
  ],
  raceNumber: { text: "25", z: -0.16, y: 0.6, size: 0.3, color: 0x1b1e23 },
  front: {
    grille: {
      width: 0.72,
      height: 0.16,
      y: 0.66,
      depth: 0.05,
      surround: 0.02,
      surroundColor: 0xb9bec6,
      color: 0x14171c,
      bars: 3,
      barColor: 0x3a4048,
    },
    lights: { kind: "round", x: 0.44, y: 0.71, size: 0.12, bezel: 0.02, bezelColor: 0xb9bec6 },
    indicators: { y: 0.52, x: 0.46, width: 0.14, height: 0.06 },
    bumper: { y: 0.48, height: 0.09, depth: 0.1, wrap: 0.24, color: 0xc3c8ce },
    splitter: { y: 0.33, height: 0.13, depth: 0.24, span: 1.22, color: 0xc4211d },
    hood: { half: 0.62, zFrom: 1.92, zTo: 0.72 },
  },
  rear: {
    lights: { x: 0.42, y: 0.7, width: 0.36, height: 0.18, lower: 0.3, lowerColor: 0xe6e2d6 },
    bumper: { y: 0.48, height: 0.09, depth: 0.1, wrap: 0.22, color: 0xc3c8ce },
    plate: { y: 0.64, width: 0.3, height: 0.1 },
    exhaust: { x: -0.42, y: 0.33, radius: 0.035 },
    deck: { half: 0.6, zFrom: -1.54, zTo: -1.9 },
  },
  colors: {
    paint: 0xf2f0ea,
    accent: 0xc4211d,
    glass: 0x8fb0d2,
    trim: 0x1b1e23,
    hub: 0x9ba3ad,
    bumper: 0xc3c8ce,
    shadow: 0x14171b,
  },
};

/** The four-wheel-drive: a homologation two-door standing on box flares, with
 * a quad-lamp black grille panel, a deep air dam and red wheels. Red over
 * a white flank, so it never gets confused with the two white cars. */
export const COUPE_BODY: CarBodySpec = {
  profile: [
    { z: 2.0, topY: 0.9, half: 0.7 },
    { z: 1.86, topY: 0.92, half: 0.74 },
    { z: 1.2, topY: 0.94, half: 0.77 },
    { z: 0.66, topY: 0.99, half: 0.77 },
    { z: -1.0, topY: 1.01, half: 0.77 },
    { z: -1.46, topY: 0.97, half: 0.76 },
    { z: -1.86, topY: 0.95, half: 0.73 },
    { z: -2.0, topY: 0.9, half: 0.7 },
  ],
  floorY: 0.28,
  beltY: 0.84,
  side: { rocker: 0.95, shoulder: 0.93 },
  wheelbase: 2.38,
  axleShift: 0.02,
  // Tucked in under the flares: the tire face sits barely proud of the
  // box arch, which is the whole point of bolting one on.
  trackHalf: 0.72,
  wheelRadius: 0.33,
  wheelWidth: 0.3,
  wheelStyle: "alloy",
  wheelSpokes: 8,
  arches: { radius: 0.42 },
  cabin: {
    cowlZ: 0.66,
    roofFrontZ: 0.06,
    roofRearZ: -0.98,
    baseRearZ: -1.42,
    roofY: 1.34,
    roofHalf: 0.635,
    roofPaint: "accent",
    pillars: {
      a: 0.1,
      b: 0.09,
      c: 0.26,
      sill: 0.055,
      header: 0.045,
      split: 0.58,
      quarterRise: 0.03,
    },
    gutter: { width: 0.026 },
    wipers: true,
    seal: 0.016,
  },
  flare: { extra: 0.085, length: 1.2, kind: "box" },
  spoiler: { kind: "lip", z: -1.88, y: 1.06, span: 1.32, color: 0x1b1e23 },
  stripes: { offsets: [-0.3, 0.3], width: 0.1, zFrom: 1.88, zTo: 0.7, color: 0xf2efe6 },
  doorSeams: [0.5, -0.68],
  handles: { z: [-0.36], y: 0.8 },
  sideBands: [
    // The livery is blocked, not striped: white front wing, white rear
    // quarter, and the door number's own panel between them.
    { zFrom: 1.9, zTo: 0.52, yFrom: 0.42, yTo: 0.82, color: 0xf2efe6, proud: 0.012 },
    { zFrom: -0.7, zTo: -1.9, yFrom: 0.42, yTo: 0.82, color: 0xf2efe6, proud: 0.012 },
  ],
  raceNumber: {
    text: "27",
    z: -0.1,
    y: 0.62,
    size: 0.28,
    color: 0x1b1e23,
    panel: { width: 0.66, height: 0.44, color: 0xf2efe6 },
  },
  front: {
    grille: {
      width: 1.14,
      height: 0.26,
      y: 0.7,
      depth: 0.05,
      surround: 0.016,
      surroundColor: 0x1b1e23,
      color: 0x101317,
    },
    lights: {
      kind: "round",
      x: 0.24,
      y: 0.7,
      size: 0.105,
      pairGap: 0.23,
      bezel: 0.014,
      bezelColor: 0x3a4048,
    },
    indicators: { y: 0.5, x: 0.5, width: 0.13, height: 0.06 },
    bumper: { y: 0.5, height: 0.11, depth: 0.12, wrap: 0.18, color: 0x1b1e23 },
    splitter: { y: 0.35, height: 0.1, depth: 0.26, span: 1.3, color: 0xf2efe6 },
    hood: { half: 0.58, zFrom: 1.9, zTo: 0.68 },
    lampPods: { y: 0.52, z: 2.08, radius: 0.075, offsets: [-0.3, 0.3] },
  },
  rear: {
    lights: { x: 0.42, y: 0.72, width: 0.32, height: 0.2, lower: 0.32 },
    bumper: { y: 0.5, height: 0.11, depth: 0.12, wrap: 0.16, color: 0x1b1e23 },
    plate: { y: 0.66, width: 0.3, height: 0.1 },
    exhaust: { x: -0.44, y: 0.34, radius: 0.04 },
    deck: { half: 0.58, zFrom: -1.5, zTo: -1.88 },
  },
  colors: {
    paint: 0xc8352b,
    accent: 0xf2efe6,
    glass: 0x8fb0d2,
    trim: 0x1b1e23,
    hub: 0xc0392b,
    bumper: 0x1b1e23,
    shadow: 0x14171b,
  },
};

export const CAR_BODIES: Record<string, CarBodySpec> = {
  compact: COMPACT_BODY,
  classic: CLASSIC_BODY,
  coupe: COUPE_BODY,
};

/** Body spec for a catalog car; unknown ids fall back to the compact
 * silhouette recolored in the car's own livery.
 *
 * `paint` repaints whatever body comes back in one of the field's schemes
 * (car-livery.ts) — the same shell in another team's colors. It is how a
 * start list is dressed; leave it off and the car wears the livery this
 * file authored for it, which is what the player's own car always does. */
export function bodySpecFor(car: CarSpec, paint?: Livery): CarBodySpec {
  const body = CAR_BODIES[car.id] ?? {
    ...COMPACT_BODY,
    colors: { ...COMPACT_BODY.colors, paint: car.color, accent: car.accent },
  };
  return paint ? applyLivery(body, paint) : body;
}

/** Where the hood camera's eye sits on a given car, in body-local metres
 * (+z the nose, +x its right side, y from the ground). */
export type HoodEye = { x: number; y: number; z: number };

/** How far the eye sits above the deck at the base of the windscreen, m,
 * and how far ahead of that base. Together they are what makes this a view
 * of the BONNET: high enough over the panel that its far corners fall
 * inside the frame — a lens skimming the paint projects it as a wall with
 * no shape to it — and ahead of the screen rather than behind it.
 *
 * Behind it is where a driver's eyes really are, and it is the wrong place
 * for a body with no interior modelled: the near cowl and the screen's own
 * glass then eat the bottom of the picture, which on a portrait phone (a
 * frame that opens a long way down — see HEAD.wideAim) is a third of it,
 * and any ray steeper than those finds a floor the shell does not draw from
 * inside. Ahead of the screen every downward ray lands on bonnet. The
 * head's own travel (camera.ts) is bounded well inside the rise, so no
 * landing drops the eye into the panel. */
const EYE_RISE = 0.38;
const EYE_AHEAD = 0.06;
/** How far the eye sits left of the centreline, m. A driver is not sat in
 * the middle of the car, and that asymmetry is most of what separates a
 * seat from a lens taped to the middle of the scuttle. Kept to a hint of
 * the real seat offset, because the road still has to read as centred. */
const EYE_SIDE = 0.16;

/** The body's top surface at a point along the car, m — the loft the
 * profile stations describe, sampled between the two that bracket `z`. */
function deckAt(body: CarBodySpec, z: number): number {
  const p = body.profile;
  for (let i = 1; i < p.length; i += 1) {
    // Stations run nose (+z) → tail (−z), so the bracket closes when the
    // station's z drops below the sample.
    if (p[i].z <= z) {
      const span = p[i - 1].z - p[i].z;
      const t = span > 0 ? (p[i - 1].z - z) / span : 0;
      return p[i - 1].topY + (p[i].topY - p[i - 1].topY) * t;
    }
  }
  return p[p.length - 1].topY;
}

/** The hood camera's mount on a catalog car — read off the car's own
 * silhouette, so a low sedan seats the shot lower than an upright hatch
 * does and each one shows its own bonnet. */
export function hoodEyeFor(car: CarSpec): HoodEye {
  const body = bodySpecFor(car);
  const cowl = body.cabin.cowlZ;
  return { x: -EYE_SIDE, y: deckAt(body, cowl) + EYE_RISE, z: cowl + EYE_AHEAD };
}
