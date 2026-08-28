// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE WIPERS — and the grime that gives them something to do. Two halves of
// one effect, which is why they are one module:
//
//   THE FILM. Each screen carries a pane of its own, laid a hair proud of
//   the glass and tessellated into a grid whose VERTICES carry the coat:
//   the pale smear water leaves, road-brown once a gravel stage has been
//   throwing filth at it. The coat is the vertex's ALPHA, so a clean vertex
//   is not there at all — which is what lets the glass under it be seen
//   through. Colours and alpha both interpolate across a cell, so a wiped
//   edge is a gradient rather than a staircase.
//
//   THE BLADES. A tandem pair on the windscreen and a single arm on the
//   backlight, each a rigid body pivoting in the plane of its own screen.
//   What makes them read as wipers rather than as metronomes is that they
//   only clear THE ARC THEY PASS THROUGH: every vertex of the pane knows
//   its polar position about each pivot, so a stroke clears exactly the
//   band the blade swept and leaves the corners it never reaches dirty. The
//   swept arc then greys over again while the blade is away — which is the
//   whole picture of driving in weather, and the reason the wipe has to be
//   a sweep instead of a fade on the whole pane.
//
// The blades run on demand, not on a switch: they start when there is
// something on the glass, take a stroke per squall, and always finish the
// stroke they are on so they park where they started.
//
// The blades are hardware and ride the body's own fullbright material; the
// film has a material of its own because it is the one part of the car that
// has to be able to disappear. Both take the time of day with everything
// else, as a multiply into the material colour.

import * as THREE from "three";

import { NO_DIRT } from "../car-dirt.ts";
import { MeshBuilder, patchAt, patchNormal, shadeFactor, type V3 } from "./builder.ts";
import { GLASS_LIFT, screenPanes, type ScreenPane } from "./greenhouse.ts";
import type { CarBodySpec } from "./spec.ts";

/** How far proud of the panel the film and the blades sit, m. Both clear
 * the glass (`GLASS_LIFT`), and the blades clear the film. */
const FILM_LIFT = GLASS_LIFT + 0.003;
const BLADE_LIFT = GLASS_LIFT + 0.014;

/** The grid each screen is tessellated into. Coarse enough to be free,
 * fine enough that a swept arc has a shape. */
const GRID = { front: { cols: 9, rows: 6 }, rear: { cols: 7, rows: 5 } };

/** What is on the glass: the smear water leaves, and the brown a gravel
 * stage cakes it with. */
const FILM_TONE = new THREE.Color(0x9fabb4);
const MUD_TONE = new THREE.Color(0x6d5a3c);

/** Most of the film a full coat can reach, 0..1 of opaque — short of 1, so
 * even a caked screen is still glass rather than a painted panel. */
const COAT_MAX = 0.76;

/** Coat per second, at a downpour and at a filthy car. Rain films a screen
 * in seconds; road spray takes most of a stage. The BACKLIGHT is the other
 * way round — it sits out of the rain and in the wake, which is exactly why
 * it is the window that ends a rally caked. */
const SOIL = {
  front: { rain: 0.5, road: 0.05 },
  rear: { rain: 0.2, road: 0.11 },
};

/** What a blade leaves behind, as a fraction of what it found. A blade that
 * cleared to nothing reads as an eraser; the smear is most of why a wiped
 * screen reads as WIPED. */
const SMEAR = 0.1;

/** Seconds for one out-and-back stroke, barely wet through to a downpour,
 * and how long the blades rest at the park between strokes when there is
 * only a little on the glass. */
const STROKE = { slow: 2.1, fast: 0.85 };
const INTERMITTENT = 2.4;
/** The backlight's arm is the slower of the two, the way a hatch's is. */
const REAR_RATE = 1.6;

/** Coat (or rainfall) the blades come on at. They only ever switch off at
 * the end of a stroke, so they park where they started. */
const WIPE_ON = 0.15;

/** Where a screen's arms are hung and how far they swing. `pivots` are
 * across the pane as fractions of its half-width and `base` is up from its
 * bottom edge as a fraction of its height; `reach` is the arm's length as a
 * fraction of the pane's height. `park` is the blade's angle at rest and
 * `sweep` how far it swings from there, both measured the way a turn about
 * the screen's own normal runs — from straight up, TOWARD −x. A tandem pair
 * point the same way at rest, which is why one corner of a real windscreen
 * never comes clean. */
const ARMS = {
  front: { pivots: [-0.3, 0.28], base: 0.04, reach: 0.92, park: -1.42, sweep: 1.62 },
  rear: { pivots: [-0.12], base: 0.05, reach: 0.9, park: -1.15, sweep: 2 },
};

