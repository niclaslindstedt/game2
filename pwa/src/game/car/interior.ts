// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE CABIN, FROM THE INSIDE. Until the glass went translucent there was
// nothing behind it: a window was a painted panel, and the car was a solid
// lump with blue rectangles on it. A window you can see THROUGH needs
// something to see, and this file is it — the trim that lines the shell, the
// dash, the seats, the crew sat in them, the wheel one of them is holding
// and the cage around all of it.
//
// Two jobs, and the first one is not decoration:
//
//   THE LINING closes the car. Every cabin panel the greenhouse draws is a
//   single-sided patch facing OUT, so from inside the car those panels are
//   back faces and are culled — look through the near window and the far
//   flank is a hole with sky in it. The lining is the same patches drawn
//   again, inset a centimetre and wound the other way, with the same window
//   openings punched out of them. That also means the pillars have THICKNESS
//   when seen from inside, which is most of why a lined cabin reads as a
//   room rather than as a decal.
//
//   THE FURNITURE is what the window is for. Read at chase-cam range through
//   tinted glass, almost none of the detail survives — what survives is
//   SILHOUETTE and CONTRAST: two headrests, two helmets, a pale roll cage
//   against a dark interior, the ring of a steering wheel. Everything here is
//   authored for that read first and for a close look second.
//
// Detail is a level, because this is per-car cost on a road that can carry
// fifteen cars: `low` is the read (lining, dash, seats, crew), `high` adds
// the cage, the harnesses, the console and a wheel that actually turns with
// the front tyres. `off` builds nothing and the glass goes solid again.
//
// Everything lands in ONE builder and therefore one mesh — except the
// steering wheel at `high`, which needs a transform of its own. Positions
// are car-local metres, +z the nose, y from the ground.

import * as THREE from "three";

import { NO_DIRT } from "../car-dirt.ts";
import { MeshBuilder, bakeShading, patchQuad, type V3 } from "./builder.ts";
import { cabinFrame, cabinPanels, panelMinus } from "./greenhouse.ts";
import type { CarBodySpec } from "./spec.ts";

export type InteriorDetail = "off" | "low" | "high";

export type CarInterior = {
  /** The whole cabin. Null when the detail level is `off`. */
  group: THREE.Group | null;
  /** The steering wheel's own pivot, at `high` only — car-mesh.ts turns it
   * with the front wheels. Null when the wheel is baked in with everything
   * else, which is what keeps a fifteen-car field to one draw call a cabin. */
  steering: THREE.Object3D | null;
  dispose: () => void;
};

/** How far inside the cabin skin the trim sits, m. Enough to beat depth
 * fighting against the panel it lines and to read as the thickness of a
 * pillar, small enough that it never shows outside the glass opening. */
const LINING_LIFT = 0.012;

/** The trim palette. Authored much lighter than a photograph of a rally
 * cabin, and deliberately: everything here is seen through a tinted pane
 * that is doing its own blending, and the fullbright shading takes another
 * third off anything facing away from the sun. Trim picked by eye off a real
 * interior comes out of that chain as a black rectangle — the window looks
 * painted again, which is the whole thing this was built to fix. What has to
 * survive is the LADDER: a mid grey shell, seats a step up from it, and the
 * cage and the crew's helmets bright enough to read at a car's length. */
const TRIM = {
  lining: 0x565d68,
  floor: 0x3b414a,
  dash: 0x343a43,
  binnacle: 0x1c2026,
  seat: 0x525a67,
  seatFace: 0x69737f,
  harness: 0xc4353a,
  cage: 0xe4e8ee,
  wheel: 0x25292f,
  suit: 0x525c6b,
  visor: 0x1b2027,
};

/** The driver's helmet. Held light and neutral rather than taken from the
 * livery: it is the single highest-contrast thing in the cabin and the one
 * that has to read on every car in the field, including the white ones. The
 * co-driver takes the car's accent, so the pair still says whose car it is. */
const HELMET = 0xe9ebef;

/** Seat, crew and wheel, as fractions of the cabin's own length back from
 * the cowl — the one set of proportions that has to survive being applied to
 * a 2.1 m coupe cabin and a 2.4 m hatch one. `hip` is the seat's hinge, and
 * everything else is placed off it in metres, because a seat, a helmet and a
 * steering wheel are the same size in every car ever built. */
const LAYOUT = { hip: 0.42, dashBack: 0.6, wheelAhead: 0.4, hoopBehind: 0.42, bulkhead: 0.58 };

