// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE SHADOW A CAR THROWS ON THE GROUND.
//
// Nothing in this game casts a real shadow: the body is fullbright with its
// shading baked into vertex colors, and the world is lit by one directional
// light with no shadow map behind it. What lies under the car is therefore
// DRAWN, and it has to earn the name — three things separate a shadow from a
// dark disc towed along under the axles:
//
//   THE PLAN VIEW  a shadow is the car seen from the sun, and a rally car
//                  seen from above is a blunt-ended box with the wheels and
//                  the flares standing out of its middle. The silhouette is
//                  sampled off the same CarBodySpec the body is lofted from,
//                  so a wide-arched Group-4 car throws a wide-arched shadow.
//   THE PENUMBRA   no shadow edge in the world is a line. The outline fades
//                  out through a skirt carried in the vertex alpha, which
//                  costs one extra band of triangles and no texture.
//   THE LEAN       which way the light throws it and how far. A shadow that
//                  sits dead under the car in every light is a decal; one
//                  that reaches away from a low dusk sun is the car standing
//                  in that light.
//
// The whole thing is one mesh with one material, because there are fifteen
// cars on a stage and every one of them owns one of these.

import * as THREE from "three";
import { clamp } from "../lib/util.ts";
import type { CarState } from "@engine";

import { bodyHalfLength, flareAt, sampleProfile } from "./car/shell.ts";
import type { CarBodySpec } from "./car/spec.ts";
import type { SunShade } from "./sky.ts";

/** How far the silhouette is grown past the car's own plan outline, m.
 *
 * A shadow is NOT the footprint: it is the whole body projected, and every
 * panel above the ground lands outside the outline the tyres stand in — the
 * roof most of all. Without the pad the sheet hides entirely under the car
 * it belongs to, which is the same picture as having no shadow at all: from
 * any camera the game actually uses, what is seen of a shadow is its
 * FRINGE. Read it as the average of what the body's height throws under the
 * suns the game is played in; the lean below is what aims the rest of it. */
const PAD = 0.2;
/** Where the fully dark core of the shadow ends, as a fraction of the way
 * out from the middle to the silhouette. Everything past it is gradient. */
const CORE = 0.68;
/** Alpha at the silhouette's own edge, against 1 in the core — how much of
 * the fade has already happened by the time the outline is reached. Under
 * half and the car reads as floating on a smudge; near 1 and the skirt is a
 * halo around a hard-edged shape, which is worse than no skirt at all. */
const EDGE_ALPHA = 0.7;
/** How far the skirt spreads past the silhouette, m. Roughly the penumbra a
 * body sitting a third of a metre off the ground actually throws. */
const BLUR = 0.3;
/** Stations along the car the silhouette is sampled at, on top of the
 * profile's own and the wheels' ends. Twelve is enough that the flare over
 * an axle reads as a swell rather than as a corner. */
const STATIONS = 12;

/** How dark the shadow is with no direct sun in the light at all — the
 * ground darkening under any body that sits on it, which is what keeps a car
 * from floating under an overcast sky... */
const AMBIENT_SHADE = 0.15;
/** ...and how much more the beam adds at full hardness (sky.ts's
 * `sunShadeFor`). The two together are the core's alpha. */
const DIRECT_SHADE = 0.28;

/** How high up the body the light is taken to pass, m — the lever the sun's
 * elevation works on, so a low sun throws the shadow clear of the car
 * instead of nudging it. Not the roof: the mass of a car's shadow comes off
 * the waist, and projecting from the roof reads as the car hovering. */
const CAST_HEIGHT = 0.9;
/** …and the cap on what that offset is ever allowed to reach, m. A sun on
 * the horizon projects a shadow to infinity; a shadow that has left the car
 * behind stops reading as the car's. */
