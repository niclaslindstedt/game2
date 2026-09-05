// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The cars' LOOKS: one CarBodySpec per catalog car, keyed by id. Handling
// numbers live in engine/game/defs/cars.ts; this file only shapes and
// colors the meshes. Pure data — no three.js import — so Node tooling
// (scripts/car-preview.mjs) can load it too.
//
// Three period rally silhouettes ship, one glance apart: a short upright
// two-box hatch, a long low three-door fastback under a whale tail, and a
// four-door turbo sedan of the Group A years. They differ on the axes that survive being 30 px tall in
// a chase cam — overall shape, roof color, body color — before they differ
// on any of the detail below.
//
// Every one of them is an ORIGINAL design in a period idiom. Nothing here
// reproduces a real manufacturer's model, badge, wordmark or team livery;
// the shapes are the rally vocabulary of the 1960s-80s, with their
// proportions measured off elevations of the era, and the liveries are
// plain color blocking and a door number.
//
// Dimensions are metres and honest: these are 3.6-4.1 m cars on 2.4-2.5 m
// wheelbases, which is what the camera, the dust and the road width are
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

/** The rear-driver: the big late-80s homologation hatch — a long, low
 * three-door fastback on a wheelbase a hand longer than anything else in
 * the catalog, with the whale tail. Aero nose falling to a slot of a grille
 * between rectangular quad lamps, a flat bonnet with the intercooler's two
 * vents in it, a flush glasshouse with no gutters and a long door, a sail
 * panel beside a huge raked backlight, body-coloured bumpers with a rubbing
 * strip let into them and the same strip run down the flank, lattice
 * wheels, and a wing on posts at its ends standing over the tailgate with
 * the evolution car's second lip under it.
 *
 * Measured off ruled side, front and rear elevations, against the wheel
 * centres, and stated here in metres from the axles (front at z = 1.32,
 * rear at z = -1.16). THE WHOLE CAR IS THE REAL ONE AT 95%: the collision
 * box every car shares stops at 2.1 m from the centre and the real bumper
 * faces would stand past it, and a car shortened without being lowered and
 * narrowed is a different car — laid over the photographs, registered on
 * the axles, every height of it read tall. The one line that is not the
 * measurement is the bonnet's leading edge, a hand higher than the real
 * one: the engine plants a roadside stone as a solid by measuring it
 * against the lowest bonnet in the catalog, and that bar
 * (tests/car_geometry_test.ts) is written for a bonnet no lower than the
 * hatch's. Everything else — the cowl, the roof, the belt, the door, the
 * glass, the lamps, the bumpers, the wing — is where the ruler put it. */
