// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE COCKPIT — what the driver sees, built for a lens that is sat inside
// the car rather than for a chase camera reading a window from ten metres
// back.
//
// car/interior.ts furnishes the cabin the FIELD is seen through: silhouette
// and contrast, authored to survive tinted glass at a car's length, and
// built fifteen times over. This file is the opposite bargain. It is built
// ONCE, for the player's car only, and it is drawn at arm's length — so it
// can afford a fascia with a face, a binnacle with needles that move, a
// full-size wheel on a column, pedals on the floor, cage bars up the screen
// pillars and a tunnel with a lever on it. The two are never up at the same
// time: the cockpit camera hides the interior and shows this (car-mesh.ts
// `setInside`), because from the driver's seat they occupy the same space.
//
// THE CABIN IS A METRE DEEP HERE, AND THAT IS THE WHOLE REASON THIS WORKS.
// `buildShell` lofts a CLOSED body, so out of the box there is an opaque
// deck at about the belt line running the length of the car, and everything
// a window can show sits in a tray some 350 mm deep between that deck and
// the roof. A seated driver and a 320 mm steering wheel do not fit in
// 350 mm — arrange them however you like, the wheel comes out at eye level
// with its bottom half sawn off by the floor. So a car built with a cockpit
// has that deck CUT AWAY under the cabin (`OpenCabin` in car/shell.ts), and
// this file is what closes the hole again: a floor down at footwell height,
// an inner sill each side, and a bulkhead at each end. Everything else in
// here is furniture standing on that floor at honest proportions.
//
// The other thing it must close is the SHELL. Every cabin panel the
// greenhouse draws faces out, so from inside they are back faces and are
// culled: without the lining, a look at the far door is a look at the sky.
// The lining is car/interior.ts's, called with the same cabin — one
// derivation of one pillar layout, not two.
//
// Positions are car-local metres, +z the nose, y from the ground, and +x
// the side the car is driven from — which is the LEFT of the frame, because
// the game's cameras look down +z (SEAT_SIDE in car/interior.ts).

import * as THREE from "three";

import { NO_DIRT } from "../car-dirt.ts";
import { MeshBuilder, mixHex, patchAt, plate, slab, solid, tube, type V3 } from "./builder.ts";
import { screenPanes } from "./greenhouse.ts";
import { LAYOUT, SEAT_SIDE, TRIM, buildLining, cabinOf, type Cabin } from "./interior.ts";
import type { OpenCabin } from "./shell.ts";
import type { CarBodySpec } from "./spec.ts";

/** Where the driver's eyes are, in the same car-local metres everything
 * else here is built in. camera-eye.ts mounts the lens on this, so the
 * cockpit and the camera cannot disagree about where the seat is. */
export type CockpitEye = { x: number; y: number; z: number };

/** The materials a cockpit is drawn with. It has three of its own rather
 * than sharing the body's one, and each split buys something:
 *
 *   `shell` — the cabin. It gets DARKER than the paint outside it, and at
 *   night nearly black: a closed box gets no sun, and a cabin lit like the
 *   bodywork is a cabin with a light on in it. One material for the whole
 *   room is what makes that a single number rather than a repaint.
 *
 *   `instrument` — the two dials. The only thing in here that is lit from
 *   BEHIND, so it is the only thing that must not take the world's light at
 *   all: at night the cabin goes to almost nothing and the instruments stay
 *   exactly as bright as they were, which is what a driver actually sees.
 *
 *   `tint` — the sun strip, which is translucent and cannot share a buffer
 *   with either. */
export type CockpitMaterials = {
  shell: THREE.Material;
  instrument: THREE.Material;
  tint: THREE.Material;
  /** The pane in the rear-view mirror, carrying the mirror pass's own
   * texture. Null leaves the mirror a dark housing with no image in it. */
  mirror: THREE.Material | null;
};

export type CarCockpit = {
  /** The whole first-person cabin. Hidden unless the cockpit camera is up. */
  group: THREE.Group;
  /** The live pane in the rear-view mirror — hidden when the rear view is
   * switched off, leaving the dark glass behind it. Null when no mirror
   * material was handed in. */
  mirrorGlass: THREE.Object3D | null;
  /** The steering wheel — car-mesh.ts turns it with the front tyres.
   * Rotating .z turns it in its own raked plane. */
  steering: THREE.Object3D;
  /** The two needles, in their own raked mounts. Rotating .z sweeps one. */
  tacho: THREE.Object3D;
  speedo: THREE.Object3D;
  eye: CockpitEye;
  dispose: () => void;
};

/**
 * EVERY KNOB THE COCKPIT HAS.
 *
 * Two datums, and which one a number hangs off says what it is really
 * measured against. The FLOOR is the cabin's own pan, cut down to footwell
 * height — seats, pedals, the wheel's hub and the tunnel are all human
 * dimensions off it, and they are the numbers a real car would recognise.
 * The SILL is the bottom edge of the side glass — the fascia and the eye
 * hang off that instead, because what they are really about is where the
 * window is.
 *
 * The three that decide whether the view WORKS:
 *
 *   `eye.rise` — how high the driver sits, over the sill. Higher shows more
 *   road over the dash; too high and the header rail comes down over the
 *   apex of every corner, because the screen aperture is fixed and the eye
 *   is walking up it.
 *
 *   `eye.ahead` — how far forward of the seat hinge the head is. Forward
 *   opens the screen up (an aperture subtends more as you approach it) and
 *   shrinks the gap to the wheel, which then fills the bottom of the frame.
 *
 *   `wheel.hub` — where the rim crosses the frame. The classic framing has
 *   the whole rim in shot with its top just under the base of the screen:
 *   higher and the driver is looking at the road through their own hands,
 *   lower and the bottom of the wheel falls out of the frame.
 *
 * The player moves the first two, and the field of view, from OPTIONS ▸
 * VIEW; these are where their MID setting sits.
 */