/** Where the middle of the steering wheel sits relative to the window sill,
 * m. Just under it, so the top of the rim breaks the sill line and shows
 * through the screen: a wheel entirely below the scuttle is a wheel nobody
 * will ever see turn, and the turning is the only reason it is a mesh of its
 * own. */
const WHEEL_RISE = -0.02;

/** How far off the centreline the two seats sit, as a fraction of the
 * cabin's inner half-width. */
const SEAT_SIDE = 0.46;

/** The default sill width the greenhouse uses when a spec does not state
 * one — restated here rather than imported, because it is a PILLAR default
 * and the pillars are the greenhouse's own vocabulary. */
const PILLAR_SILL = 0.055;

/** Turns of the wheel at full lock, rad. A rally car is nearer three turns
 * lock to lock than one, but the wheel is being read through tinted glass at
 * a car's length: past about a quarter turn the rim's own spokes stop saying
 * which way it went, and what the player is owed is the DIRECTION. */
const WHEEL_TURN = 1.5;
/** How far the wheel's top leans back toward the driver, rad. */
const WHEEL_RAKE = 0.35;
const WHEEL_RADIUS = 0.17;
/** A helmet, m. Generous by a centimetre or two: it is the one shape in here
 * that has to be legible through tinted glass at a car's length. */
const HELMET_RADIUS = 0.145;

/** Everything the layout is derived from, resolved once.
 *
 * The one number every other one hangs off is `sillY`, the bottom edge of
 * the side glass. A cabin at honest human proportions does not fit in a
 * 1.4 m car built out of a lofted profile: stack a seat and a driver up from
 * the floor and the helmets come out under the door skin, where no window
 * can show them. And the body's own top DECK runs the length of the car at
 * about the belt line, so everything below it is inside a closed shell and
 * cannot be seen at all. What is left is a tray about 350 mm deep between
 * that deck and the roof, exactly as tall as the glass — which is not a
 * compromise but the actual shape of what a window shows. Everything here is
 * built for that tray. */
type Cabin = {
  spec: CarBodySpec;
  /** Inner half-width the furniture is fitted inside, m. */
  inner: number;
  /** The dark pan laid over the body's own deck, m. Without it the cabin
   * floor is the top of the lofted shell — in body paint, sunlit, and the
   * brightest thing in the car. */
  panY: number;
  /** The window sill and the headliner: the bottom and top of everything
   * that can be seen, m. */
  sillY: number;
  roofY: number;
  /** The belt line at the cowl, m — where the dash is hung from. */
  cowlY: number;
  /** Along the car: the cowl, the seat hinge, and the tail, m. */
  cowlZ: number;
  hipZ: number;
  rearZ: number;
};

function cabinOf(spec: CarBodySpec): Cabin {
  const f = cabinFrame(spec);
  const { cowlZ, baseRearZ, roofY, roofHalf } = spec.cabin;
  const length = cowlZ - baseRearZ;
  const cowlY = f.CL[1];
  // The highest the body's own deck gets anywhere under the cabin: the pan
  // has to clear all of it, or the paint shows through in the middle.
  let deck = 0;
  for (const station of spec.profile) {
    if (station.z <= cowlZ && station.z >= baseRearZ) deck = Math.max(deck, station.topY);
  }
  deck = Math.max(deck, cowlY, f.TL[1]);
  return {
    spec,
    inner: Math.min(f.CR[0], f.TR[0], roofHalf) - 0.055,
    panY: deck + 0.012,
    sillY: cowlY + (spec.cabin.pillars?.sill ?? PILLAR_SILL),
    roofY: roofY - 0.035,
    cowlY,
    cowlZ,
    hipZ: cowlZ - LAYOUT.hip * length,
    rearZ: baseRearZ,
  };
}

/** A three.js primitive, shaded the way the hand-wound faces around it are
 * and poured into the same buffer. Anything round or tilted comes through
 * here — hand-winding either fails silently, faces culled rather than
 * flagged. The geometry is spent. */
function solid(b: MeshBuilder, geo: THREE.BufferGeometry, color: number): void {
  b.absorb(bakeShading(geo, color));
}

/** A box that is allowed to lean: a seat back, a visor, a harness strap. */
function slab(b: MeshBuilder, size: V3, at: V3, color: number, tilt = 0, yaw = 0): void {
  const geo = new THREE.BoxGeometry(size[0], size[1], size[2]);
  if (tilt !== 0) geo.rotateX(tilt);
  if (yaw !== 0) geo.rotateY(yaw);
  solid(b, geo.translate(at[0], at[1], at[2]), color);
}