export const CLASSIC_BODY: CarBodySpec = {
  // The bonnet's leading edge 0.62 m ahead of the front axle (the bumper
  // face 0.12 m past it), the cowl 0.46 m behind it, the roof's front edge
  // 1.04 m behind it. The roof's rear edge 0.34 m behind the REAR axle, the
  // foot of the backlight 0.66 m behind it, the tail face 0.78 m behind it.
  //
  // The bonnet is all but flat from the cowl to the bar the nose stops at.
  // Behind the cowl the deck is the door tops, one line rising a hair to
  // the backlight's foot — that foot is the tailgate's top edge and it
  // stands over the sail panel — then dropping at forty-six degrees down
  // the tailgate's lower panel onto the vertical face the lamps and the
  // plate are on. The tail is nearly as wide at the lamps as the doors are:
  // the clusters run out to the corners.
  profile: [
    { z: 1.94, topY: 0.84, half: 0.68 },
    { z: 1.84, topY: 0.845, half: 0.75 },
    { z: 1.32, topY: 0.848, half: 0.78 },
    { z: 0.86, topY: 0.85, half: 0.78 },
    { z: -0.42, topY: 0.855, half: 0.78 },
    { z: -1.16, topY: 0.86, half: 0.78 },
    { z: -1.5, topY: 0.865, half: 0.775 },
    { z: -1.82, topY: 0.878, half: 0.77 },
    { z: -1.88, topY: 0.825, half: 0.765 },
    { z: -1.94, topY: 0.77, half: 0.76 },
  ],
  // The sill skirts run down to a hand and a half off the ground.
  floorY: 0.2,
  // The widest point of the section is a little under the door tops — the
  // flank tumbles home slightly from there up to the glass.
  beltY: 0.76,
  side: { rocker: 0.95, shoulder: 0.94 },
  wheelbase: 2.48,
  // The tail overhang is the longer one: a fastback carries its length
  // behind the rear axle.
  axleShift: 0.08,
  trackHalf: 0.7,
  // A fifteen-inch wheel under a 50-series tyre: the rim is two thirds of
  // the tyre and the tyre is small — this is the one car in the catalog
  // that came on low-profile rubber, and the wheel is what dates it.
  wheelRadius: 0.285,
  wheelWidth: 0.22,
  wheelStyle: "lattice",
  rimShare: 0.65,
  // The real arch clears the tyre by a few centimetres; this one clears it
  // by the springs' whole travel, which is the least the tests allow.
  arches: { radius: 0.365 },
  cabin: {
    cowlZ: 0.86,
    roofFrontZ: 0.28,
    roofRearZ: -1.5,
    baseRearZ: -1.82,
    roofY: 1.285,
    roofHalf: 0.61,
    // The glasshouse narrows toward the tail: the roof's rear edge is a
    // hand narrower each side than its front, which is what the fitted
    // rear photograph said its corners were.
    roofRearHalf: 0.56,
    roofPaint: "accent",
    // The three-door glasshouse: a 1.25 m door, a B-pillar standing plumb
    // at its rear edge, a quarter glass nearly as long behind it with its
    // own rear edge plumb 0.28 m behind the rear axle, and what is left of
    // the flank behind THAT is the sail panel — half a metre at the deck, a
    // hand at the roof. The glass runs close to the metal: this is the
    // flush-glazed body that did away with the rain gutter. The backlight
    // takes nearly the whole width of the tail.
    pillars: {
      a: 0.09,
      b: 0.08,
      sill: 0.04,
      header: 0.035,
      splitZ: -0.42,
      quarterZ: -1.44,
      quarterRise: 0,
      backWidth: 0.92,
    },
    wipers: true,
    seal: 0.018,
  },
  // Blistered arches rather than bolted-on boxes: the lips swell out of the
  // wings and fade back into the doors.
  flare: { extra: 0.03, length: 0.95 },
  // THE WING. Blade centre 0.66 m behind the rear axle at 1.07 m — over the
  // lower half of the backlight — 1.62 m across, on posts standing at four
  // fifths of the half span; and the second, flat lip on the tailgate's own
  // top edge under it.
  spoiler: {
    kind: "gate",
    z: -1.82,
    y: 1.074,
    span: 1.62,
    chord: 0.32,
    thick: 0.07,
    post: 0.8,
    lip: { z: -1.8, chord: 0.1 },
  },
  doorSeams: [0.83, -0.42],
  handles: { z: [-0.56], y: 0.74 },
  // The rubbing strip: one dark line at knee height from wheel to wheel,
  // the arches eating into it, and picked up again on both bumpers by the
  // strip let into each (`front.bumper.strip`, `rear.bumper.strip`).
  sideBands: [
    {
      zFrom: 1.6,
      zTo: -1.6,
      role: "trim",
      yFrom: 0.455,
      yTo: 0.5,
      color: 0x1b1e23,
      proud: 0.008,
      overArch: "clip",
    },
  ],
  raceNumber: { text: "25", z: 0.2, y: 0.57, size: 0.28, color: 0x1b1e23 },
  front: {
    // A slot, not a mouth: the whole face is lamps, and the grille is the
    // hand's breadth of black mesh between the two pairs.
    grille: {
      width: 0.37,
      height: 0.065,
      y: 0.63,
      depth: 0.04,
      surround: 0.012,
      surroundColor: 0x1b1e23,
      color: 0x0e1115,
      bars: 0,
    },
    // Rectangular quads: one framed cluster of two cells each side, from a
    // hand off the grille out to a hand in from the corner.
    lights: {
      kind: "rect",
      x: 0.45,
      y: 0.63,
      size: 0.17,
      height: 0.08,
      cells: 2,
      bezel: 0.012,
      bezelColor: 0x2a2e34,
      depth: 0.045,
    },
    // The corner lamps are in the bumper, under the lamps' outer cells.
    indicators: { y: 0.45, x: 0.49, width: 0.23, height: 0.065 },
    // Body-coloured, DEEP — the aero bumper is one slab from under the
    // lamps to the air dam — the widest thing on the car, wrapped right
    // back to the arch, with the black strip along its top edge.
    bumper: {
      y: 0.41,
      height: 0.18,
      depth: 0.14,
      wrap: 0.52,
      width: 1.64,
      color: 0xf2f0ea,
      strip: { y: 0.49, height: 0.024 },
    },
    splitter: { y: 0.255, height: 0.13, depth: 0.15, span: 1.46, color: 0xf2f0ea },
    hood: { half: 0.64, zFrom: 1.9, zTo: 0.88 },
    // The two louvred vents over the intercooler, a third of the way down
    // the bonnet.
    vents: { z: 1.58, width: 0.15, length: 0.14, offsets: [-0.38, 0.38] },
  },
  rear: {
    // Measured off the rear elevation: each cluster runs from just past the
    // plate out to the body's corner, and its colours run ACROSS — amber at
    // the corner, red, the reversing lamp's white, red again by the plate.
    lights: {
      x: 0.5,
      y: 0.624,
      width: 0.46,
      height: 0.136,
      cells: 4,
      cellColors: [0xe0a326, 0xc4231b, 0xe8e4d8, 0xc4231b],
      bezel: 0.014,
      bezelColor: 0x17191d,
      depth: 0.04,
    },
    plate: { y: 0.624, width: 0.46, height: 0.12 },
    // The same deep body-coloured slab as the nose's, with its strip — and
    // like it, the widest thing on the car: wider than the tail above it.
    bumper: {
      y: 0.43,
      height: 0.16,
      depth: 0.14,
      wrap: 0.5,
      width: 1.64,
      color: 0xf2f0ea,
      strip: { y: 0.485, height: 0.024 },
    },
    valance: { y: 0.27, height: 0.12, depth: 0.12, span: 1.46, color: 0x1b1e23 },
    // One pipe, out of the left, under the valance.
    exhaust: { x: -0.5, y: 0.185, radius: 0.038 },
    // The tailgate's lower panel, between the backlight's foot and the lamps,
    // with the shut line round it.
    deck: { half: 0.64, zFrom: -1.82, zTo: -1.92 },
  },
  colors: {
    paint: 0xf2f0ea,
    accent: 0xc4211d,
    glass: 0x8fb0d2,
    trim: 0x1b1e23,
    hub: 0xd9dde3,
    bumper: 0xf2f0ea,
    shadow: 0x14171b,
  },
};

