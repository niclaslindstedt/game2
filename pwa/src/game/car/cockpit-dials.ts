// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE INSTRUMENTS — the binnacle in front of the driver and the tripmeter
// on the fascia, which between them are every reading the cockpit gives.
//
// The HUD's cluster stands down from the seat (hud.tsx), so what is on the
// dash has to be READ rather than admired: a rev counter and a speedometer
// with numbers round them, a gear figure between the two, a shift light on
// top of the pod, a row of tell-tales under the hood, and the co-driver's
// tripmeter with the stage's distance on it. Everything lit is on the
// INSTRUMENT material, which is exempt from the world's light — at night
// the cabin goes to almost nothing and these stay exactly as bright as they
// were, which is what a driver actually sees.
//
// The period is Group A: a pair of round analogue dials in a pod, a red
// shift lamp bolted on top of it, a bank of warning lamps, and a two-window
// LED tripmeter on the passenger side of the dash. The one anachronism is
// the gear figure, and it is a deliberate one — the HUD used to say which
// gear the box was in and something in the car has to take that over.

import * as THREE from "three";

import { NO_DIRT } from "../car-dirt.ts";
import { MeshBuilder, mixHex, slab, solid, type V3 } from "./builder.ts";
import { HUE, wallX, type Room } from "./cockpit-room.ts";
import {
  barsGeometry,
  buildLampPanel,
  buildReadout,
  textBars,
  type Lamp,
  type LampPanel,
  type Readout,
} from "./segment-display.ts";

/** EVERY KNOB THE INSTRUMENTS HAVE. Heights are up the raked panel from
 * the dial centres unless they say otherwise; sizes are metres. */
export const DIALS = {
  binnacle: {
    /** The pod over the dials: how far it stands over their tops, m, the
     * margin it leaves round them, and how far it reaches BACK toward the
     * driver. That last one is short on purpose — the steering wheel sits
     * between the driver and the dash, and a pod that reaches past the hub
     * is a pod drawn over the wheel it is supposed to be read through. */
    hood: 0.036,
    margin: 0.015,
    depth: 0.025,
    /** How far the instrument face leans back toward the driver, rad. */
    rake: 0.4,
  },
  /** The rev counter and the speedometer, m. Sized so the PAIR sits inside
   * the top half of the steering wheel's own opening with air round it:
   * that is where a driver's eye finds them, and a pair sized to the last
   * millimetre of the opening is a pair the rim and the hub boss are
   * permanently cutting the corners off. Two 90 mm dials in a 320 mm wheel
   * is also about what the real instrument is — anything bigger reads as a
   * pair of clocks bolted to a toy car.
   *
   * Each carries its own scale: how many graduations round the sweep, how
   * often one is long, and what the long ones are labelled. The tacho is
   * 0–10 with a mark every 500 rpm and a figure every 2000; the speedo runs
   * to 240 with a mark every 10 km/h and a figure every 60 — three figures
   * on a 40 mm face have to be far enough apart to be three figures. */
  tacho: { radius: 0.045, ticks: 20, majorEvery: 4, label: (i: number) => `${i / 2}` },
  speedo: { radius: 0.04, ticks: 24, majorEvery: 6, label: (i: number) => `${i * 10}` },
  /** Between their centres, m. Wide enough that the hub boss underneath
   * clears the bottom of both rather than biting a piece out of each. */
  gap: 0.105,
  /** The dial centres over the floor, m — just over the steering wheel's
   * own hub, which puts them BEHIND the wheel rather than over it. The
   * pair is then read through the rim's opening with its top arc passing
   * over them, which is where a driver reads a dial in any car.
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
  /** Where the tacho's red band starts, as a fraction of the sweep. */
  redline: 0.82,
  /** How fast the speedometer reads at full deflection, m/s: the last
   * figure on its scale. */
  topSpeed: 240 / 3.6,
  /** Where on the face the parts of a scale sit, as fractions of the
   * radius: the graduations at the rim, the red band just inside them, and
   * the figures inside that. A numeral's height is a fraction of the radius
   * too, so a small dial carries small figures rather than crowded ones. */
  face: { tick: 0.83, band: { inner: 0.68, outer: 0.74 }, figures: 0.5, figure: 0.24 },
  /** The gear figure between the tops of the two dials: its height, m, and
   * how far up the panel it sits over the dial centres. */
  gear: { height: 0.022, over: 0.043 },
  /** The tell-tales: how many, the pitch between them, the size of each,
   * and how far up the panel the row stands. */
  lamps: { pitch: 0.0115, size: 0.0075, over: 0.067 },
  /** The shift light on top of the pod: the housing, m, and its lens. */
  shift: { housing: [0.03, 0.017, 0.022] as V3, lens: 0.011 },
  /** The tripmeter on the fascia: its case, m, how far below the dash top
   * it hangs and how far it stands proud of the face; the height of its
   * figures, and the two windows — the stage's distance and the distance
   * since the last board, the way a rally computer is read. */
  trip: {
    case: [0.15, 0.062, 0.028] as V3,
    drop: 0.068,
    figure: 0.0105,
    total: 5,
    interval: 4,
  },
} as const;