/** One length of cage tube, end to end. */
function tube(b: MeshBuilder, from: V3, to: V3, radius: number, color: number, sides = 7): void {
  const a = new THREE.Vector3(...from);
  const span = new THREE.Vector3(...to).sub(a);
  const len = span.length();
  if (len < 1e-4) return;
  const geo = new THREE.CylinderGeometry(radius, radius, len, sides, 1, true);
  // CylinderGeometry stands on +y about its own middle; swing that axis onto
  // the span, then carry it to the span's midpoint.
  const turn = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    span.clone().divideScalar(len),
  );
  geo.applyQuaternion(turn);
  geo.translate(a.x + span.x / 2, a.y + span.y / 2, a.z + span.z / 2);
  solid(b, geo, color);
}

/** A horizontal panel — the pan, or the headliner. `up` says which way it is
 * seen from: a floor is looked down on, a headliner up at. */
function deck(
  b: MeshBuilder,
  half: number,
  y: number,
  zFront: number,
  zRear: number,
  color: number,
  up: boolean,
): void {
  const c: V3[] = [
    [-half, y, zFront],
    [half, y, zFront],
    [half, y, zRear],
    [-half, y, zRear],
  ];
  if (up) b.quad(c[0], c[1], c[2], c[3], color);
  else b.quad(c[3], c[2], c[1], c[0], color);
}

/** The shell, lined: every cabin panel drawn again from the inside, with the
 * same windows cut out of it. Without this the far flank of the cabin is a
 * set of back faces, and back faces are culled — look through the near
 * window and there is sky where the far door should be.
 *
 * `patchQuad`'s `mirrored` flag reverses both the winding and the lift, so
 * passing its opposite is exactly "the same rectangle, facing the other way,
 * on the other side of the panel" — the whole of what an inner face is. */
function buildLining(b: MeshBuilder, cabin: Cabin): void {
  for (const panel of cabinPanels(cabin.spec)) {
    for (const strip of panelMinus(panel.holes)) {
      patchQuad(b, panel.patch, strip, TRIM.lining, LINING_LIFT, !panel.mirrored);
    }
  }
  deck(b, cabin.inner, cabin.panY, cabin.cowlZ, cabin.rearZ, TRIM.floor, true);
  deck(
    b,
    cabin.spec.cabin.roofHalf - 0.03,
    cabin.roofY,
    cabin.spec.cabin.roofFrontZ,
    cabin.spec.cabin.roofRearZ,
    TRIM.lining,
    false,
  );
  // The bulkhead behind the seats. Its job is not decoration: without it a
  // look through the backlight goes over the seats, out through the
  // windscreen and into the landscape, and a cabin you can see daylight
  // through reads as a hole in the car rather than as a room in it. A box,
  // not a plane, because it is seen from the boot side as well.
  const bulkheadZ = cabin.hipZ - LAYOUT.bulkhead;
  // Its top stops just over the sill line rather than well above it. Higher
  // and it hides the one part of the cabin the player spends a whole stage
  // looking at: from a chase camera every ray through the backlight is
  // descending, so whatever stands furthest back and highest is all there is
  // to see, and a full-height bulkhead is a painted panel again.
  const top = cabin.sillY + 0.08;
  b.box(
    0,
    (top + cabin.panY) / 2,
    bulkheadZ,
    cabin.inner * 1.94,
    top - cabin.panY,
    0.05,
    TRIM.seat,
  );
}

/** The dash: a slab under the screen whose TOP is the whole of what shows,
 * and a hood over the instruments in front of the driver. At `high` the
 * console runs back between the seats. */
function buildDash(b: MeshBuilder, cabin: Cabin, driverX: number, high: boolean): void {
  const back = cabin.hipZ + LAYOUT.dashBack;
  const top = cabin.sillY + 0.07;
  const depth = cabin.cowlZ - back;
  b.box(
    0,
    (top + cabin.panY) / 2,
    (cabin.cowlZ + back) / 2,
    cabin.inner * 1.98,
    top - cabin.panY,
    depth,
    TRIM.dash,
  );
  // The binnacle: a dark hood over the dials, and the one thing in the cabin
  // that says which side the car is driven from.
  b.box(driverX, top + 0.03, back + 0.07, 0.42, 0.09, 0.2, TRIM.binnacle);
  if (!high) return;
  b.box(0, cabin.panY + 0.05, cabin.hipZ + 0.1, 0.11, 0.1, 0.66, TRIM.dash);
}

/** One seat: a back that leans out of the pan, a headrest over it, and at
 * `high` the bolsters that make it a bucket and the harness over them. */