const CAST_MAX = 1.2;
/** How much the same lean also DRAWS THE SHADOW OUT along the light, as a
 * fraction of the lean, and the longest it may ever be drawn. A shadow that
 * only slides is a copy of the car in the wrong place; stretching it is what
 * says the light is coming in low. */
const STRETCH = 0.45;
const STRETCH_MAX = 2;

/** What the hardness is multiplied up by before it AIMS the shadow.
 *
 * Darkness and direction fail at different rates, and one number drives
 * both. A weak beam still throws a long shadow — a dusk sun barely lights
 * the ground and lays the car's shadow half across the road — so the aim
 * saturates well short of full sun, and only a light with no beam left in it
 * at all (a storm's ceiling) puts the sheet back dead under the car. */
const AIM_GAIN = 2.5;

/** Height above the ground the sheet is laid at, m. Along the ground's own
 * up, not the world's — a shadow lifted along +y knifes into a hillside. */
const LIFT = 0.06;

/** How fast the shadow shrinks as the car climbs away from the ground, per
 * metre, and how small it is ever allowed to get. The shrink is the whole
 * altitude cue on a jump, so it stays a shrink rather than the spreading,
 * lightening penumbra a real shadow would grow: over a crest the player is
 * reading HOW HIGH off this, and a shadow that grows says the opposite. */
const FLIGHT_SHRINK = 0.12;
const FLIGHT_FLOOR = 0.35;

export type CarShadow = {
  /** The scene-side group. It belongs to the GROUND, not to the car: it is
   * added to the scene as the car's sibling and lies on the ground's slope
   * while the body above it pitches, rolls and flies. */
  group: THREE.Group;
  /** Which way this stage's light throws a shadow and how hard (sky.ts).
   * Pushed from the environment, along with the tint the paint takes. */
  setShade: (shade: SunShade) => void;
  /** Lay the shadow under the car. `ground` is the height of the ground
   * beneath it, `pitch` and `roll` the attitude of THAT ground — held over
   * a flight, where the car's own angles are the arc's and the tumble's. */
  place: (car: CarState, ground: number, pitch: number, roll: number) => void;
  dispose: () => void;
};

/** Half-width of the shadow at `z`, m: the widest thing the car has over
 * that station. The bodywork with its flares is usually it, but a car on a
 * narrow shell with the tires proud of the arches is shadowed by the tires,
 * and a plan view is the one place that shows. */
function halfAt(spec: CarBodySpec, axles: number[], z: number): number {
  let half = sampleProfile(spec.profile, z).half + flareAt(spec, axles, z);
  const tire = spec.trackHalf + spec.wheelWidth / 2;
  for (const axle of axles) {
    if (Math.abs(z - axle) <= spec.wheelRadius) half = Math.max(half, tire);
  }
  return half + PAD;
}

/** The z stations the silhouette is sampled at, nose (+z) → tail (−z): an
 * even ladder, plus every station the profile authored, plus the ends of
 * each wheel — the step where a tire leaves the shadow is a real edge in a
 * plan view, and a ladder that misses it rounds it off into a bulge. */
function stationsFor(spec: CarBodySpec, axles: number[]): number[] {
  // The same pad the flanks get, on the ends: `bodyHalfLength` measures to
  // the bumpers, and the body over them still throws past that.
  const half = bodyHalfLength(spec) + PAD;
  const zs = [half, -half];
  for (let i = 1; i < STATIONS; i++) zs.push(half - (2 * half * i) / STATIONS);
  for (const p of spec.profile) zs.push(clamp(p.z, -half, half));
  for (const axle of axles) {
    zs.push(clamp(axle + spec.wheelRadius, -half, half));
    zs.push(clamp(axle - spec.wheelRadius, -half, half));
  }
  zs.sort((a, b) => b - a);
  // Nothing closer together than the skirt is wide. Two stations a
  // centimetre apart with different widths — a wheel's end landing beside a
  // profile station is where it happens — make a near-vertical wall in the
  // outline, and a skirt grown outward from both ends of one crosses itself
  // and turns its triangles inside out (they then vanish, back-face culled).
  // Six centimetres on a four-metre car costs no shape and removes the case.
  return zs.filter((z, i) => i === 0 || Math.abs(z - zs[i - 1]) > BLUR / 5);
}