/** The four-wheel-drive: a four-door turbo sedan in the Group A idiom of
 * the late eighties — the shape the works teams took rallying once the
 * homologation specials were banned. A long wedge of a bonnet off a low
 * nose, a greenhouse that starts well forward and runs most of the car on
 * thin posts, a raked backlight down to a short high boot with a lip on
 * it, and a tail that is one full-width band of lamps. Flush-fitting, not
 * bolted-on: the arches are pressed blisters and the skirts are body
 * colour, and what says "works car" is the furniture — two scoops on the
 * roof, four lamp pods on the nose, red flaps — and the colour blocking.
 *
 * MEASURED, not judged: every line below was read as a pixel off a ruled
 * side elevation and converted against the two things nothing can argue
 * with, the wheel centres. The wheelbase set the scale (2.567 mm a pixel),
 * heights come off the ground under the tyres, and everything along the
 * car is stated from the axles. The real car is 4.56 m long on a 2.6 m
 * wheelbase; the one collision box the catalog shares stops at 2.1 m from
 * the middle, so every LENGTH here is scaled by 0.921 and no height or
 * width is — a proportion along the car is the photo's, a proportion up
 * or across it is real. Against the front axle at z = 1.19 and the rear
 * at z = −1.21:
 * - the nose cap (the lamps' face and the bonnet's lip) 0.66 m ahead of
 *   the front axle, the bumper's face 0.07 m past it and the air dam's lip
 *   0.09 m; the cowl 0.41 m behind the axle, the roof's front edge 0.82 m;
 * - the front door 0.96 m long from 0.44 m behind the front axle, the
 *   B-pillar plumb at −0.25, the rear door's shut line 0.32 m ahead of the
 *   rear axle, and the side glass running 0.15 m past that axle;
 * - the roof's rear edge 0.24 m ahead of the rear axle, the backlight's
 *   foot 0.17 m behind it, the tail 0.82 m behind it with the bumper's face
 *   a hand past that;
 * - the bonnet's lip at 0.74 m, the bonnet climbing to 0.94 m at the cowl
 *   with its last 0.4 m rounding down to that lip, the door tops at 0.93 m,
 *   the boot 0.1 m higher than them, the roof at 1.37 m;
 * - the headlamp a 0.1 m band centred 0.64 m up, wrapping 0.19 m round the
 *   corner onto the fender, amber at its trailing end; the bumper from
 *   0.40 to 0.53 m; the air dam body colour, down to 0.2 m;
 * - a tyre 0.32 m in radius under a rim two thirds of it, on five broad
 *   blades — the one white wheel in the catalog.
 *
 * The BACK is where the geometry is spent, because it is the panel the
 * chase camera holds for the whole stage: a lamp band the width of the car
 * with the plate let into the middle of it, a deep body-colour bumper with
 * the black valance under it, the lip on the boot, the two red flaps, and
 * the tail paint carrying the roof's black down the posts and across the
 * quarters so the car reads as a white nose pushing a black tail. */