const RIG = {
  /** How far the cabin floor sits over the body's own underside, m. A real
   * footwell is a hand's depth above the road; this is that, and it is what
   * the cut-open deck (`OpenCabin`) makes room for. */
  floor: 0.1,
  eye: {
    /** Over the sill, m. */
    rise: 0.19,
    /** Ahead of the seat hinge, m. Negative — BEHIND the hinge, which is
     * where a driver's head actually is, and what puts a screen pillar on
     * each side of the road instead of only on the driver's own side. The
     * cabin framing the picture is most of what separates this view from a
     * lens taped to the scuttle. */
    ahead: -0.06,
    /** Off the centreline, as a fraction of the cabin's inner half-width —
     * the same seat offset the interior's furniture uses, so the lens sits
     * behind the wheel this file bolts to the same seat. */
    side: SEAT_SIDE,
  },
  dash: {
    /** Top of the fascia, under the sill, m. A real dash top sits BELOW the
     * base of the windscreen, and now that there is room for one it can:
     * what that buys is the sliver of the car's own bonnet under the wipers,
     * which is most of what says this is a view from inside something. */
    top: -0.03,
    /** How far back from the cowl the fascia's rear edge stands, m. */
    back: 0.34,
    /** The crash pad along that rear edge: how far it stands proud, m. */
    lip: 0.03,
    /** How far the knee bolster under the fascia is tucked back, m. */
    knee: 0.12,
    /** Vents in the fascia face: half-width, height and how far apart, m. */
    vent: { half: 0.07, height: 0.04, gap: 0.3 },
  },
  binnacle: {
    /** The pod over the dials: how far it stands over their tops, m, the
     * margin it leaves round them, and how far it reaches BACK toward the
     * driver. That last one is short on purpose — the steering wheel sits
     * between the driver and the dash, and a pod that reaches past the hub
     * is a pod drawn over the wheel it is supposed to be read through. */
    hood: 0.02,
    margin: 0.015,
    depth: 0.025,
    /** How far the instrument face leans back toward the driver, rad. */
    rake: 0.4,
  },
  dials: {
    /** The rev counter and the speedometer, m. */
    /** The rev counter and the speedometer, m. Sized so the PAIR fits inside
     * the top half of the steering wheel's own opening: that is where a
     * driver's eye finds them, and instruments that spill past the rim are
     * instruments the wheel is permanently drawn across. */
    tacho: 0.055,
    speedo: 0.048,
    /** Between their centres, m. */
    gap: 0.115,
    /** The dial centres over the floor, m — just over the steering wheel's
     * own hub, which puts them BEHIND the wheel rather than over it. The
     * rim's top arc then crosses each dial as a thin line and the rest is
     * read through the opening, which is where a driver reads a dial in any
     * car.
     *
     * THE CEILING ON THIS IS THE COWL, not taste. The instrument pod stands
     * `tacho + margin + hood` over the dial centres, and the moment the top
     * of it rises above the line from the eye to the base of the windscreen
     * it stops being a dashboard and starts being a thing parked in the
     * road. Same for the rim of the wheel below it. Both are set here to
     * land just under that line. */
    over: 0.58,
    /** Where a needle stands at zero and how far it sweeps, rad. 7:30 round
     * to 4:30 over the top — 270° of travel, the period instrument. */
    zero: (225 * Math.PI) / 180,
    sweep: (270 * Math.PI) / 180,
    /** How many graduations round the sweep, and how often one of them is a
     * long one. Twenty divisions with every fourth long is the period
     * instrument: 0–10 on the tacho with a mark every 500 rpm. */
    ticks: 20,
    majorEvery: 4,
    /** Where the tacho's red band starts, as a fraction of the sweep. */
    redline: 0.82,
    /** How fast the speedometer reads at full deflection, m/s. */
    topSpeed: 61,
  },
  wheel: {
    /** The hub, over the floor and ahead of the seat hinge, m — low enough
     * that the top of the rim clears the base of the windscreen (see
     * `dials.over`), and high enough that the bottom of it stays inside the
     * frame. Those two together are the whole of what fixes it. */
    hub: 0.53,
    ahead: 0.58,
    /** A 320 mm rim — the size a rally car actually carries, which is only
     * placeable at all because the deck came out. */
    radius: 0.155,
    /** Rim section, m, and the rake, rad — how far the TOP of the wheel
     * leans AWAY from the driver.
     *
     * That direction is the one a column decides: it runs down and forward
     * out of the hub into the dash, and the wheel is square to it, so the
     * rim's face is tipped up at the driver with its top edge the far one.
     * Raked the other way the wheel reads as fitted backwards. It also costs
     * frame: leaning the top away brings the BOTTOM of the rim toward the
     * lens, where it is magnified, so a wheel raked forward eats more of the
     * picture than the same wheel raked back and has to be smaller and
     * higher to stay inside it. */
    rim: 0.019,
    rake: 0.28,
    /** Radians of wheel at full steering lock. Nearer a real rally car's
     * three turns lock-to-lock than the interior's quarter-turn read: at
     * arm's length the spokes and the twelve o'clock marker carry the
     * angle, so the wheel can move as far as the driver's hands do. */
    turn: 2.1,
    /** The column: how far below and behind the hub it runs into the dash,
     * m, and its section. */
    columnDrop: 0.1,
    columnSection: 0.03,
  },
  /** The pedals: how far apart, how big, how far back from the cowl they
   * stand and how far they lean, m and rad. Barely ever in frame — they are
   * what the footwell has in it when a landing throws the head down. */
  pedals: { gap: 0.11, width: 0.07, height: 0.13, ahead: 0.34, rake: 0.5 },
  /** The seats: the squab over the floor, the back's top over it, how far
   * the back leans, and its half-width — m and rad. */
  seat: { squab: 0.14, back: 0.62, lean: 0.2, half: 0.24 },
  /** The tunnel between the seats: half-width, how high it stands over the
   * floor, and where the lever's knob sits over it, m. */
  tunnel: { half: 0.12, rise: 0.24, lever: 0.17 },
  pillars: {
    /** Cage bar section up the screen pillars, m, and the padding over it. */
    bar: 0.028,
    pad: 0.036,
  },
  /** The rear-view mirror, hung off the header at the top middle of the
   * screen: half-width, half-height, how deep the housing is and how far
   * back from the header's own line it hangs, m. It is DARK glass rather
   * than a second view of the road — the rear view the player actually
   * reads is the HUD's strip, which answers the same question in every
   * camera. What this one is for is the shape: a mirror hanging in the top
   * of the windscreen is one of the two or three things that say "sat in a
   * rally car" before anything else in the frame does. */
  mirror: { half: 0.095, deep: 0.026, back: 0.04, side: 0.5 },
  /** The switch panel on the passenger half of the fascia: how many
   * rockers, how big each is and how far apart, m. */
  switches: { count: 4, width: 0.045, height: 0.032, gap: 0.058 },
  /** The sun strip across the top of the screen: how far down the glass it
   * reaches as a fraction of the pane, and how solid it is at the header
   * (it fades to nothing at its lower edge). A real one is a hand's width
   * of tint at the very top — reaching further down takes the sky out of
   * the picture rather than the glare, and a stage's sky is half of what
   * says what time of day it is. */
  strip: { drop: 0.16, alpha: 0.5 },
} as const;