/** The silhouette as a closed loop in the ground plane: down the right
 * flank nose → tail, then back up the left one. Mirrored rather than
 * sampled twice, so the two sides can never disagree. */
function loopFor(spec: CarBodySpec, axles: number[]): { x: number; z: number }[] {
  const zs = stationsFor(spec, axles);
  const loop: { x: number; z: number }[] = [];
  for (const z of zs) loop.push({ x: halfAt(spec, axles, z), z });
  for (let i = zs.length - 1; i >= 0; i--) loop.push({ x: -halfAt(spec, axles, zs[i]), z: zs[i] });
  return loop;
}

/** Outward normals for the loop above — the direction the soft skirt is
 * grown along at each point.
 *
 * The loop runs nose → right flank → tail → left flank, which is CLOCKWISE
 * in x/z (x right, z into the nose), and the outward side of a clockwise
 * loop is the tangent turned the other way: (−dz, dx). Take the other one
 * and the whole skirt is built INSIDE the silhouette, where it reads as a
 * pale rim around a shadow — a bug that looks like a material problem. */
function normalsFor(loop: { x: number; z: number }[]): { x: number; z: number }[] {
  const n = loop.length;
  /** The outward normal of the edge LEAVING point i, unit length. */
  const edge = loop.map((p, i) => {
    const next = loop[(i + 1) % n];
    const dx = next.x - p.x;
    const dz = next.z - p.z;
    const len = Math.hypot(dx, dz);
    return len > 1e-6 ? { x: -dz / len, z: dx / len } : { x: 0, z: 0 };
  });
  return loop.map((p, i) => {
    // The two edges' normals averaged — NOT the normal of the chord across
    // the corner. Averaging two unit vectors can never reach further out
    // than either of them, so a sharp corner grows a short bevel; a chord
    // normal overshoots exactly where the outline turns hardest, and the
    // skirt built on it folds through itself.
    const a = edge[(i - 1 + n) % n];
    const b = edge[i];
    const nx = a.x + b.x;
    const nz = a.z + b.z;
    const len = Math.hypot(nx, nz);
    return len > 1e-6 ? { x: nx / len, z: nz / len } : { x: Math.sign(p.x) || 1, z: 0 };
  });
}

/** The sheet: a dark core, the silhouette part-faded, and a skirt that goes
 * to nothing. Built flat in x/z with every y at zero, so nothing has to be
 * rotated into the ground plane afterwards and the lean can be composed as
 * plain 2-D maths. */
function buildSheet(spec: CarBodySpec, axles: number[]): THREE.BufferGeometry {
  const loop = loopFor(spec, axles);
  const out = normalsFor(loop);
  const n = loop.length;
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const vertex = (x: number, z: number, alpha: number): number => {
    pos.push(x, 0, z);
    col.push(0, 0, 0, alpha);
    return pos.length / 3 - 1;
  };
  // Three rings out from the middle: the core's edge, the silhouette, and
  // the outside of the skirt. The core is scaled toward the centre rather
  // than inset along the normals — an inset nose on a tapered car folds
  // through itself, a scaled one cannot.
  const core: number[] = [];
  const edge: number[] = [];
  const skirt: number[] = [];
  for (let i = 0; i < n; i++) {
    const p = loop[i];
    core.push(vertex(p.x * CORE, p.z * CORE, 1));
    edge.push(vertex(p.x, p.z, EDGE_ALPHA));
    skirt.push(vertex(p.x + out[i].x * BLUR, p.z + out[i].z * BLUR, 0));
  }
  const middle = vertex(0, 0, 1);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    idx.push(middle, core[i], core[j]);
    idx.push(core[i], edge[i], edge[j], core[i], edge[j], core[j]);
    idx.push(edge[i], skirt[i], skirt[j], edge[i], skirt[j], edge[j]);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  // Four components: three.js reads the fourth as vertex ALPHA once the
  // material is transparent, which is the whole gradient without a texture.
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 4));
  geo.setIndex(idx);
  return geo;
}