function buildSeat(b: MeshBuilder, cabin: Cabin, x: number, high: boolean): void {
  const z = cabin.hipZ;
  const top = cabin.sillY + 0.19;
  const mid = (top + cabin.panY) / 2;
  const height = top - cabin.panY;
  const lean = 0.22;
  slab(b, [0.44, height, 0.13], [x, mid, z - 0.24], TRIM.seat, lean);
  // Deliberately shorter than the helmet in front of it: from behind, a
  // headrest that clears the helmet hides the single most legible thing in
  // the car, and a pale dome breaking a dark headrest line is what says
  // there is somebody in there.
  slab(b, [0.24, 0.14, 0.12], [x, cabin.sillY + 0.17, z - 0.31], TRIM.seat, lean);
  if (!high) return;
  for (const side of [-1, 1]) {
    slab(b, [0.08, height * 0.9, 0.2], [x + side * 0.19, mid, z - 0.19], TRIM.seatFace, lean);
  }
  // Two harness straps over the shoulders — a diagonal pair of red bands is
  // the most rally thing a cabin can carry, and it survives the glass.
  for (const side of [-1, 1]) {
    slab(
      b,
      [0.07, height * 0.85, 0.02],
      [x + side * 0.1, mid + 0.02, z - 0.09],
      TRIM.harness,
      lean,
      side * 0.16,
    );
  }
}

/** A crew member: shoulders out of the pan, a helmet, and a visor band
 * across it. The helmet is the read — a pale sphere in a dark cabin, at
 * exactly the height a head sits, from any angle the car is ever seen at. */
function buildCrew(b: MeshBuilder, cabin: Cabin, x: number, color: number, high: boolean): void {
  const z = cabin.hipZ - 0.06;
  const top = cabin.sillY + 0.03;
  slab(b, [0.38, top - cabin.panY, 0.26], [x, (top + cabin.panY) / 2, z + 0.02], TRIM.suit, 0.1);
  const y = cabin.sillY + 0.14;
  solid(
    b,
    new THREE.SphereGeometry(HELMET_RADIUS, high ? 8 : 6, high ? 5 : 3).translate(x, y, z + 0.02),
    color,
  );
  slab(b, [0.2, 0.09, 0.03], [x, y, z + HELMET_RADIUS + 0.02], TRIM.visor, -0.1);
}

/** The driver's hands on the wheel — two forearms from the shoulders to the
 * rim, which is what stops the crew reading as two dummies sat upright. */
function buildArms(b: MeshBuilder, cabin: Cabin, driverX: number, wheelZ: number, y: number): void {
  for (const side of [-1, 1]) {
    tube(
      b,
      [driverX + side * 0.17, cabin.sillY - 0.04, cabin.hipZ - 0.02],
      [driverX + side * 0.13, y, wheelZ - 0.04],
      0.045,
      TRIM.suit,
      5,
    );
  }
}

/** The wheel itself, about its own centre and in its own plane, so a mount
 * can rake it and a transform can turn it. */
function wheelGeometry(b: MeshBuilder, high: boolean): void {
  solid(b, new THREE.TorusGeometry(WHEEL_RADIUS, 0.019, high ? 5 : 4, high ? 14 : 8), TRIM.wheel);
  solid(b, new THREE.CylinderGeometry(0.045, 0.045, 0.03, 7).rotateX(Math.PI / 2), TRIM.wheel);
  const spokes = high ? 3 : 0;
  for (let i = 0; i < spokes; i++) {
    // Three spokes off the hub, the bottom pair wide and one straight up —
    // the period rally wheel, and the only reason a turn is legible at all.
    const a = Math.PI / 2 + (i * Math.PI * 2) / 3;
    const geo = new THREE.BoxGeometry(WHEEL_RADIUS, 0.022, 0.012)
      .translate(WHEEL_RADIUS / 2, 0, 0)
      .rotateZ(a);
    solid(b, geo, TRIM.seatFace);
  }
}

/** The cage: a main hoop behind the seats, bars up the windscreen pillars,
 * and a rail joining them along each roof edge. Pale against a dark cabin,
 * which is the whole point — at any distance the car is actually read at,
 * the cage is the interior. The DOOR bars a real car carries are left out
 * for exactly that reason: they run below the sill, where nothing outside
 * the car can see them. */