/** The cockpit's own palette. It sits a clear step above car/interior.ts's:
 * that one is read through a tinted pane doing its own blending, and this
 * one is not — but the fullbright bake still takes a third off anything
 * facing away from the sun, and almost every surface in here faces the
 * driver, which is away from it. What has to survive is the LADDER: a dark
 * fascia the road reads against, a lighter pad and door card so the cabin
 * has depth, and one bright thing — the cage — that says rally car. */
const HUE = {
  fascia: 0x22262d,
  /** The floor, a clear step under the fascia above it. */
  floor: 0x2b3037,
  /** The inner sills and bulkheads: body-side panels rather than trim, so a
   * shade between the floor and the lining above them. */
  hull: 0x343a42,
  pad: 0x33383f,
  card: 0x3d434d,
  face: 0x14171c,
  bezel: 0xb9c0cb,
  tick: 0xe6eaf0,
  needle: 0xe23b32,
  red: 0xc4353a,
  rim: 0x1d2026,
  grip: 0x33383f,
  lever: 0x22262c,
  boot: 0x1a1d22,
  metal: 0x8f97a2,
  strip: 0x2f6ba8,
  /** The cage, at arm's length. car/interior.ts paints its bars nearly white
   * because they are read through tinted glass at a car's length and have to
   * survive it; from the seat the same white is the brightest thing in the
   * frame and sits right where the corner is. Muted here — still a clear
   * step above the trim, no longer the thing the eye goes to. */
  cage: 0x99a2ae,
};

/** Everything the cockpit is laid out against, resolved once. `Cabin` gives
 * the glass tray; this adds the floor the deck cut opened up under it. */
type Room = {
  cabin: Cabin;
  /** The cabin floor, m. */
  floorY: number;
  /** Half-width of the floor, and of the deck opening over it, m. */
  half: number;
  /** Where the driver sits, m off the centreline. */
  driverX: number;
};

function roomOf(spec: CarBodySpec): Room {
  const cabin = cabinOf(spec);
  return {
    cabin,
    floorY: spec.floorY + RIG.floor,
    half: cabin.inner,
    driverX: cabin.inner * SEAT_SIDE,
  };
}

/** Where the deck has to be cut for this body to hold a cockpit — handed to
 * car/shell.ts, so the loft and the hull that closes it again are derived
 * from one opening rather than two. */
export function cabinOpening(spec: CarBodySpec): OpenCabin {
  const room = roomOf(spec);
  return { zFrom: room.cabin.cowlZ, zTo: room.cabin.rearZ, half: room.half };
}

/** Where the driver's eyes sit on a given body. Derived from the same room
 * the furniture is built in, so a low sedan seats the shot lower than an
 * upright hatch and each one looks over its own wheel. */
export function cockpitEyeFor(spec: CarBodySpec): CockpitEye {
  const room = roomOf(spec);
  return {
    x: room.driverX,
    y: room.cabin.sillY + RIG.eye.rise,
    z: room.cabin.hipZ + RIG.eye.ahead,
  };
}

/** A wall in the plane x = const, and one in the plane z = const, each with
 * its normal pointed where it is asked to.
 *
 * WINDING IS THE TRAP IN THIS WHOLE FILE, and it is a silent one: a
 * single-sided face wound the wrong way round is not an error, it is a
 * surface that is simply not there — and "not there" inside a car body is a
 * hole with the landscape showing through it. Every hand-wound quad in a
 * cockpit faces INWARD, at the driver, which is the opposite of everything
 * car/shell.ts and car/greenhouse.ts wind; and half of them are mirrored,
 * so the same corner order faces opposite ways on the two sides. Stating
 * the facing rather than the corner order is what stops that being a coin
 * flip. Corners are given low-to-high on both axes; `facing` is the sign of
 * the axis the normal points along. */
function wallX(
  b: MeshBuilder,
  x: number,
  y0: number,
  y1: number,
  z0: number,
  z1: number,
  color: number,
  facing: number,
): void {
  const p: V3[] = [
    [x, y0, z0],
    [x, y0, z1],
    [x, y1, z1],
    [x, y1, z0],
  ];
  if (facing < 0) b.quad(p[0], p[1], p[2], p[3], color);
  else b.quad(p[3], p[2], p[1], p[0], color);
}