/** What the speedometer reads at full deflection, m/s. */
export const DIAL_TOP_SPEED = DIALS.topSpeed;

/** Where a needle stands for a reading of 0..1 of its dial, rad. Stated
 * here so the sweep the ticks were drawn on and the sweep the needle takes
 * are the same number. */
export function dialAngle(fraction: number): number {
  const t = Math.max(0, Math.min(1, fraction));
  return DIALS.zero - t * DIALS.sweep;
}

/** Where the instrument faces stand, m. The binnacle is built on it and the
 * wheel is placed off it, so the two cannot come to different conclusions
 * about which one of them the driver is looking THROUGH. */
export function faceZOf(backZ: number): number {
  return backZ - 0.012;
}

/** THE LIVE PARTS, handed back to whoever drives them (car-mesh.ts). The
 * needles are mounts to rotate about their own z; the rest are lamp panels
 * and readouts to write a reading into. */
export type Instruments = {
  tacho: THREE.Object3D;
  speedo: THREE.Object3D;
  /** The gear figure: `1`..`6`, `n` on the line, `r` backing out. */
  gear: Readout;
  /** The one lamp on top of the pod. */
  shift: LampPanel;
  /** The six tell-tales, in `TELL_TALES` order. */
  tellTales: LampPanel;
  /** The tripmeter's two windows, km. */
  total: Readout;
  interval: Readout;
  /** Everything above that has to be added to the cockpit group. */
  objects: THREE.Object3D[];
  dispose: () => void;
};

/** The tell-tales, view-left to view-right, as what each one warns of. The
 * beams' lamp is the one that is ever lit on a run; the rest light for the
 * bulb check on the line and then sit dark, the way they do in a car that
 * is not about to break. */
export const TELL_TALES = ["beam", "turnL", "oil", "charge", "brake", "turnR"] as const;
export type TellTale = (typeof TELL_TALES)[number];
const TELL_TALE_HUE: Record<TellTale, number> = {
  beam: HUE.beam,
  turnL: HUE.turn,
  oil: HUE.amber,
  charge: HUE.warn,
  brake: HUE.warn,
  turnR: HUE.turn,
};

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
 * the eye. The needle mounts carry the same pair, in the same order. */
function onFace(geo: THREE.BufferGeometry, at: V3, rake: number): THREE.BufferGeometry {
  return geo.rotateY(Math.PI).rotateX(rake).translate(at[0], at[1], at[2]);
}

/** A point `up` metres up the raked instrument panel from `at`, so a thing
 * placed over the dials leans back with the face they are on. */
function upPanel(at: V3, up: number, rake: number): V3 {
  return [at[0], at[1] + up * Math.cos(rake), at[2] + up * Math.sin(rake)];
}

type Scale = { radius: number; ticks: number; majorEvery: number; label: (i: number) => string };

/** One dial, baked into the instrument mesh, with its needle handed back
 * on a mount of its own. Everything is built in the dial's plane and swung
 * onto the binnacle's rake, so a needle only ever has to rotate about its
 * own z. */