/** No sun at all: a soft patch dead under the car, which is what a heavy
 * deck leaves — and what a car that has not been told the conditions yet
 * stands on, so a shadow is never MISSING while the light is being worked
 * out. */
export const FLAT_SHADE: SunShade = { x: 0, z: -1, lean: 0, hardness: 0 };

export function createCarShadow(spec: CarBodySpec, fade: number): CarShadow {
  const shift = spec.axleShift ?? 0;
  const axles = [spec.wheelbase / 2 + shift, -spec.wheelbase / 2 + shift];
  const geometry = buildSheet(spec, axles);
  const material = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    // A shadow darkens the ground; it must not hide what is behind it. With
    // depth writing on, the sheet claims its patch of the depth buffer and
    // the dust thrown over it disappears.
    depthWrite: false,
  });
  const sheet = new THREE.Mesh(geometry, material);
  // The lean is composed straight into the mesh's matrix: the lift and the
  // slide away from the light, then a stretch ALONG the light — which is a
  // turn into its direction, a scale, and the turn back out of it. Three
  // matrices held here rather than made per frame: fifteen cars.
  sheet.matrixAutoUpdate = false;
  const slide = new THREE.Matrix4();
  const spin = new THREE.Matrix4();
  const unspin = new THREE.Matrix4();
  const stretch = new THREE.Matrix4();

  // Same two-group nesting as the car itself, so the sheet takes the same
  // heading-then-attitude chain and lands flush on the same triangle.
  const tilt = new THREE.Group();
  tilt.add(sheet);
  const group = new THREE.Group();
  group.add(tilt);

  let shade = FLAT_SHADE;
  const setShade = (next: SunShade): void => {
    shade = next;
  };

  const place = (car: CarState, ground: number, pitch: number, roll: number): void => {
    group.position.set(car.x, ground, car.z);
    group.rotation.y = car.heading;
    tilt.rotation.z = roll;
    tilt.rotation.x = -pitch;

    const height = Math.max(0, car.y - ground);
    const shrink = clamp(1 - height * FLIGHT_SHRINK, FLIGHT_FLOOR, 1);
    group.scale.setScalar(shrink);
    material.opacity = (AMBIENT_SHADE + DIRECT_SHADE * shade.hardness) * shrink * fade;

    // The light's direction is the world's; the sheet hangs under a group
    // already turned to the car's heading, so it arrives here turned back
    // out of it. A drift is exactly the moment the two disagree.
    const h = -car.heading;
    const lx = shade.x * Math.cos(h) - shade.z * Math.sin(h);
    const lz = shade.x * Math.sin(h) + shade.z * Math.cos(h);
    const aim = Math.min(1, shade.hardness * AIM_GAIN);
    const reach = Math.min(CAST_HEIGHT * shade.lean, CAST_MAX) * aim;
    // atan2(x, z) rather than (z, x): the angle wanted is the one that turns
    // +z onto the light, because the scale below is applied along +z.
    const theta = Math.atan2(lx, lz);
    spin.makeRotationY(theta);
    unspin.makeRotationY(-theta);
    stretch.makeScale(1, 1, Math.min(STRETCH_MAX, 1 + STRETCH * shade.lean * aim));
    slide.makeTranslation(lx * reach, LIFT, lz * reach);
    sheet.matrix.copy(slide).multiply(spin).multiply(stretch).multiply(unspin);
  };

  const dispose = (): void => {
    geometry.dispose();
    material.dispose();
  };

  return { group, setShade, place, dispose };
}