function wallZ(
  b: MeshBuilder,
  z: number,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  color: number,
  facing: number,
): void {
  const p: V3[] = [
    [x0, y0, z],
    [x1, y0, z],
    [x1, y1, z],
    [x0, y1, z],
  ];
  if (facing > 0) b.quad(p[0], p[1], p[2], p[3], color);
  else b.quad(p[3], p[2], p[1], p[0], color);
}

/** THE HULL: the floor, the two inner sills and the bulkhead at each end.
 *
 * This is the part that is not decoration. `OpenCabin` takes the middle of
 * the body's top deck out between the cowl and the rear bulkhead, and
 * without these four surfaces the car has a hole in it — the underbody's
 * own faces point down and are culled from above, so a look at the footwell
 * would be a look at the landscape through the floor. */
function buildHull(b: MeshBuilder, room: Room): void {
  const { cabin, floorY, half } = room;
  plate(b, half, floorY, cabin.cowlZ, cabin.rearZ, HUE.floor, true);
  for (const side of [-1, 1]) {
    // The inner sill: from the floor up to the ledge of deck the cut left
    // standing, which is the strip the side windows sit on. Faced inward,
    // which on this side means −side.
    wallX(
      b,
      side * half,
      floorY,
      cabin.panY,
      cabin.rearZ,
      cabin.cowlZ,
      side > 0 ? HUE.hull : mixHex(HUE.hull, HUE.fascia, 0.3),
      -side,
    );
  }
  // The two ends. Forward is the engine bulkhead — without it the footwell
  // opens into the space under the bonnet, which is not a space, it is the
  // outside. Aft is the boot floor, for the same reason. Both face back into
  // the cabin, so the front one points at the tail and the rear one at the
  // nose.
  wallZ(b, cabin.cowlZ, -half, half, floorY, cabin.panY, HUE.hull, -1);
  wallZ(b, cabin.rearZ, -half, half, floorY, cabin.panY, HUE.hull, 1);
}

/** The fascia: a top that slopes down to the base of the screen, a face
 * under it and a knee bolster tucked under that.
 *
 * The top is a quad rather than a box because it is seen almost edge-on
 * from the seat — what a driver actually reads is the LINE where it meets
 * the screen, and a box gives that line a second edge a centimetre away
 * that reads as a crack in the dash. */
function buildFascia(b: MeshBuilder, room: Room): void {
  const { cabin, floorY, half, driverX } = room;
  const backZ = cabin.cowlZ - RIG.dash.back;
  const topY = cabin.sillY + RIG.dash.top;
  const wide = half * 0.99;
  // Down to the base of the screen: the front edge lands ON the cowl, so
  // there is no gap between the dash and the glass for the landscape to
  // show through.
  const frontY = cabin.cowlY + 0.006;
  b.quad(
    [-wide, frontY, cabin.cowlZ],
    [wide, frontY, cabin.cowlZ],
    [wide, topY, backZ],
    [-wide, topY, backZ],
    HUE.fascia,
  );
  slab(b, [wide * 2, RIG.dash.lip, RIG.dash.lip], [0, topY, backZ + 0.01], HUE.pad);
  // The face, and the knee bolster tucked under it. Two planes rather than
  // one, because the fold between them is the only thing giving most of a
  // metre of dark panel any shape at all.
  const kneeY = floorY + (topY - floorY) * 0.45;
  wallZ(b, backZ, -wide, wide, kneeY, topY, HUE.fascia, -1);
  // The bolster tucks FORWARD as it falls, so it is a slope rather than a
  // second wall — wound by hand, facing back and up at the driver's knees.
  const kneeZ = backZ + RIG.dash.knee;
  b.quad(
    [-wide, floorY, kneeZ],
    [wide, floorY, kneeZ],
    [wide, kneeY, backZ],
    [-wide, kneeY, backZ],
    mixHex(HUE.fascia, HUE.floor, 0.4),
  );
  const v = RIG.dash.vent;
  for (const side of [-1, 1]) {
    slab(b, [v.half * 2, v.height, 0.02], [side * v.gap, topY - 0.055, backZ - 0.005], HUE.face);
  }
  // The switch panel on the passenger half of the fascia — the row of
  // rockers every rally car carries for the lamps, the pumps and the wipers.
  // Small, pale and evenly spaced: at this range what reads is the RHYTHM of
  // a row of switches, not any one of them.
  const sw = RIG.switches;
  const panelX = -driverX;
  for (let i = 0; i < sw.count; i++) {
    const x = panelX + (i - (sw.count - 1) / 2) * sw.gap;
    slab(b, [sw.width, sw.height, 0.018], [x, topY - 0.115, backZ - 0.009], HUE.pad);
    slab(b, [sw.width * 0.6, sw.height * 0.3, 0.008], [x, topY - 0.11, backZ - 0.018], HUE.metal);
  }
  // The passenger's grab handle — the one piece of hardware that says
  // somebody else rides in here.
  const grab = -driverX;
  tube(
    b,
    [grab - 0.14, topY - 0.05, backZ - 0.03],
    [grab + 0.12, topY - 0.05, backZ - 0.03],
    0.016,
    HUE.pad,
    6,
  );
}

/** One dial, baked into the cockpit's own mesh, with its needle handed back
 * on a mount of its own. Everything is built in the dial's plane and swung
 * onto the binnacle's rake, so a needle only ever has to rotate about its
 * own z. */
