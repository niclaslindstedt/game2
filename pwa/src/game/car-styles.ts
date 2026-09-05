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
import type { CarEyes } from "./camera-eye.ts";
import { cockpitEyeFor, type CarBodySpec } from "./car-body.ts";
import { applyLivery, type Livery } from "./car-livery.ts";

/** The front-driver: a short, upright, hard-edged two-box hatch in the
 * late-70s-into-the-80s idiom — the shape a generation of small European
 * rally cars was built on. Blunt vertical nose, a flat bonnet, an upright
 * screen off a low cowl, a long dead-flat roof on deep rain gutters, a
 * heavy C-pillar, and a tailgate that drops away almost straight down.
 * Plastic everywhere it can be: deep bumpers, arch extensions, a sill skirt.
 *
 * The PROPORTIONS are measured off period elevations rather than guessed,
 * because on a shape this plain proportion is the whole likeness — there is
 * no surfacing to hide behind. Everything below is stated in metres from
 * the axles, which is how it was measured: the wheel centres are the two
 * points on a side elevation nothing can argue with, and every other line
 * on the car was read off against them with a ruled grid.
 *
 * What that ruler said, and what it changed:
 * - THE DOOR is 1.2 m long, not half the car, and its rear edge is ONE
 *   straight vertical line from the sill to the roof — the B-pillar stands
 *   plumb (`splitZ`) and the shut line under it is at the same z.
 * - THE C-PILLAR is the widest thing on the flank: half a metre of sheet
 *   at the sill, a third at the roof. It is the one panel that makes this
 *   car this car, and a thin post there makes it a different hatch.
 * - THE ROOF runs to just past the rear axle, and the tailgate falls from
 *   there at fifty degrees, not sixty.
 * - THE WHEELS are the size the body can carry: a tyre a fifth of the roof
 *   height, inside an arch that clears it by the springs' travel, on a rim
 *   two thirds of the tyre — a fifteen-inch wheel under a gravel sidewall,
 *   which is the single thing that dates a wheel at any distance.
 * - THE TAIL LAMPS run up to the tailgate's foot with no strip of paint
 *   over them, and the bumper sits a hand higher, with the valance under.
 *
 * The BACK is where the geometry has been spent, and deliberately. Every
 * other panel is glimpsed at forty metres a second; the tail is the one the
 * chase camera holds for the entire stage, so it gets a real tailgate with
 * a shut line round it, a pressed swage and a grab recess across it, three
 * cell clusters sunk into their own housings, a valance with reversing
 * lamps under the bumper, and a pipe out of the left of it. */