export const SEDAN_BODY: CarBodySpec = {
  // The deck FALLS from the cowl to the nose, a little more with each
  // station, and the door tops behind the cowl sit a finger under it while
  // the boot stands a hand over them: the three-box silhouette in three
  // numbers. THE NOSE IS NOT WHERE THE PHOTOGRAPH HAS IT, and deliberately:
  // the real lip rounds down to 0.74 m, and this one stops at 0.835 m,
  // because the engine plants a roadside stone as a SOLID by measuring it
  // against the lowest bonnet in the catalog (SOLID_PROP_HEIGHT, held by
  // tests/car_geometry_test.ts), and that bar is a world constant every
  // stage is built against. The last 0.4 m of the bonnet is therefore
  // flat at that height instead of rounding down; everything under it is
  // measured.
  profile: [
    { z: 1.855, topY: 0.835, half: 0.74 },
    { z: 1.7, topY: 0.835, half: 0.79 },
    { z: 1.46, topY: 0.84, half: 0.82 },
    { z: 1.225, topY: 0.873, half: 0.84 },
    { z: 0.99, topY: 0.906, half: 0.845 },
    { z: 0.8, topY: 0.94, half: 0.845 },
    { z: 0.7, topY: 0.93, half: 0.845 },
    { z: 0.0, topY: 0.93, half: 0.845 },
    { z: -0.9, topY: 0.94, half: 0.845 },
    { z: -1.375, topY: 1.03, half: 0.84 },
    { z: -1.8, topY: 1.005, half: 0.8 },
    { z: -2.03, topY: 0.975, half: 0.74 },
  ],
  // Low over its wheels: the sill on the real car is a hand off the ground
  // at rally height.
  floorY: 0.24,
  beltY: 0.82,
  // Flat flanks with a soft turn-in at the shoulder — a pressed-steel
  // sedan, not a slab.
  side: { rocker: 0.95, shoulder: 0.93 },
  wheelbase: 2.4,
  // A hair rearward: the rear overhang is the longer one on this car, and
  // its bumper's face is what reaches the collision box's end.
  axleShift: -0.01,
  trackHalf: 0.74,
  // A fifteen-inch gravel wheel: the tyre a quarter of the roof height, the
  // arch clearing it by the springs' whole travel and not a millimetre more
  // (the tightest tests/car_geometry_test.ts allows), and the rim two
  // thirds of the tyre. The face is five broad blades off a small hub,
  // painted white with the car — the rim the works cars ran, and the one
  // white wheel in the catalog, which is what sells the car at a glance
  // from the seat behind it.
  wheelRadius: 0.32,
  wheelWidth: 0.25,
  wheelStyle: "alloy",
  rimShare: 0.67,
  wheelSpokes: 5,
  wheelSpokeWidth: 0.27,
  arches: { radius: 0.4 },
  cabin: {
    cowlZ: 0.8,
    roofFrontZ: 0.37,
    roofRearZ: -0.97,
    baseRearZ: -1.375,
    roofY: 1.37,
    roofHalf: 0.64,
    // The roof, every post and the tail paint are one colour: the works
    // blackout that runs from the screen's top edge off the back of the car.
    roofPaint: "accent",
    pillarPaint: "accent",
    // Four-door glass: a front door pane, a plumb B-pillar on the door's
    // shut line, a rear door pane nearly as long, and a rear post that leans
    // with the backlight. Thin posts and a low sill — the glass is a third
    // of the car's height, which is the number that puts it in its decade.
    pillars: {
      a: 0.09,
      b: 0.08,
      c: 0.16,
      sill: 0.045,
      header: 0.04,
      splitZ: -0.25,
      quarterRise: 0,
      backWidth: 0.84,
    },
    gutter: { width: 0.02 },
    wipers: true,
    seal: 0.016,
    // The two scoops at the front of the roof: the first thing on the car
    // the chase camera sees over the backlight.
    roofVents: { z: 0.2, offsets: [-0.42, 0.42], width: 0.2, length: 0.16, height: 0.04 },
  },
  // Pressed blisters rather than box flares: the works car's arches are
  // swollen from the panel, three centimetres a side, and stop at the doors.
  flare: { extra: 0.03, length: 1.15, kind: "smooth" },
  // The boot's lip, a hand above the deck and the width of the lid.
  spoiler: { kind: "lip", z: -1.97, y: 1.03, span: 1.3, color: 0x15171b },
  // Two red flashes down the bonnet's outer edges, from the lamps to the
  // cowl — inside the lid, so they leave with it.
  stripes: [{ offsets: [-0.44, 0.44], width: 0.2, zFrom: 1.76, zTo: 0.9, color: 0xd8262c }],
  // Three shut lines: the front door's leading edge just behind the front
  // arch, the B-pillar's line, and the rear door's edge ahead of the rear
  // arch — the rear door is 0.68 m of the flank, the front one 0.96.
  doorSeams: [0.75, -0.21, -0.89],
  // A hand ahead of each door's rear edge, just under the glass.
  handles: { z: [-0.02, -0.65], y: 0.87 },
  // The tail paint's break: from here back the loft, the cap and the boot
  // lid wear the roof's black. It stands where the red band's rear edge
  // reaches the door top, so the red is laid over black from there down
  // and its slanted edge IS the edge of the blackout — no second band, and
  // no line where two paints of the same black would meet.
  tailPaint: { z: -0.84 },
  sideBands: [
    // The silver rubbing strip, wheel to wheel at knee height — hardware,
    // so it stays on whatever the car is painted.
    {
      zFrom: 1.62,
      zTo: -1.95,
      yFrom: 0.6,
      yTo: 0.625,
      role: "trim",
      color: 0xb8bcc2,
      proud: 0.01,
    },
    // The colour blocking: a red diagonal across the rear door, leaning
    // forward as it climbs, from the sill to the door top. Its foot runs
    // onto the rear arch and is clipped by it, as the paint on the real
    // car is; its rear edge is where the white ends.
    {
      zFrom: -0.52,
      zTo: -1.08,
      yFrom: 0.24,
      yTo: 0.94,
      slant: 0.36,
      color: 0xd8262c,
      proud: 0.006,
    },
  ],
  // On the front door, high on the flank, with no roundel — the door is
  // white already.
  raceNumber: { text: "27", z: 0.27, y: 0.58, size: 0.24, color: 0x15171b },
  // Red flaps: under a black tail they are the one thing down there that
  // catches the eye, and the works cars ran them red for the same reason.
  mudflaps: { color: 0xd8262c },
  front: {
    // The face: a slim dark slot between two wide rectangular lamps, all
    // three on one line a hand under the bonnet's lip, the lamps carrying
    // on round the corners; the bumper below is body colour, and so is the
    // air dam under it — the whole nose is white, and nothing dark hangs
    // under it to make it read bigger than it is.
    grille: {
      width: 0.6,
      height: 0.08,
      y: 0.66,
      depth: 0.04,
      surround: 0.012,
      surroundColor: 0x15171b,
      color: 0x101317,
      bars: 2,
      barColor: 0x2c3138,
    },
    lights: {
      kind: "rect",
      x: 0.5,
      y: 0.64,
      size: 0.18,
      height: 0.052,
      bezel: 0.012,
      bezelColor: 0x2a2e34,
      depth: 0.035,
      cells: 2,
      wrap: 0.19,
      wrapColor: 0xe89b23,
    },
    // Shallow: the bar stands a hand past the lamps, not a foot — the nose
    // of this car is the lamps and the bonnet's edge, with the bumper flush
    // under them.
    bumper: { y: 0.465, height: 0.125, depth: 0.09, wrap: 0.3, color: 0xf3f1eb },
    splitter: { y: 0.305, height: 0.19, depth: 0.22, span: 1.46, color: 0xf3f1eb },
    hood: { half: 0.6, zFrom: 1.8, zTo: 0.82 },
    // Four pods: a big pair standing up off the bonnet's corners, and a
    // smaller pair ahead of the grille at lamp height.
    lampPods: [
      { y: 0.85, z: 1.85, radius: 0.095, offsets: [-0.6, 0.6] },
      { y: 0.64, z: 1.9, radius: 0.08, offsets: [-0.38, 0.38] },
    ],
  },
  rear: {
    // One band of lamps the width of the car: each cluster runs from a
    // hand inside the corner in to the plate, three cells across with the
    // pale reversing strip under them.
    lights: {
      x: 0.47,
      y: 0.79,
      width: 0.5,
      height: 0.24,
      cells: 3,
      lower: 0.35,
      lowerColor: 0xe8e4d8,
      bezel: 0.012,
      bezelColor: 0x17191d,
      depth: 0.04,
    },
    // The plate sits IN the lamp band, between the two clusters.
    plate: { y: 0.79, width: 0.36, height: 0.11 },
    // A deep body-colour bumper, and the black valance running down under
    // it to where the skirt ends — every centimetre of paint under a black
    // skirt is a centimetre the car looks jacked up.
    bumper: { y: 0.565, height: 0.19, depth: 0.08, wrap: 0.3, color: 0xf3f1eb },
    valance: { y: 0.39, height: 0.16, depth: 0.18, span: 1.4, color: 0x15171b },
    exhaust: { x: -0.4, y: 0.36, radius: 0.045 },
    deck: { half: 0.62, zFrom: -1.4, zTo: -1.95 },
  },
  colors: {
    paint: 0xf3f1eb,
    accent: 0x15171b,
    glass: 0x8fb0d2,
    trim: 0x15171b,
    hub: 0xf3f1eb,
    bumper: 0xf3f1eb,
    shadow: 0x14171b,
  },
};

export const CAR_BODIES: Record<string, CarBodySpec> = {
  compact: COMPACT_BODY,
  classic: CLASSIC_BODY,
  // Keyed by the catalog id, which predates the shape.
  coupe: SEDAN_BODY,
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