function buildDial(
  b: MeshBuilder,
  material: THREE.Material,
  at: V3,
  radius: number,
  redline: boolean,
  geos: THREE.BufferGeometry[],
): { mount: THREE.Object3D; needle: THREE.Object3D } {
  const rake = RIG.binnacle.rake;
  /** The dial's plane, carried onto the binnacle.
   *
   * The half-turn is not decoration and it is not optional. The camera looks
   * down the car's +z, and a camera looking down +z has world +x on the LEFT
   * of the frame — so a dial built in the obvious xy plane comes out MIRRORED
   * (the red band at the bottom left, the sweep running backwards) with its
   * needle behind the face it is supposed to point at. Turning the whole dial
   * frame by π about y fixes both at once: the face ends up pointing at the
   * driver, the dial's own +x ends up on the driver's right, and everything
   * built a few millimetres in front of the face is a few millimetres nearer
   * the eye. `mount` below carries the same pair, in the same order. */
  const onDial = (geo: THREE.BufferGeometry): THREE.BufferGeometry =>
    geo.rotateY(Math.PI).rotateX(rake).translate(at[0], at[1], at[2]);

  solid(b, onDial(new THREE.CircleGeometry(radius, 28)), HUE.face);
  solid(b, onDial(new THREE.TorusGeometry(radius, radius * 0.06, 4, 28)), HUE.bezel);
  // Ticks around the sweep, and a red band over the top of the tacho's: a
  // needle with nothing to read against is a moving stick.
  //
  // MINORS BETWEEN THE MAJORS, and they are what stop the instrument reading
  // as a toy. A dial is close enough here to see individual marks, and a
  // half-dozen chunky ones round a black disc is a cartoon of a dial; the
  // real thing is a fine graduation with every fifth mark longer, and the
  // eye reads the DENSITY before it reads any single mark.
  const steps = RIG.dials.ticks;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const a = RIG.dials.zero - t * RIG.dials.sweep;
    const major = i % RIG.dials.majorEvery === 0;
    const geo = new THREE.BoxGeometry(
      radius * (major ? 0.24 : 0.12),
      radius * (major ? 0.055 : 0.03),
      0.006,
    )
      .translate(radius * (major ? 0.83 : 0.89), 0, 0)
      .rotateZ(a);
    solid(b, onDial(geo), redline && t >= RIG.dials.redline ? HUE.red : HUE.tick);
  }
  if (redline) {
    const steps = 5;
    for (let i = 0; i < steps; i++) {
      const t = RIG.dials.redline + ((1 - RIG.dials.redline) * i) / (steps - 1);
      const a = RIG.dials.zero - t * RIG.dials.sweep;
      const geo = new THREE.BoxGeometry(radius * 0.11, radius * 0.09, 0.005)
        .translate(radius * 0.63, 0, 0)
        .rotateZ(a);
      solid(b, onDial(geo), HUE.red);
    }
  }

  const nb = new MeshBuilder();
  // Thick for its length: the needle is read at a dial 600 mm away through
  // the rim of a steering wheel, and a scale-correct one is a couple of
  // pixels wide there — which is a dial with nothing in it.
  slab(nb, [radius * 0.95, radius * 0.11, 0.006], [radius * 0.33, 0, 0.013], HUE.needle);
  solid(
    nb,
    new THREE.CylinderGeometry(radius * 0.12, radius * 0.12, 0.02, 10).rotateX(Math.PI / 2),
    HUE.bezel,
  );
  const geo = nb.geometry();
  geos.push(geo);
  const needle = new THREE.Mesh(geo, material);
  needle.userData[NO_DIRT] = true;
  // The same rake-then-half-turn `onDial` bakes, as NESTED groups rather than
  // as one Euler: three's Euler order is a composition rule to look up, and
  // the needle's own spin has to land inside it, so the chain is spelled out
  // instead. Outer takes the rake, inner the half-turn, the needle its angle.
  const mount = new THREE.Group();
  mount.position.set(at[0], at[1], at[2]);
  mount.rotation.x = rake;
  const flip = new THREE.Group();
  flip.rotation.y = Math.PI;
  flip.add(needle);
  mount.add(flip);
  return { mount, needle };
}

/** The instrument pod and the two dials in it. It stands proud of the dash
 * top, which is where a period rally car's binnacle is and — more to the
 * point — is what puts the tops of the dials above the rim of the wheel in
 * front of them. Everything below that line is read through the wheel, the
 * way it is in any car. */
function buildBinnacle(
  b: MeshBuilder,
  dialBuilder: MeshBuilder,
  material: THREE.Material,
  room: Room,
  geos: THREE.BufferGeometry[],
): { tacho: THREE.Object3D; speedo: THREE.Object3D; mounts: THREE.Object3D[] } {
  const { cabin, floorY, driverX } = room;
  const backZ = cabin.cowlZ - RIG.dash.back;
  const dialY = floorY + RIG.dials.over;
  const half = RIG.dials.gap / 2 + RIG.dials.tacho + RIG.binnacle.margin;
  const tall = RIG.dials.tacho + RIG.binnacle.margin;
  const faceZ = backZ - 0.012;
  // The pod: a hood over the top and a cheek either side, open toward the
  // driver so nothing of it is drawn between the dials and the eye reading
  // them.
  const hoodY = dialY + tall + RIG.binnacle.hood;
  b.quad(
    [driverX - half, hoodY, backZ],
    [driverX + half, hoodY, backZ],
    [driverX + half, hoodY - 0.03, faceZ - RIG.binnacle.depth],
    [driverX - half, hoodY - 0.03, faceZ - RIG.binnacle.depth],
    HUE.pad,
  );
  for (const side of [-1, 1]) {
    // The cheeks are the OUTSIDE of the pod, so unlike everything else in
    // here they face away from its middle.
    wallX(
      b,
      driverX + side * half,
      dialY - tall,
      hoodY - 0.03,
      faceZ - RIG.binnacle.depth,
      backZ,
      side > 0 ? HUE.pad : HUE.fascia,
      side,
    );
  }
  const panel = new THREE.BoxGeometry(half * 2, (tall + RIG.binnacle.hood) * 2, 0.012)
    .rotateX(RIG.binnacle.rake)
    .translate(driverX, dialY, faceZ);
  solid(b, panel, mixHex(HUE.face, HUE.fascia, 0.4));

  // Both dials go into the INSTRUMENT builder, not the cabin's: every face
  // of them — the black disc, the bezel, the graduations, the red band and
  // the needle — is lit from behind and must stay lit when the cabin around
  // it goes dark.
  const tacho = buildDial(
    dialBuilder,
    material,
    [driverX + RIG.dials.gap / 2, dialY, faceZ - 0.008],
    RIG.dials.tacho,
    true,
    geos,
  );
  const speedo = buildDial(
    dialBuilder,
    material,
    [driverX - RIG.dials.gap / 2, dialY, faceZ - 0.008],
    RIG.dials.speedo,
    false,
    geos,
  );
  return { tacho: tacho.needle, speedo: speedo.needle, mounts: [tacho.mount, speedo.mount] };
}