/** The arm, the blade and the pivot boss, in metres of arm length. */
const BLADE = { armWidth: 0.011, bladeWidth: 0.016, from: 0.16, boss: 0.028 };
const BLADE_COLOR = 0x1a1d22;
const ARM_COLOR = 0x2b2f36;

/** How wide a blade's own shadow on the glass is, rad, on top of the arc it
 * swept. Without it a fast stroke at a low frame rate leaves gaps. */
const WIPE_EDGE = 0.05;

export type CarWipers = {
  group: THREE.Group;
  /** The grime pane itself — handed out so the assembly can order it over
   * the glass it is laid on, which no distance sort can be trusted to get
   * right for two surfaces three millimetres apart. */
  film: THREE.Mesh;
  /**
   * Drive the glass one step.
   *
   * `wet` is how hard it is raining on the car, 0..1 (the environment owns
   * that number); `dirt` is how filthy the car has got, which is the same
   * reading the lamps are dimmed by.
   */
  update: (wet: number, dirt: number, dt: number) => void;
  dispose: () => void;
};

/** A screen's own metric frame: an origin at the middle of its bottom edge,
 * `right` across it, `up` along it, `normal` out of it. Built from the
 * patch rather than assumed, because a windscreen is a warped quad and the
 * backlight's own v axis runs the other way. */
type Frame = {
  origin: THREE.Vector3;
  right: THREE.Vector3;
  up: THREE.Vector3;
  normal: THREE.Vector3;
  width: number;
  height: number;
};

function vec(p: V3): THREE.Vector3 {
  return new THREE.Vector3(p[0], p[1], p[2]);
}

function frameOf(pane: ScreenPane): Frame {
  const { patch, rect } = pane;
  const uMid = (rect.u0 + rect.u1) / 2;
  // Which v edge is the BOTTOM is the screen's own business: the windscreen
  // runs cowl → roof and the backlight roof → deck.
  const low = vec(patchAt(patch, uMid, rect.v0));
  const high = vec(patchAt(patch, uMid, rect.v1));
  const flip = low.y > high.y;
  const vBottom = flip ? rect.v1 : rect.v0;
  const vTop = flip ? rect.v0 : rect.v1;

  const origin = vec(patchAt(patch, uMid, vBottom));
  const up = vec(patchAt(patch, uMid, vTop)).sub(origin);
  const height = up.length() || 1;
  up.divideScalar(height);

  const left = vec(patchAt(patch, rect.u0, vBottom));
  const right = vec(patchAt(patch, rect.u1, vBottom)).sub(left);
  const width = right.length() || 1;
  right.divideScalar(width);
  // Orthogonalise against `up`, then point the frame the same way the panel
  // faces — a left-handed frame would sweep the blades behind the glass.
  right.addScaledVector(up, -right.dot(up)).normalize();
  const normal = vec(patchNormal(patch));
  if (new THREE.Vector3().crossVectors(right, up).dot(normal) < 0) right.negate();
  return { origin, right, up, normal, width, height };
}

/** One pivot on a screen, with every film vertex already resolved into
 * polar coordinates about it — the sweep test is then two comparisons. */
type Pivot = { reach: number; radius: Float32Array; angle: Float32Array };

/** One screen's film: the slice of the shared buffers it owns, the coat on
 * each of its vertices, and the arm(s) that clear it. */
type Film = {
  offset: number;
  count: number;
  coat: Float32Array;
  /** Painted coat, quantised — the buffer is only rewritten when the glass
   * has visibly moved. */
  shown: Float32Array;
  /** Per-vertex soiling bias, so the coat gathers in streaks instead of
   * arriving as one even wash. */
  bias: Float32Array;
  soil: { rain: number; road: number };
  /** How much of what is on this screen is mud rather than water, 0..1. */
  mud: number;
  tone: THREE.Color;
  shade: number;
  pivots: Pivot[];
  blades: THREE.Object3D[];
  park: number;
  sweep: number;
  rate: number;
  /** Where the blades are in their stroke: the phase of the out-and-back,
   * the angle it last put them at, and the rest before the next one. */
  phase: number;
  angle: number;
  rest: number;
  running: boolean;
};

function hash(i: number): number {
  const s = Math.sin(i * 12.9898) * 43758.5453;
  return s - Math.floor(s);
}

/** One arm, authored about its own pivot: it points along +y, lies in the
 * z ≈ 0 plane of the screen, and sweeps by turning about z. */