export const COMPACT_BODY: CarBodySpec = {
  // Against the front axle at z = 1.245 and the rear at z = -1.225: the
  // bonnet's leading edge 0.6 m ahead of the front axle, the cowl 0.55 m
  // behind it, the roof's front edge 0.92 m behind it; the roof's rear edge
  // 0.05 m behind the REAR axle, the tailgate's foot 0.55 m behind it.
  //
  // The deck FALLS from the cowl to the leading edge, and it falls
  // CONTINUOUSLY — five stations down the bonnet, not two. A deck run level
  // and then stepped off at the last station is not a wedge, it is a shelf
  // with a wall under it, and that is exactly what it looks like. The nose
  // stops at the height it does because the engine plants a roadside stone
  // as a SOLID by measuring it against the lowest bonnet in the catalog,
  // and this is that bonnet (tests/car_geometry_test.ts).
  //
  // Behind the cowl the deck is the door tops and the C-pillar's foot, and
  // it runs LEVEL to the tailgate: the flank the cabin stands on is one
  // straight line, so the glass over it is one run of glass.
  profile: [
    { z: 1.84, topY: 0.84, half: 0.7 },
    { z: 1.76, topY: 0.865, half: 0.755 },
    { z: 1.58, topY: 0.895, half: 0.785 },
    { z: 1.24, topY: 0.92, half: 0.79 },
    { z: 0.98, topY: 0.938, half: 0.79 },
    { z: 0.7, topY: 0.952, half: 0.79 },
    { z: 0.0, topY: 0.955, half: 0.79 },
    { z: -0.72, topY: 0.957, half: 0.79 },
    { z: -1.28, topY: 0.958, half: 0.79 },
    { z: -1.58, topY: 0.958, half: 0.78 },
    { z: -1.74, topY: 0.955, half: 0.765 },
    { z: -1.8, topY: 0.94, half: 0.73 },
  ],
  // Low: the body sits down on its wheels rather than standing over them.
  floorY: 0.27,
  // The belt is the widest point of the SECTION, and it has to sit under
  // every station's deck: where the deck falls below it — which is exactly
  // what a nose angled downward does — the ring turns inside out and the
  // front wing grows a flat shelf along its top with a wall at the end of
  // it. So this tracks the LOWEST deck on the car, not the cabin's.
  beltY: 0.82,
  // Almost no tuck: the flanks are flat sheet from the sills to the
  // shoulder, which is the whole read of a car shaped like this.
  side: { rocker: 0.965, shoulder: 0.955 },
  wheelbase: 2.47,
  // All but centred: the two overhangs of a car like this are within twenty
  // millimetres of each other.
  axleShift: 0.01,
  trackHalf: 0.74,
  // A fifteen-inch gravel wheel: the tyre is a fifth of the roof height,
  // the arch clears it by the springs' whole travel and not a millimetre
  // more (the tightest tests/car_geometry_test.ts allows), and the rim is
  // two thirds of the tyre. The wheel this car had before was a quarter of
  // the roof with a rim of seven eighths, and it put a modern tuner's wheel
  // under a period body — the one thing about the car that read wrong from
  // every seat in the house.
  wheelRadius: 0.315,
  wheelWidth: 0.23,
  wheelStyle: "alloy",
  rimShare: 0.66,
  // A lattice: many fine spokes rather than five blades. With the rim this
  // much smaller the face is a small disc, and five blades on a small disc
  // read as a fan.
  wheelSpokes: 12,
  wheelSpokeWidth: 0.07,
  arches: {
    radius: 0.4,
    lift: 0,
    trim: { width: 0.036, drop: 0.055, color: 0x191c21 },
  },
  cabin: {
    cowlZ: 0.7,
    roofFrontZ: 0.32,
    roofRearZ: -1.27,
    baseRearZ: -1.78,
    roofY: 1.415,
    roofHalf: 0.685,
    // The three-door greenhouse: a door glass, a plumb B-pillar, a quarter
    // glass nearly as long behind it, and a C-pillar wider than either.
    // The glass runs close to the deck — the sill and header are the seal
    // and a finger of metal, not a letterbox: the real car carries its
    // glass at three tenths of its height and this greenhouse was at a
    // quarter.
    pillars: {
      a: 0.085,
      b: 0.075,
      c: 0.42,
      sill: 0.045,
      header: 0.038,
      // In metres, so it stands plumb — and so the door's shut line below
      // can be put on the same line (the second `doorSeams` entry is this
      // less half the post).
      splitZ: -0.38,
      quarterRise: 0,
      backWidth: 0.78,
    },
    gutter: { width: 0.032 },
    wipers: true,
    seal: 0.02,
  },
  // Bolted-on box flares rather than a swelling: the step at each end is
  // the point of them, and it is what survives being small on screen.
  flare: { extra: 0.04, length: 1.06, kind: "box" },
  spoiler: { kind: "roof", z: -1.33, y: 1.435, span: 1.24, chord: 0.17 },
  mudflaps: false,
  // The door: from just behind the front arch to the B-pillar's rear edge,
  // 1.2 m — the long door of a three-door, and no longer.
  doorSeams: [0.77, -0.42],
  // A hand ahead of the door's rear edge, just under the belt: where a door
  // handle on a car of this era is.
  handles: { z: [-0.25], y: 0.86 },
  // No black band down the flank — a rubbing strip run wheel to wheel cuts
  // the one long unbroken surface this car has in half, and at range that
  // line is louder than the shape it is drawn on. The plastic that stays is
  // the plastic with a job: the two bumpers and the arch extensions.
  //
  // What is here instead is PAINT: a hairline of yellow sitting on top of
  // the blue, which is where the two-tone's own edge already draws a line.
  // One stripe, because the two-tone is doing the work and a second would
  // just be noise on top of it.
  sideBands: [{ zFrom: 1.62, zTo: -1.7, yFrom: 0.824, yTo: 0.85, color: 0xf0c419, proud: 0.004 }],
  // On the door, high on the flank under the belt, which is where a period
  // rally car actually carried one.
  raceNumber: {
    text: "5",
    z: 0.14,
    y: 0.62,
    size: 0.26,
    color: 0x14357f,
    panel: { width: 0.46, height: 0.42, color: 0xf4f2ec },
  },
  front: {
    // The face: one dark band nearly the width of the nose, outlined in the
    // accent colour, with the lamps standing INSIDE it at each end. That
    // outline is the most recognisable thing about a car of this kind, and
    // the only part of the face that survives at range. It sits ON the
    // bumper: the surround's foot is a finger above the bumper's top edge.
    grille: {
      width: 1.36,
      height: 0.185,
      y: 0.685,
      depth: 0.05,
      surround: 0.022,
      surroundColor: 0xf0c419,
      color: 0x0e1115,
      bars: 5,
      barColor: 0x22262c,
    },
    lights: {
      kind: "round",
      x: 0.395,
      y: 0.685,
      size: 0.08,
      pairGap: 0.2,
      pairSize: 0.1,
      bezel: 0.012,
      bezelColor: 0x2a2e34,
      depth: 0.04,
    },
    indicators: { y: 0.515, x: 0.59, width: 0.17, height: 0.05 },
    // The big-bumper face: a slab a hand deep across the nose, and the air
    // dam a second slab under it. Measured, the slab is 0.12 m tall, not
    // the 0.17 it was — a bumper taller than its own lamps is a wall.
    bumper: { y: 0.5, height: 0.12, depth: 0.185, wrap: 0.34, color: 0x1c1f24 },
    splitter: { y: 0.365, height: 0.14, depth: 0.22, span: 1.32, color: 0x1c1f24 },
    hood: { half: 0.64, zFrom: 1.8, zTo: 0.72 },
  },
  rear: {
    // Measured off a rear elevation: each cluster runs from just past half
    // the half-width out to a hand inside the corner, and its TOP is the
    // tailgate's foot — there is no strip of paint over a lamp on this car,
    // the lamp is what the roofline comes down onto. A finger's width clear
    // of the bumper under it.
    lights: {
      x: 0.55,
      y: 0.84,
      width: 0.25,
      height: 0.18,
      cells: 3,
      lower: 0.3,
      lowerColor: 0xe0a326,
      bezel: 0.018,
      bezelColor: 0x17191d,
      depth: 0.05,
    },
    // The door itself, between the lamps from the bumper to the glass: shut
    // line round it, and three things stacked up it, because a tailgate
    // with nothing on it reads as a blanking plate.
    tailgate: {
      yFrom: 0.71,
      yTo: 0.925,
      inset: 0.33,
      proud: 0.018,
      seam: 0.03,
      rib: { y: 0.9, height: 0.026, proud: 0.012, inset: 0.05 },
      handle: { y: 0.86, width: 0.32, height: 0.036 },
    },
    plate: { y: 0.775, width: 0.36, height: 0.095 },
    // The same slab as the nose's, a hand higher than it was, and the
    // valance under it runs down to where the skirt ends on the real car —
    // the loft carries on below to the floor, and every centimetre of paint
    // showing under a black skirt is a centimetre the car looks jacked up.
    bumper: { y: 0.645, height: 0.11, depth: 0.185, wrap: 0.32, color: 0x1c1f24 },
    valance: { y: 0.51, height: 0.16, depth: 0.21, span: 1.3, color: 0x1c1f24 },
    lamps: { y: 0.52, x: 0.4, width: 0.115, height: 0.05, color: 0xf2ede0 },
    exhaust: { x: -0.44, y: 0.4, radius: 0.04 },
  },
  colors: {
    paint: 0xf4f2ec,
    accent: 0x14357f,
    // The blue is cut INTO the loft rather than laid over it, so it follows
    // the flares and wraps both caps — which is why the car still reads
    // blue from dead astern, where a flank stripe would show nothing.
    lower: 0x2f74c8,
    glass: 0x8fb0d2,
    trim: 0x191c21,
    hub: 0xdfe3e8,
    bumper: 0x1c1f24,
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

/** How far the HOOD eye sits above the deck at the base of the windscreen,
 * m, and how far ahead of that base. Together they are what makes that view
 * one of the BONNET: high enough over the panel that its far corners fall
 * inside the frame — a lens skimming the paint projects it as a wall with
 * no shape to it — and ahead of the screen rather than behind it.
 *
 * Behind it is where a driver's eyes really are, and that is what the
 * COCKPIT view is: it works only because car/cockpit.ts builds a cabin to
 * put there. Without one, the near cowl and the screen's own glass eat the
 * bottom of the picture and any ray steeper than those finds a floor the
 * shell does not draw from inside. Ahead of the screen every downward ray
 * lands on bonnet, which is why this view needs nothing built for it. The
 * head's own travel (camera-eye.ts) is bounded well inside the rise, so no
 * landing drops the eye into the panel. */
const EYE_RISE = 0.38;
const EYE_AHEAD = 0.06;
/** How far the hood eye sits off the centreline, m, on the side the car is
 * driven from (+x — see SEAT_SIDE in car/interior.ts for why that is the
 * LEFT of the frame). A driver is not sat in the middle of the car, and that
 * asymmetry is most of what separates a seat from a lens taped to the middle
 * of the scuttle. Kept to a hint of the real seat offset, because the road
 * still has to read as centred. */
const EYE_SIDE = 0.16;

/** The BUMPER eye: ahead of the nose cap, so no panel of the car is in
 * frame at all, and level with the top of the bumper bar it is named for.
 * Ahead rather than on it, because a lens flush with the cap catches the
 * paint at the edges of a wide frame — which is the one thing this view is
 * for not having. */
const NOSE_AHEAD = 0.14;
const NOSE_RISE = 0.06;

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

/** Where the three in-car views mount on a catalog car — read off that
 * car's own silhouette, so a low sedan seats every one of them lower than an
 * upright hatch does, and each shows its own bonnet, its own dials and its
 * own nose. One function rather than three, because they are one question
 * about one body and the renderer asks it once per stage. */
export function carEyes(car: CarSpec): CarEyes {
  const body = bodySpecFor(car);
  const cowl = body.cabin.cowlZ;
  const nose = body.profile[0].z;
  const bumper = body.front?.bumper;
  const bumperTop = bumper ? bumper.y + bumper.height : body.beltY * 0.8;
  return {
    cockpit: cockpitEyeFor(body),
    hood: { x: EYE_SIDE, y: deckAt(body, cowl) + EYE_RISE, z: cowl + EYE_AHEAD },
    bumper: { x: 0, y: bumperTop + NOSE_RISE, z: nose + NOSE_AHEAD },
  };
}