/** The wheel, about its own centre and in its own plane, so a mount can
 * rake it and a transform can turn it. Three spokes and a marker at twelve
 * o'clock: at arm's length the marker is what the driver reads the lock
 * off, and the spokes are what makes it legible when it is not at the top. */
function buildWheelGeometry(b: MeshBuilder, accent: number): void {
  const r = RIG.wheel.radius;
  solid(b, new THREE.TorusGeometry(r, RIG.wheel.rim, 6, 24), HUE.rim);
  // The suede at nine and three: two arcs of a fatter, paler section.
  for (const side of [0, Math.PI]) {
    const grip = new THREE.TorusGeometry(r, RIG.wheel.rim * 1.3, 5, 8, Math.PI / 2.6).rotateZ(
      side - Math.PI / 5.2,
    );
    solid(b, grip, HUE.grip);
  }
  // The twelve o'clock marker: a band ACROSS the rim rather than a block on
  // top of it. Wide, shallow and no deeper than the rim it wraps — at this
  // range it is the one saturated colour in the cabin, and any of it standing
  // proud reads as a lump on the wheel rather than as a marking.
  solid(
    b,
    new THREE.BoxGeometry(0.055, RIG.wheel.rim * 0.9, RIG.wheel.rim * 1.5).translate(0, r, 0),
    accent,
  );
  solid(b, new THREE.CylinderGeometry(0.042, 0.042, 0.034, 10).rotateX(Math.PI / 2), HUE.rim);
  solid(b, new THREE.CylinderGeometry(0.022, 0.022, 0.04, 8).rotateX(Math.PI / 2), HUE.metal);
  // A T, not an upside-down Y: one spoke out to nine o'clock, one to three,
  // and one straight DOWN to six. That is the period three-spoke rally
  // wheel, and it is also the only arrangement that leaves the top of the
  // wheel clear — a spoke standing up at twelve o'clock crosses the
  // instruments behind it and reads as a wheel fitted the wrong way up.
  for (const a of [0, Math.PI, -Math.PI / 2]) {
    const spoke = new THREE.BoxGeometry(r, 0.026, 0.013).translate(r / 2, 0, 0).rotateZ(a);
    solid(b, spoke, HUE.grip);
  }
}

/** The column and the pedals. Neither is in frame often — but a landing
 * throws the driver's head down, and a footwell with nothing in it is the
 * moment the cabin stops being a room. */
function buildFootwell(b: MeshBuilder, room: Room, wheelY: number, wheelZ: number): void {
  const { floorY, driverX } = room;
  tube(
    b,
    [driverX, wheelY, wheelZ],
    [driverX, wheelY - RIG.wheel.columnDrop, wheelZ + 0.26],
    RIG.wheel.columnSection,
    HUE.fascia,
    6,
  );
  const p = RIG.pedals;
  for (const [i, wide] of [0.9, 1, 1.15].entries()) {
    slab(
      b,
      [p.width * wide, p.height, 0.02],
      [driverX + (i - 1) * p.gap, floorY + p.height * 0.4, room.cabin.cowlZ - p.ahead],
      HUE.metal,
      p.rake,
    );
  }
}

/** The screen pillars, the header rail and the door cards. All exist for
 * the same reason: from the seat the windscreen is an APERTURE, and an
 * aperture with no frame around it is a hole. The cage bars up the pillars
 * are what makes the frame read as a rally car's rather than a road car's,
 * and they are placed inside the pillar, where a real one is welded. */
function buildPillars(
  b: MeshBuilder,
  room: Room,
  mirrorAspect: number,
  mirrorMaterial: THREE.Material | null,
): THREE.Object3D | null {
  const { cabin, floorY, half } = room;
  const spec = cabin.spec;
  const top = cabin.roofY - 0.02;
  const hoopZ = cabin.hipZ - LAYOUT.hoopBehind;
  for (const side of [-1, 1]) {
    const roofFront: V3 = [side * (spec.cabin.roofHalf - 0.07), top, spec.cabin.roofFrontZ + 0.05];
    const foot: V3 = [side * (half - 0.02), cabin.sillY - 0.04, cabin.cowlZ - 0.05];
    tube(b, foot, roofFront, RIG.pillars.pad, HUE.cage, 6);
    // Back along the roof edge to the main hoop, which carries the eye out
    // of the corner of the screen instead of stopping it dead — and then
    // down the hoop's own leg, which is the bar a head thrown sideways
    // finds and the one that gives the cabin depth.
    const hoopTop: V3 = [side * (half - 0.02), top, hoopZ];
    tube(b, roofFront, hoopTop, RIG.pillars.bar, HUE.cage, 6);
    tube(b, hoopTop, [side * (half - 0.02), floorY, hoopZ], RIG.pillars.bar, HUE.cage, 6);
    // The door card, and the capping along the sill over it.
    const zFront = cabin.cowlZ - 0.02;
    const zRear = cabin.hipZ - 0.5;
    wallX(
      b,
      side * (half - 0.004),
      cabin.panY - 0.16,
      cabin.sillY + 0.03,
      zRear,
      zFront,
      side > 0 ? HUE.card : mixHex(HUE.card, HUE.fascia, 0.35),
      -side,
    );
    slab(
      b,
      [0.055, 0.03, zFront - zRear],
      [side * (half - 0.03), cabin.sillY + 0.035, (zFront + zRear) / 2],
      HUE.pad,
    );
  }
  const rail = spec.cabin.roofHalf - 0.08;
  tube(
    b,
    [-rail, top, spec.cabin.roofFrontZ + 0.05],
    [rail, top, spec.cabin.roofFrontZ + 0.05],
    RIG.pillars.bar,
    HUE.cage,
    6,
  );
  return buildMirror(b, room, top, mirrorAspect, mirrorMaterial);
}