function bladeGeometry(reach: number): THREE.BufferGeometry {
  const b = new MeshBuilder();
  b.box(0, 0, 0, BLADE.boss, BLADE.boss, 0.014, ARM_COLOR);
  b.box(0, reach * 0.34, 0.002, BLADE.armWidth, reach * 0.68, 0.011, ARM_COLOR);
  const from = reach * BLADE.from;
  b.box(0, (from + reach) / 2, 0.007, BLADE.bladeWidth, reach - from, 0.009, BLADE_COLOR);
  return b.geometry();
}

export function buildWipers(
  spec: CarBodySpec,
  material: THREE.Material,
  filmMaterial: THREE.Material,
): CarWipers {
  const group = new THREE.Group();
  const panes = screenPanes(spec);
  const armed = spec.cabin.wipers === true;

  const position: number[] = [];
  const color: number[] = [];
  const index: number[] = [];
  const films: Film[] = [];
  const bladeGeos: THREE.BufferGeometry[] = [];

  for (const which of ["front", "rear"] as const) {
    const pane = panes[which];
    const grid = GRID[which];
    const arm = ARMS[which];
    const frame = frameOf(pane);
    const offset = position.length / 3;
    const cols = grid.cols;
    const rows = grid.rows;
    const count = (cols + 1) * (rows + 1);

    // The film follows the patch's own warp rather than a plane through it,
    // so it lies on the glass at the corners as well as the middle.
    const local: number[] = [];
    for (let j = 0; j <= rows; j++) {
      for (let i = 0; i <= cols; i++) {
        const u = pane.rect.u0 + ((pane.rect.u1 - pane.rect.u0) * i) / cols;
        const v = pane.rect.v0 + ((pane.rect.v1 - pane.rect.v0) * j) / rows;
        const p = vec(patchAt(pane.patch, u, v)).addScaledVector(frame.normal, FILM_LIFT);
        position.push(p.x, p.y, p.z);
        color.push(0, 0, 0, 0);
        p.sub(frame.origin);
        local.push(p.dot(frame.right), p.dot(frame.up));
      }
    }
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const a = offset + j * (cols + 1) + i;
        const b = a + 1;
        const c = a + cols + 1;
        const d = c + 1;
        index.push(a, b, d, a, d, c);
      }
    }

    // An arm long enough to swing off the side of the glass is the one way
    // this reads as wrong from any angle, so the reach answers to where its
    // own pivot sits rather than to a figure picked for one car.
    const spread = (Math.max(...arm.pivots.map(Math.abs)) * frame.width) / 2;
    const clear = (frame.width / 2 - spread) / Math.max(0.2, Math.abs(Math.sin(arm.park)));
    const reach = Math.min(frame.height * arm.reach, clear * 0.98);
    const pivots: Pivot[] = [];
    const blades: THREE.Object3D[] = [];
    const geo = armed ? bladeGeometry(reach) : null;
    if (geo) bladeGeos.push(geo);
    const basis = new THREE.Matrix4().makeBasis(frame.right, frame.up, frame.normal);
    for (const at of arm.pivots) {
      const px = (at * frame.width) / 2;
      const py = arm.base * frame.height;
      const radius = new Float32Array(count);
      const angle = new Float32Array(count);
      for (let k = 0; k < count; k++) {
        const dx = local[k * 2] - px;
        const dy = local[k * 2 + 1] - py;
        radius[k] = Math.hypot(dx, dy);
        // The blade's own angle, not a compass bearing: turning an arm by
        // `a` about +z puts its tip at (−sin a, cos a), so a point's angle
        // is atan2(−x, y). Take the bearing instead and the wipe clears the
        // mirror image of the arc the blade actually swept.
        angle[k] = Math.atan2(-dx, dy);
      }
      pivots.push({ reach, radius, angle });
      if (!geo) continue;
      // The mount holds the screen's own orientation and the blade holds
      // nothing but its sweep. They cannot be one object: an Euler's z is
      // not a turn about the local z of a basis already in the same Euler,
      // so writing `rotation.z` onto the mount would throw the frame away
      // and swing the blade through the roof.
      const mount = new THREE.Group();
      mount.quaternion.setFromRotationMatrix(basis);
      mount.position
        .copy(frame.origin)
        .addScaledVector(frame.right, px)
        .addScaledVector(frame.up, py)
        .addScaledVector(frame.normal, BLADE_LIFT);
      const blade = new THREE.Mesh(geo, material);
      blade.rotation.z = arm.park;
      mount.add(blade);
      group.add(mount);
      blades.push(blade);
    }

    const shade = shadeFactor(patchNormal(pane.patch));
    const bias = new Float32Array(count);
    for (let k = 0; k < count; k++) {
      // Streaky, and heavier down the screen: what runs down the glass
      // gathers at the bottom of it.
      const down = 1 - local[k * 2 + 1] / frame.height;
      bias[k] = (0.5 + 0.9 * hash(offset + k)) * (0.7 + 0.6 * down);
    }

    films.push({
      offset,
      count,
      coat: new Float32Array(count),
      shown: new Float32Array(count).fill(-1),
      bias,
      soil: SOIL[which],
      mud: 0,
      tone: new THREE.Color(),
      shade,
      pivots,
      blades,
      park: arm.park,
      sweep: arm.sweep,
      rate: which === "rear" ? REAR_RATE : 1,
      phase: 0,
      angle: arm.park,
      rest: 0,
      running: false,
    });
  }

  const filmGeo = new THREE.BufferGeometry();
  filmGeo.setAttribute("position", new THREE.Float32BufferAttribute(position, 3));
  const colors = new THREE.Float32BufferAttribute(color, 4);
  filmGeo.setAttribute("color", colors);
  filmGeo.setIndex(index);
  const film = new THREE.Mesh(filmGeo, filmMaterial);
  // The film paints itself every step it moves; the dirt painter bakes from
  // a pristine copy, and two writers on one buffer is a flicker.
  film.userData[NO_DIRT] = true;
  group.add(film);

  const paint = (f: Film): void => {
    f.tone.copy(FILM_TONE).lerp(MUD_TONE, f.mud).multiplyScalar(f.shade);
    const arr = colors.array as Float32Array;
    for (let k = 0; k < f.count; k++) {
      const i = (f.offset + k) * 4;
      arr[i] = f.tone.r;
      arr[i + 1] = f.tone.g;
      arr[i + 2] = f.tone.b;
      arr[i + 3] = f.coat[k] * COAT_MAX;
      f.shown[k] = f.coat[k];
    }
    colors.needsUpdate = true;
  };
  for (const f of films) paint(f);

  /** Advance one screen's arms and clear whatever they passed over. */
  const sweep = (f: Film, need: number, dt: number): void => {
    if (f.blades.length === 0) return;
    if (!f.running) {
      if (need < WIPE_ON) return;
      f.running = true;
      f.phase = 0;
    }
    if (f.rest > 0) {
      f.rest -= dt;
      return;
    }
    const period = (STROKE.slow + (STROKE.fast - STROKE.slow) * Math.min(1, need * 1.3)) * f.rate;
    const was = f.angle;
    f.phase += (Math.PI * 2 * dt) / period;
    if (f.phase >= Math.PI * 2) {
      // A stroke always finishes: the blades stop at the park, never
      // halfway up the glass.
      f.phase = 0;
      if (need < WIPE_ON * 0.7) f.running = false;
      else if (need < 0.4) f.rest = INTERMITTENT * (1 - need);
    }
    f.angle = f.park + (f.sweep * (1 - Math.cos(f.phase))) / 2;
    for (const blade of f.blades) blade.rotation.z = f.angle;

    const lo = Math.min(was, f.angle) - WIPE_EDGE;
    const hi = Math.max(was, f.angle) + WIPE_EDGE;
    for (const pivot of f.pivots) {
      const inner = pivot.reach * BLADE.from;
      for (let k = 0; k < f.count; k++) {
        const r = pivot.radius[k];
        if (r < inner || r > pivot.reach) continue;
        const a = pivot.angle[k];
        if (a < lo || a > hi) continue;
        f.coat[k] *= SMEAR;
      }
    }
  };

  const update = (wet: number, dirt: number, dt: number): void => {
    for (const f of films) {
      const rain = f.soil.rain * wet;
      const road = f.soil.road * dirt;
      const rate = rain + road;
      if (rate > 0) {
        f.mud += (road / rate - f.mud) * Math.min(1, rate * dt * 5);
        for (let k = 0; k < f.count; k++) {
          f.coat[k] = Math.min(1, f.coat[k] + rate * f.bias[k] * dt);
        }
      }
      // What the arms answer to is what is actually on the glass, plus the
      // weather about to put more there.
      let sum = 0;
      for (let k = 0; k < f.count; k++) sum += f.coat[k];
      sweep(f, Math.max(wet, sum / f.count), dt);

      let moved = false;
      for (let k = 0; k < f.count && !moved; k++) {
        moved = Math.abs(f.coat[k] - f.shown[k]) > 1 / 32;
      }
      if (moved) paint(f);
    }
  };

  const dispose = (): void => {
    filmGeo.dispose();
    for (const geo of bladeGeos) geo.dispose();
  };

  return { group, film, update, dispose };
}