function buildDial(
  b: MeshBuilder,
  material: THREE.Material,
  at: V3,
  scale: Scale,
  redline: boolean,
  geos: THREE.BufferGeometry[],
): { mount: THREE.Object3D; needle: THREE.Object3D } {
  const rake = DIALS.binnacle.rake;
  const radius = scale.radius;
  const onDial = (geo: THREE.BufferGeometry): THREE.BufferGeometry => onFace(geo, at, rake);
  const face = DIALS.face;

  solid(b, onDial(new THREE.CircleGeometry(radius, 28)), HUE.face);
  solid(b, onDial(new THREE.TorusGeometry(radius, radius * 0.06, 4, 28)), HUE.bezel);
  // Ticks around the sweep: a needle with nothing to read against is a
  // moving stick.
  //
  // MINORS BETWEEN THE MAJORS, and they are what stop the instrument reading
  // as a toy. A dial is close enough here to see individual marks, and a
  // half-dozen chunky ones round a black disc is a cartoon of a dial; the
  // real thing is a fine graduation with every fourth mark longer, and the
  // eye reads the DENSITY before it reads any single mark.
  for (let i = 0; i <= scale.ticks; i++) {
    const t = i / scale.ticks;
    const a = DIALS.zero - t * DIALS.sweep;
    const major = i % scale.majorEvery === 0;
    const geo = new THREE.BoxGeometry(
      radius * (major ? 0.2 : 0.1),
      radius * (major ? 0.05 : 0.028),
      0.005,
    )
      .translate(radius * (face.tick + (major ? 0 : 0.05)), 0, 0)
      .rotateZ(a);
    solid(b, onDial(geo), redline && t >= DIALS.redline ? HUE.red : HUE.tick);
    // THE FIGURES, inside the graduations they belong to, stood on the
    // radius at the major's own angle — upright rather than turned with the
    // mark, which is how a road car's dial is printed and the only way a
    // `6` and a `9` can be told apart. Built the right way round: the
    // half-turn in `onFace` lands the dial's +x on the driver's RIGHT, so a
    // figure that reads in the plane reads in the car.
    if (major) {
      const r = radius * face.figures;
      const figure = barsGeometry(textBars(scale.label(i), radius * face.figure), 0.004);
      solid(b, onDial(figure.translate(r * Math.cos(a), r * Math.sin(a), 0)), HUE.tick);
    }
  }
  if (redline) {
    // A red ARC over the limiter's share of the sweep, between the marks
    // and the figures, rather than a scatter of blocks: what says redline
    // on a real dial is one unbroken band.
    const from = DIALS.zero - DIALS.sweep;
    const length = (1 - DIALS.redline) * DIALS.sweep;
    const band = new THREE.RingGeometry(
      radius * face.band.inner,
      radius * face.band.outer,
      12,
      1,
      from,
      length,
    );
    solid(b, onDial(band.translate(0, 0, 0.003)), HUE.red);
  }

  const nb = new MeshBuilder();
  // Thick for its length: the needle is read at a dial 600 mm away through
  // the rim of a steering wheel, and a scale-correct one is a couple of
  // pixels wide there — which is a dial with nothing in it.
  slab(nb, [radius * 0.95, radius * 0.1, 0.005], [radius * 0.33, 0, 0.013], HUE.needle);
  // The tail, over the hub: what makes a needle read as balanced on a
  // pivot rather than stuck to the face.
  slab(nb, [radius * 0.22, radius * 0.1, 0.005], [-radius * 0.1, 0, 0.013], HUE.needle);
  solid(
    nb,
    new THREE.CylinderGeometry(radius * 0.13, radius * 0.13, 0.02, 10).rotateX(Math.PI / 2),
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

/** The instrument pod and everything in and on it. It stands proud of the
 * dash top, which is where a period rally car's binnacle is and — more to
 * the point — is what puts the tops of the dials above the rim of the wheel
 * in front of them. Everything below that line is read through the wheel,
 * the way it is in any car.
 *
 * `b` is the cabin's own builder and takes the pod; `ib` is the instrument
 * builder and takes every face that is lit from behind. */
export function buildBinnacle(
  b: MeshBuilder,
  ib: MeshBuilder,
  material: THREE.Material,
  room: Room,
  backZ: number,
  geos: THREE.BufferGeometry[],
): Instruments {
  const { floorY, driverX } = room;
  const rake = DIALS.binnacle.rake;
  const dialY = floorY + DIALS.over;
  const half = DIALS.gap / 2 + DIALS.tacho.radius + DIALS.binnacle.margin;
  const tall = DIALS.tacho.radius + DIALS.binnacle.margin;
  const faceZ = faceZOf(backZ);
  // The pod: a hood over the top and a cheek either side, open toward the
  // driver so nothing of it is drawn between the dials and the eye reading
  // them.
  const hoodY = dialY + tall + DIALS.binnacle.hood;
  b.quad(
    [driverX - half, hoodY, backZ],
    [driverX + half, hoodY, backZ],
    [driverX + half, hoodY - 0.03, faceZ - DIALS.binnacle.depth],
    [driverX - half, hoodY - 0.03, faceZ - DIALS.binnacle.depth],
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
      faceZ - DIALS.binnacle.depth,
      backZ,
      side > 0 ? HUE.pad : HUE.fascia,
      side,
    );
  }
  const panel = new THREE.BoxGeometry(half * 2, (tall + DIALS.binnacle.hood) * 2, 0.012)
    .rotateX(rake)
    .translate(driverX, dialY, faceZ);
  solid(b, panel, mixHex(HUE.face, HUE.fascia, 0.4));

  // Both dials go into the INSTRUMENT builder, not the cabin's: every face
  // of them — the black disc, the bezel, the graduations, the red band and
  // the needle — is lit from behind and must stay lit when the cabin around
  // it goes dark.
  const centre: V3 = [driverX, dialY, faceZ - 0.008];
  const tacho = buildDial(
    ib,
    material,
    [driverX + DIALS.gap / 2, dialY, faceZ - 0.008],
    DIALS.tacho,
    true,
    geos,
  );
  const speedo = buildDial(
    ib,
    material,
    [driverX - DIALS.gap / 2, dialY, faceZ - 0.008],
    DIALS.speedo,
    false,
    geos,
  );

  // THE GEAR FIGURE, between the tops of the two dials, in its own black
  // window so it reads as a display set into the panel and not as a number
  // floating over it.
  const g = DIALS.gear;
  const gearAt = upPanel(centre, g.over, rake);
  const window = new THREE.BoxGeometry(g.height * 0.9, g.height * 1.3, 0.004);
  solid(ib, onFace(window, gearAt, rake), HUE.window);
  const led = { lit: HUE.led, dark: HUE.ledOff };
  // The figure stands PROUD of its window, or the window's own front face
  // is drawn over it and the display is a black slot for the whole run.
  const proud = 0.004;
  const gear = buildReadout(
    1,
    g.height,
    led,
    (geo) => onFace(geo.translate(0, 0, proud), gearAt, rake),
    material,
  );

  // THE TELL-TALES, in a row under the hood: six square lamps, each in its
  // own colour, the way a bank of warning lights is — nobody reads the
  // symbols on them at this size, so there are none, and the colour and the
  // place in the row is the whole of what each one says.
  const l = DIALS.lamps;
  const lampAt = upPanel(centre, l.over, rake);
  const lamps: Lamp[] = TELL_TALES.map((name, i) => {
    // Laid out left to right in the panel's plane, which the half-turn in
    // `onFace` carries to the driver's left to right.
    const x = (i - (TELL_TALES.length - 1) / 2) * l.pitch;
    const hue = TELL_TALE_HUE[name];
    return {
      x0: x - l.size / 2,
      y0: -l.size / 2,
      x1: x + l.size / 2,
      y1: l.size / 2,
      lit: hue,
      dark: mixHex(hue, HUE.window, 0.82),
    };
  });
  const tray = new THREE.BoxGeometry(TELL_TALES.length * l.pitch + 0.006, l.size + 0.006, 0.004);
  solid(ib, onFace(tray, lampAt, rake), HUE.window);
  const tellTales = buildLampPanel(
    lamps,
    (geo) => onFace(geo.translate(0, 0, proud), lampAt, rake),
    material,
  );

  // THE SHIFT LIGHT, on top of the pod: a small housing standing on the
  // hood at its rear edge, with a red lens facing the driver. Vertical
  // rather than raked — it is bolted on, not part of the panel.
  const s = DIALS.shift;
  const shiftAt: V3 = [driverX, hoodY + s.housing[1] / 2, backZ - s.housing[2] / 2 - 0.004];
  slab(b, s.housing, shiftAt, HUE.boot);
  const lensAt: V3 = [shiftAt[0], shiftAt[1], shiftAt[2] - s.housing[2] / 2 - 0.001];
  const lens: Lamp = {
    x0: -s.lens / 2,
    y0: -s.lens / 2,
    x1: s.lens / 2,
    y1: s.lens / 2,
    lit: HUE.led,
    dark: HUE.ledOff,
  };
  const shift = buildLampPanel([lens], (geo) => onFace(geo, lensAt, 0), material);

  const objects = [tacho.mount, speedo.mount, gear.mesh, tellTales.mesh, shift.mesh];
  for (const obj of objects) obj.userData[NO_DIRT] = true;
  const trip = buildTripmeter(b, ib, material, room, backZ, objects);
  return {
    tacho: tacho.needle,
    speedo: speedo.needle,
    gear,
    shift,
    tellTales,
    total: trip.total,
    interval: trip.interval,
    objects,
    dispose: () => {
      gear.dispose();
      shift.dispose();
      tellTales.dispose();
      trip.dispose();
    },
  };
}

/** THE TRIPMETER, on the fascia at the centre of the car where the
 * co-driver can reach it: a black case with two LED windows, the stage's
 * distance in the top one and the distance since the last split board in
 * the bottom — the rally computer every period car carried, and the reason
 * the HUD's trip counter can stand down from the seat. Its face is vertical
 * and turned a little toward the passenger, which is who it is for. */
function buildTripmeter(
  b: MeshBuilder,
  ib: MeshBuilder,
  material: THREE.Material,
  room: Room,
  backZ: number,
  objects: THREE.Object3D[],
): { total: Readout; interval: Readout; dispose: () => void } {
  const { cabin, driverX } = room;
  const t = DIALS.trip;
  const topY = cabin.sillY - 0.03;
  const y = topY - t.drop;
  // Off centre toward the passenger, and yawed to face them: a box on the
  // dash that squarely faces nobody is a box, one turned to its reader is
  // an instrument.
  const x = -driverX * 0.35;
  const yaw = Math.sign(driverX) * 0.22;
  const at: V3 = [x, y, backZ - t.case[2] / 2];
  const geo = new THREE.BoxGeometry(t.case[0], t.case[1], t.case[2]).rotateY(yaw);
  solid(b, geo.translate(at[0], at[1], at[2]), HUE.case);
  // The face the windows sit on, in the case's own yawed frame: a point
  // `d` metres toward the reader along the case's normal, and `dx`, `dy`
  // across it.
  const faceOf = (dx: number, dy: number, d: number): V3 => {
    const z = -t.case[2] / 2 - d;
    return [
      at[0] + dx * Math.cos(yaw) + z * Math.sin(yaw),
      at[1] + dy,
      at[2] - dx * Math.sin(yaw) + z * Math.cos(yaw),
    ];
  };
  const place =
    (dx: number, dy: number, d: number) =>
    (g: THREE.BufferGeometry): THREE.BufferGeometry => {
      const p = faceOf(dx, dy, d);
      return g.rotateY(Math.PI + yaw).translate(p[0], p[1], p[2]);
    };
  const led = { lit: HUE.led, dark: HUE.ledOff };
  const rows: { digits: number; dy: number }[] = [
    { digits: t.total, dy: 0.014 },
    { digits: t.interval, dy: -0.015 },
  ];
  const readouts: Readout[] = [];
  for (const row of rows) {
    const wide = row.digits * t.figure * 0.82 + 0.012;
    const window = new THREE.BoxGeometry(wide, t.figure * 1.5, 0.003);
    solid(ib, place(0.012, row.dy, 0.0005)(window), HUE.window);
    readouts.push(buildReadout(row.digits, t.figure, led, place(0.012, row.dy, 0.003), material));
  }
  // The reset button and the mode switch beside the windows: a red button
  // over a grey one, both the size of a fingertip.
  const buttons = new MeshBuilder();
  slab(buttons, [0.011, 0.011, 0.006], [0, 0, 0], HUE.warn);
  slab(buttons, [0.011, 0.011, 0.006], [0, -0.016, 0], HUE.metal);
  const buttonGeo = buttons.geometry();
  const p = faceOf(-0.058, 0.008, 0.003);
  const buttonMesh = new THREE.Mesh(buttonGeo.rotateY(yaw).translate(p[0], p[1], p[2]), material);
  buttonMesh.userData[NO_DIRT] = true;
  const [total, interval] = readouts as [Readout, Readout];
  objects.push(total.mesh, interval.mesh, buttonMesh);
  for (const r of readouts) r.mesh.userData[NO_DIRT] = true;
  return {
    total,
    interval,
    dispose: () => {
      total.dispose();
      interval.dispose();
      buttonGeo.dispose();
    },
  };
}