/** THE REAR-VIEW MIRROR, hanging off the header in the top middle of the
 * windscreen — where a driver's own eye expects to find it.
 *
 * It is not decoration: the mirror pass's picture is put IN it (mirror.ts),
 * so from the cockpit the road behind is read off a piece of the car rather
 * than off a strip pasted at the top of the screen. Being geometry is the
 * whole point — it hangs where the car hangs it, so it swings with the body
 * on its springs and slides across the frame as the driver's head is thrown
 * about, which a screen-space strip can never do.
 *
 * The pane's UVs run along the car's −x, which cancels the reverse the
 * mirror texture already carries for the HUD's strip. A strip is looked at
 * head-on and needs the flip; a pane INSIDE the scene is seen from the
 * driver's side, where world +x is already on the left of the frame, and
 * flipping it again would put the car overtaking on the left in the right of
 * the glass. */
function buildMirror(
  b: MeshBuilder,
  room: Room,
  headerY: number,
  aspect: number,
  material: THREE.Material | null,
): THREE.Object3D | null {
  const m = RIG.mirror;
  const tall = m.half / aspect;
  const z = room.cabin.spec.cabin.roofFrontZ + m.back;
  const y = headerY - tall - 0.006;
  // Not on the centreline. A mirror really is bolted to the middle of the
  // screen, but the driver is not sat there — and from a seat this far off
  // centre in a cabin this narrow, the middle of the car is most of the way
  // to the far pillar. Pulled back toward the driver it lands where the eye
  // expects it, at the top of the screen rather than the corner of it.
  const x = room.driverX * m.side;
  slab(b, [m.half * 2, tall * 2, m.deep], [x, y, z], HUE.rim);
  // The dark backing, so a mirror with no picture in it is still a mirror.
  const face = z - m.deep / 2 - 0.002;
  wallZ(
    b,
    face,
    x - (m.half - 0.008),
    x + m.half - 0.008,
    y - tall + 0.006,
    y + tall - 0.006,
    HUE.face,
    -1,
  );
  if (!material) return null;
  const geo = new THREE.PlaneGeometry((m.half - 0.008) * 2, (tall - 0.006) * 2)
    .rotateY(Math.PI)
    .translate(x, y, face - 0.002);
  const glass = new THREE.Mesh(geo, material);
  glass.userData[NO_DIRT] = true;
  return glass;
}

/** The tunnel between the seats, the lever and handbrake on it, and the two
 * seats either side. Only the edges of the seats are ever in frame — the
 * driver's own is behind the lens and the co-driver's is off to the side —
 * but a wide field of view finds both, and an empty floor where a seat
 * should be is what gives a cockpit away as a box with a dashboard in it. */
function buildFurniture(b: MeshBuilder, room: Room): void {
  const { cabin, floorY, driverX } = room;
  const t = RIG.tunnel;
  const topY = floorY + t.rise;
  const zFront = cabin.cowlZ - RIG.dash.back;
  const zRear = cabin.hipZ - 0.34;
  slab(
    b,
    [t.half * 2, t.rise, zFront - zRear],
    [0, (topY + floorY) / 2, (zFront + zRear) / 2],
    HUE.card,
  );
  const leverZ = cabin.hipZ + 0.3;
  const lean = Math.sign(driverX) * 0.1;
  slab(b, [0.08, 0.035, 0.08], [0, topY + 0.012, leverZ], HUE.boot);
  tube(b, [0, topY, leverZ], [lean, topY + t.lever, leverZ - 0.04], 0.015, HUE.lever, 6);
  solid(
    b,
    new THREE.SphereGeometry(0.034, 7, 5).translate(lean, topY + t.lever, leverZ - 0.04),
    HUE.lever,
  );
  // The handbrake, alongside and further back — the rally lever, which is
  // longer than a road car's and lies flatter.
  const brakeX = Math.sign(driverX) * 0.05;
  tube(
    b,
    [brakeX, topY, cabin.hipZ + 0.02],
    [brakeX, topY + 0.1, cabin.hipZ + 0.28],
    0.015,
    HUE.lever,
    6,
  );

  const s = RIG.seat;
  for (const side of [-1, 1]) {
    const x = cabin.inner * SEAT_SIDE * side;
    const squabY = floorY + s.squab;
    const backTop = floorY + s.back;
    const backMid = (backTop + squabY) / 2;
    const height = backTop - squabY;
    slab(b, [s.half * 2, s.squab, 0.5], [x, floorY + s.squab / 2, cabin.hipZ - 0.06], TRIM.seat);
    slab(b, [s.half * 2, height, 0.12], [x, backMid, cabin.hipZ - 0.3], TRIM.seat, s.lean);
    slab(b, [0.26, 0.16, 0.12], [x, backTop + 0.06, cabin.hipZ - 0.36], TRIM.seat, s.lean);
    for (const bolster of [-1, 1]) {
      slab(
        b,
        [0.07, height * 0.9, 0.2],
        [x + bolster * (s.half - 0.03), backMid, cabin.hipZ - 0.25],
        TRIM.seatFace,
        s.lean,
      );
    }
    for (const strap of [-1, 1]) {
      slab(
        b,
        [0.075, height * 0.9, 0.02],
        [x + strap * 0.1, backMid + 0.03, cabin.hipZ - 0.16],
        TRIM.harness,
        s.lean,
        strap * 0.16,
      );
    }
  }
}