function buildCage(b: MeshBuilder, cabin: Cabin): void {
  const { spec } = cabin;
  const f = cabinFrame(spec);
  const r = 0.026;
  const hoopZ = cabin.hipZ - LAYOUT.hoopBehind;
  const x = cabin.inner - 0.01;
  const top = cabin.roofY - 0.02;
  const foot = cabin.panY;

  const hoopL: V3 = [-x, top, hoopZ];
  const hoopR: V3 = [x, top, hoopZ];
  tube(b, [-x, foot, hoopZ], hoopL, r, TRIM.cage);
  tube(b, [x, foot, hoopZ], hoopR, r, TRIM.cage);
  tube(b, hoopL, hoopR, r, TRIM.cage);
  // A diagonal across the hoop — the brace every rally car carries.
  tube(b, [-x, foot, hoopZ], [x, top - 0.06, hoopZ], r * 0.8, TRIM.cage);
  // The harness bar, across at shoulder height. Every rally car has one, and
  // it is placed here for exactly the height it sits at: a descending ray
  // through the backlight crosses that line between the bulkhead below it
  // and the roof above, so it is the one pale thing in the cabin the chase
  // camera can see for a whole stage.
  tube(b, [-x, cabin.sillY + 0.14, hoopZ], [x, cabin.sillY + 0.14, hoopZ], r * 0.85, TRIM.cage);

  for (const side of [-1, 1]) {
    const roofFront: V3 = [side * (spec.cabin.roofHalf - 0.06), top, spec.cabin.roofFrontZ + 0.04];
    const cowl: V3 = [side * (f.CR[0] - 0.07), cabin.sillY - 0.05, cabin.cowlZ - 0.04];
    tube(b, cowl, roofFront, r, TRIM.cage);
    tube(b, roofFront, [side * x, top, hoopZ], r, TRIM.cage);
  }
}

export function buildInterior(
  spec: CarBodySpec,
  detail: InteriorDetail,
  material: THREE.Material,
): CarInterior {
  if (detail === "off") return { group: null, steering: null, dispose: () => undefined };
  const high = detail === "high";
  const cabin = cabinOf(spec);
  const driverX = -cabin.inner * SEAT_SIDE;
  const coDriverX = cabin.inner * SEAT_SIDE;
  const wheelZ = cabin.hipZ + LAYOUT.wheelAhead;
  const wheelY = cabin.sillY + WHEEL_RISE;
  const b = new MeshBuilder();

  buildLining(b, cabin);
  buildDash(b, cabin, driverX, high);
  buildSeat(b, cabin, driverX, high);
  buildSeat(b, cabin, coDriverX, high);
  buildCrew(b, cabin, driverX, HELMET, high);
  buildCrew(b, cabin, coDriverX, spec.colors.accent, high);
  if (high) {
    buildArms(b, cabin, driverX, wheelZ, wheelY);
    buildCage(b, cabin);
  }
  // The column, whatever the wheel on the end of it is doing.
  tube(b, [driverX, wheelY, wheelZ], [driverX, wheelY + 0.1, wheelZ + 0.26], 0.028, TRIM.dash, 5);

  const group = new THREE.Group();
  const geos: THREE.BufferGeometry[] = [];

  // At `high` the wheel turns, which needs a transform and therefore a mesh
  // of its own; below that it is baked in where it stands. The mount holds
  // the rake and the wheel holds nothing but its turn — an Euler's z is not
  // a turn about the local z of a basis already inside the same Euler.
  let steering: THREE.Object3D | null = null;
  if (high) {
    const wb = new MeshBuilder();
    wheelGeometry(wb, true);
    const geo = wb.geometry();
    geos.push(geo);
    const mount = new THREE.Group();
    mount.position.set(driverX, wheelY, wheelZ);
    mount.rotation.x = -WHEEL_RAKE;
    const wheel = new THREE.Mesh(geo, material);
    wheel.userData[NO_DIRT] = true;
    steering = wheel;
    mount.add(wheel);
    group.add(mount);
  } else {
    const wb = new MeshBuilder();
    wheelGeometry(wb, false);
    const geo = wb.geometry();
    geo.rotateX(-WHEEL_RAKE);
    geo.translate(driverX, wheelY, wheelZ);
    b.absorb(geo);
  }

  const cabinGeo = b.geometry();
  geos.push(cabinGeo);
  const mesh = new THREE.Mesh(cabinGeo, material);
  mesh.userData[NO_DIRT] = true;
  group.add(mesh);

  return {
    group,
    steering,
    dispose: () => {
      for (const geo of geos) geo.dispose();
    },
  };
}

/** How much the wheel is turned, given the road wheels' own visual angle as
 * a fraction of full lock. Stated here so the wheel and the rack agree about
 * which way is right. */
export function steeringTurn(lockFraction: number): number {
  return lockFraction * WHEEL_TURN;
}