/** The sun strip: a tinted band across the top of the windscreen, laid on
 * the glass so it takes the screen's own warp. It is the one piece of the
 * cockpit that is translucent, so it carries its own material — and it
 * earns it, because a band of colour along the top of the frame is what
 * stops the sky reading as the top half of the picture, which is exactly
 * what a real one is fitted for. */
function buildSunStrip(b: MeshBuilder, cabin: Cabin, accent: number): void {
  const { rect, patch } = screenPanes(cabin.spec).front;
  const v1 = rect.v1;
  const v0 = Math.max(rect.v0, rect.v1 - (rect.v1 - rect.v0) * RIG.strip.drop);
  const color = mixHex(HUE.strip, accent, 0.25);
  // Lifted off the glass toward the cabin — the pane itself is drawn proud
  // of the panel, and a strip on the wrong side of it is a strip nobody in
  // the car can see.
  const lift = 0.004;
  const inward = (u: number, v: number): V3 => {
    const p = patchAt(patch, u, v);
    return [p[0], p[1], p[2] - lift];
  };
  // ...and wound to face the DRIVER, which is the reverse of the cabin
  // panel's own order. Worth spelling out, because getting it backwards
  // costs a silently invisible mesh rather than an error: the game's cameras
  // look down the car's +z, and a camera looking down +z has world +x on the
  // LEFT of the frame — so the panel's outward cycle (−x low, +x low, +x
  // high, −x high) reads CLOCKWISE from inside the car, and a clockwise face
  // is a back face. This runs the other way: sill first, header last.
  b.quadFade(
    inward(rect.u1, v0),
    inward(rect.u0, v0),
    inward(rect.u0, v1),
    inward(rect.u1, v1),
    color,
    color,
    0,
    RIG.strip.alpha,
  );
}

export function buildCockpit(
  spec: CarBodySpec,
  materials: CockpitMaterials,
  mirrorAspect: number,
): CarCockpit {
  const room = roomOf(spec);
  const { cabin } = room;
  const b = new MeshBuilder();
  const ib = new MeshBuilder();
  const geos: THREE.BufferGeometry[] = [];
  const group = new THREE.Group();

  // The lining closes the greenhouse; the hull closes the body under it.
  // The lining's own flat pan is left out — it sits at the old deck height,
  // which is now most of a metre above this cabin's floor.
  buildLining(b, cabin, false);
  buildHull(b, room);
  buildFascia(b, room);
  const { tacho, speedo, mounts } = buildBinnacle(b, ib, materials.instrument, room, geos);
  const mirrorGlass = buildPillars(b, room, mirrorAspect, materials.mirror);
  buildFurniture(b, room);

  const wheelY = room.floorY + RIG.wheel.hub;
  const wheelZ = cabin.hipZ + RIG.wheel.ahead;
  buildFootwell(b, room, wheelY, wheelZ);

  const wb = new MeshBuilder();
  buildWheelGeometry(wb, spec.colors.accent);
  const wheelGeo = wb.geometry();
  geos.push(wheelGeo);
  const wheel = new THREE.Mesh(wheelGeo, materials.shell);
  wheel.userData[NO_DIRT] = true;
  const wheelMount = new THREE.Group();
  wheelMount.position.set(room.driverX, wheelY, wheelZ);
  wheelMount.rotation.x = RIG.wheel.rake;
  wheelMount.add(wheel);

  const shellGeo = b.geometry();
  geos.push(shellGeo);
  const shell = new THREE.Mesh(shellGeo, materials.shell);
  shell.userData[NO_DIRT] = true;
  const dialGeo = ib.geometry();
  geos.push(dialGeo);
  const dials = new THREE.Mesh(dialGeo, materials.instrument);
  dials.userData[NO_DIRT] = true;
  group.add(shell, dials, wheelMount, ...mounts);
  if (mirrorGlass) {
    geos.push((mirrorGlass as THREE.Mesh).geometry);
    group.add(mirrorGlass);
  }

  // The strip goes on last and is drawn after the glass it lies on.
  const sb = new MeshBuilder(true);
  buildSunStrip(sb, cabin, spec.colors.accent);
  if (!sb.empty) {
    const stripGeo = sb.geometry();
    geos.push(stripGeo);
    const strip = new THREE.Mesh(stripGeo, materials.tint);
    strip.renderOrder = 2;
    strip.userData[NO_DIRT] = true;
    group.add(strip);
  }

  group.visible = false;
  return {
    group,
    mirrorGlass,
    steering: wheel,
    tacho,
    speedo,
    eye: cockpitEyeFor(spec),
    dispose: () => {
      for (const geo of geos) geo.dispose();
    },
  };
}

/** How far the wheel is turned, given the road wheels' own visual angle as
 * a fraction of full lock. */
export function cockpitWheelTurn(lockFraction: number): number {
  return lockFraction * RIG.wheel.turn;
}

/** Where a needle stands for a reading of 0..1 of its dial, rad. Stated
 * here so the sweep the ticks were drawn on and the sweep the needle takes
 * are the same number. */
export function dialAngle(fraction: number): number {
  const t = Math.max(0, Math.min(1, fraction));
  return RIG.dials.zero - t * RIG.dials.sweep;
}

/** What the speedometer reads at full deflection, m/s. */
export const DIAL_TOP_SPEED = RIG.dials.topSpeed;
