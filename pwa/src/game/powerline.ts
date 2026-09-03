// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE GRID, drawn (R45). The engine surveyed the line and spotted every
// tower — where it stands, which way the crossarm points, what it is FOR
// (`engine/mapgen/powerline.ts`); this module builds what it was told.
//
// It is NOT part of the road chunks, for the wind farm's reason and more
// so: a chunk goes dark when the camera leaves the road it was built for,
// and a transmission line crosses the whole map. The tower you see on the
// skyline five hundred metres off the stage belongs to no chunk at all,
// and the wayleave running away over the hill belongs to every one of them.
// One line is one group, built once and kept.
//
// Two things are worth stating about the DRAWING, because both are places
// where the obvious thing looks wrong:
//
//   A WIRE IS SUB-PIXEL AND MUST STILL READ. A conductor is a few
//   centimetres thick; at a hundred metres that is a fraction of a pixel,
//   and a mesh that honest is a mesh that flickers and then disappears.
//   Drawn instead as a CROSS of two thin ribbons — one standing, one lying
//   — at a thickness that comes out around a pixel across the distances the
//   fog allows. The cross is what makes it survive being driven UNDER,
//   which is the one view where a single ribbon turns edge-on and vanishes,
//   and which is exactly the moment this whole feature exists for.
//
//   A LATTICE IS HOLES. The tower's silhouette against a sky is most of
//   what it is, so the legs and the crossarm are built as chords and braces
//   with air between them rather than as solid members. It costs a few
//   hundred triangles a tower and it is the difference between a
//   transmission tower and a goalpost.
//
// Everything in a line is merged into three geometries — the steel, the
// concrete footings, the wires — so a whole grid across a map is three draw
// calls whatever it costs the surveyor.

import * as THREE from "three";
import {
  createRng,
  pylonFootings,
  pylonLegs,
  pylonWirePoints,
  spanSag,
  STAGE_RULES,
  type PowerLine,
  type Pylon,
  type Track,
} from "@engine";
import { GeoBuilder } from "./flora-build.ts";
import type { GroundBeside } from "./road-mesh.ts";
import { shareOne } from "../lib/shared-gpu.ts";
import { detailTexture } from "./textures.ts";

const P = STAGE_RULES.powerline;

const TINT = {
  steel: new THREE.Color(0x9aa1a6),
  steelDark: new THREE.Color(0x6e767c),
  concrete: new THREE.Color(0xb0aca4),
  insulator: new THREE.Color(0x8d9499),
};

/** The machine's proportions that are not the survey's to decide, m. */
const MACHINE = {
  /** How far apart a leg's two chords stand along the line, at the foot and
   * at the crossarm: the leg tapers as it rises, which is what stops it
   * reading as a ladder. */
  legDepth: { foot: P.tower.foot, top: P.tower.foot * 0.55 },
  /** How thick a chord is, and a brace. */
  chord: 0.3,
  brace: 0.16,
  /** How many bracing bays a leg is panelled into, and a crossarm. */
  legBays: 9,
  armBays: 8,
  /** The crossarm's truss: how deep it hangs under its top chord and how
   * wide its two bottom chords stand apart along the line. */
  arm: { depth: 1.9, width: 1.7 },
  /** An insulator string: how fat its discs are, and how many. */
  insulator: { radius: 0.34, discs: 7 },
  /** The portal's own bracing: how far up each leg the diagonal leaves, as
   * a share of the tower's height, and how far in from the middle it meets
   * the crossarm, m. */
  portal: { knee: 0.62, reach: 2.6 },
};

/** The conductor's drawn half-thickness, m. A real one is a fiftieth of
 * this; at that size it is under a pixel at any range and the rasterizer
 * drops it in and out as the camera moves. This comes out around a pixel
 * at a couple of hundred metres, which is where a real one stops being a
 * wire and starts being a line drawn on the sky. */
const WIRE_HALF = 0.11;
/** How long a piece of catenary is drawn straight, m. A parabola over
 * three hundred metres needs no more than this, and a stretched span gets
 * proportionally more of them. */
const WIRE_SEGMENT = 26;

const steelMaterial = shareOne(
  () => new THREE.MeshLambertMaterial({ vertexColors: true, map: detailTexture() }),
);
/** The wires: unlit and near-black, because a conductor against any sky is
 * a silhouette. Lighting one makes it flash as the camera turns, which is
 * the one thing a wire never does.
 *
 * DOUBLE-SIDED, and that is not a detail: a ribbon standing in for a round
 * conductor is two triangles with one winding, and the whole point of the
 * lying half of the cross is to be looked at from BELOW — which is the side
 * a front-face cull throws away, in the one frame this feature exists for. */
const wireMaterial = shareOne(
  () => new THREE.MeshBasicMaterial({ color: 0x24282c, side: THREE.DoubleSide }),
);

type Vec = { x: number; y: number; z: number };

/** One structural MEMBER: a box run from `a` to `b`, `thick` square. The
 * lattice is nothing else, so this is the whole vocabulary. */
function member(b: GeoBuilder, color: THREE.Color, a: Vec, c: Vec, thick: number): void {
  const dx = c.x - a.x;
  const dy = c.y - a.y;
  const dz = c.z - a.z;
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-4) return;
  const geo = new THREE.BoxGeometry(thick, len, thick);
  geo.translate(0, len / 2, 0);
  // Stand it up along its own axis: the box is built about +y, so it is
  // turned onto the member's direction and then moved to the near end.
  const q = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(dx, dy, dz).normalize(),
  );
  geo.applyQuaternion(q);
  geo.translate(a.x, a.y, a.z);
  b.add(geo, color);
}

/** A ladder of braces between two chords, `bays` panels of it: the zigzag
 * that makes a lattice a lattice, plus a tie across every other node. */
function brace(b: GeoBuilder, from: [Vec, Vec], to: [Vec, Vec], bays: number, thick: number): void {
  const at = (side: 0 | 1, t: number): Vec => ({
    x: from[side].x + (to[side].x - from[side].x) * t,
    y: from[side].y + (to[side].y - from[side].y) * t,
    z: from[side].z + (to[side].z - from[side].z) * t,
  });
  for (let i = 0; i < bays; i++) {
    const t0 = i / bays;
    const t1 = (i + 1) / bays;
    // The zigzag alternates which chord it leaves from, so consecutive
    // braces make the W a real lattice has rather than a row of parallels.
    const near = (i % 2) as 0 | 1;
    const far = (1 - near) as 0 | 1;
    member(b, TINT.steelDark, at(near, t0), at(far, t1), thick);
    if (i % 2 === 1) member(b, TINT.steelDark, at(0, t1), at(1, t1), thick);
  }
}

/** One tower, in world coordinates, into `b`. `feet` is the ground under
 * each leg as the terrain actually made it. */
function tower(b: GeoBuilder, height: number, pylon: Pylon, feet: number[]): void {
  const tops = pylonFootings(feet);
  // The tower's own frame: `along` the line, `across` it. The crossarm
  // lies across, which at an angle tower is across the BISECTOR — which is
  // where the survey put its heading.
  const along = { x: Math.sin(pylon.heading), z: Math.cos(pylon.heading) };
  const across = { x: Math.cos(pylon.heading), z: -Math.sin(pylon.heading) };
  /** A point in the tower's frame: `a` across the line from its middle, `l`
   * along it, `y` over the highest footing. */
  const base = Math.max(...tops);
  const at = (a: number, l: number, y: number): Vec => ({
    x: pylon.x + across.x * a + along.x * l,
    y: base + y,
    z: pylon.z + across.z * a + along.z * l,
  });
  const armY = height;
  const topAcross = P.tower.arm / 2 - P.tower.inset;
  for (let i = 0; i < 2; i++) {
    const side = i === 0 ? -1 : 1;
    const foot = tops[i] - base;
    const legAcross = side * (P.tower.base / 2);
    const chords: [Vec, Vec][] = [0, 1].map((k) => {
      const l = k === 0 ? -1 : 1;
      return [
        at(legAcross, (l * MACHINE.legDepth.foot) / 2, foot),
        at(side * topAcross, (l * MACHINE.legDepth.top) / 2, armY),
      ] as [Vec, Vec];
    });
    for (const [a, c] of chords) member(b, TINT.steel, a, c, MACHINE.chord);
    const near: [Vec, Vec] = [chords[0][0], chords[1][0]];
    const far: [Vec, Vec] = [chords[0][1], chords[1][1]];
    brace(b, near, far, MACHINE.legBays, MACHINE.brace);
  }
  // The crossarm: a triangular truss — one top chord and two bottom ones,
  // which is what carries a twenty-metre arm without a mid support.
  const halfArm = P.tower.arm / 2;
  const top: [Vec, Vec] = [at(-halfArm, 0, armY), at(halfArm, 0, armY)];
  member(b, TINT.steel, top[0], top[1], MACHINE.chord);
  for (const l of [-1, 1]) {
    const lower: [Vec, Vec] = [
      at(-halfArm + 1.2, (l * MACHINE.arm.width) / 2, armY - MACHINE.arm.depth),
      at(halfArm - 1.2, (l * MACHINE.arm.width) / 2, armY - MACHINE.arm.depth),
    ];
    member(b, TINT.steel, lower[0], lower[1], MACHINE.chord);
    brace(b, [top[0], lower[0]], [top[1], lower[1]], MACHINE.armBays, MACHINE.brace);
  }
  // The peaks: the little A over each end of the arm that carries an earth
  // wire, and the whole reason this reads as a portal and not a goalpost.
  for (const side of [-1, 1]) {
    const tip = at(side * halfArm, 0, armY + P.tower.peak);
    for (const l of [-1, 1]) {
      member(b, TINT.steel, at(side * halfArm - side * 1.9, l * 0.8, armY), tip, MACHINE.brace);
    }
    member(b, TINT.steelDark, at(side * halfArm, 0, armY), tip, MACHINE.brace);
  }
  // THE PORTAL BRACING: the diagonals from partway up each leg to the
  // crossarm inboard of where that leg meets it. Without them the two legs
  // are two masts with a beam laid across, which is what the frame is not:
  // this is the triangulation that lets a twenty-metre arm stand on legs
  // that splay, and it is the most recognisable thing about the type after
  // the peaks.
  for (const side of [-1, 1]) {
    const kneeY = armY * MACHINE.portal.knee;
    const kneeAcross = side * (P.tower.base / 2 + (topAcross - P.tower.base / 2) * MACHINE.portal.knee); // prettier-ignore
    for (const l of [-1, 1]) {
      member(
        b,
        TINT.steel,
        at(kneeAcross, (l * MACHINE.legDepth.foot) / 2, kneeY),
        at(side * MACHINE.portal.reach, (l * MACHINE.arm.width) / 2, armY - MACHINE.arm.depth),
        MACHINE.brace,
      );
    }
  }
  // ...and the tie straight across between the two leg tops, under the arm.
  for (const l of [-1, 1]) {
    member(
      b,
      TINT.steelDark,
      at(-topAcross, (l * MACHINE.legDepth.top) / 2, armY - MACHINE.arm.depth),
      at(topAcross, (l * MACHINE.legDepth.top) / 2, armY - MACHINE.arm.depth),
      MACHINE.brace,
    );
  }
  // The insulator strings. A SUSPENSION tower's hang straight down off the
  // arm; an angle or tension tower's are pulled out ALONG the line, one set
  // each way, because the wire is anchored into the tower there rather than
  // resting on it — which is the whole visible difference between the two.
  const hanging = pylon.kind === "suspension";
  for (let i = 0; i < P.wire.conductors; i++) {
    const a = ((i / (P.wire.conductors - 1)) * 2 - 1) * halfArm;
    if (hanging) {
      insulator(b, at(a, 0, armY), at(a, 0, armY - P.wire.insulator));
      continue;
    }
    for (const l of [-1, 1]) {
      insulator(b, at(a, 0, armY - 0.5), at(a, l * P.wire.insulator, armY - P.wire.insulator));
    }
  }
}

/** One insulator string: a stack of discs from `from` to `to`. */
function insulator(b: GeoBuilder, from: Vec, to: Vec): void {
  const n = MACHINE.insulator.discs;
  const dx = (to.x - from.x) / n;
  const dy = (to.y - from.y) / n;
  const dz = (to.z - from.z) / n;
  const len = Math.hypot(dx, dy, dz);
  for (let i = 0; i < n; i++) {
    const geo = new THREE.CylinderGeometry(
      MACHINE.insulator.radius,
      MACHINE.insulator.radius,
      len * 0.55,
      6,
    );
    const q = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(dx, dy, dz).normalize(),
    );
    geo.applyQuaternion(q);
    geo.translate(from.x + dx * (i + 0.5), from.y + dy * (i + 0.5), from.z + dz * (i + 0.5));
    b.add(geo, TINT.insulator);
  }
}

/** The concrete under one tower: a chimney per leg, from the ground it
 * stands on up to the level the steel was set to (R45's `pylonFootings`).
 * A stub of a few tens of centimetres on the level, and most of a metre or
 * two on the downhill leg of a tower on a slope. */
function footings(b: GeoBuilder, pylon: Pylon, feet: number[]): void {
  const legs = pylonLegs(pylon);
  const tops = pylonFootings(feet);
  const w = P.tower.footing.width;
  for (let i = 0; i < legs.length; i++) {
    // Sunk half a metre below the ground it shows at, so a footing on a
    // slope never floats where the lattice ground and the drawn ground
    // disagree by a few centimetres.
    const bottom = feet[i] - 0.5;
    const h = tops[i] - bottom;
    const geo = new THREE.BoxGeometry(w, h, w);
    geo.translate(legs[i].x, bottom + h / 2, legs[i].z);
    b.add(geo, TINT.concrete);
  }
}

/** One wire, from `a` to `b`, hanging in its span's own parabola. Drawn as
 * a CROSS of two ribbons — see the header. */
function wire(positions: number[], a: Vec, c: Vec): void {
  const length = Math.hypot(c.x - a.x, c.z - a.z);
  const steps = Math.max(4, Math.ceil(length / WIRE_SEGMENT));
  const point = (t: number): Vec => ({
    x: a.x + (c.x - a.x) * t,
    y: a.y + (c.y - a.y) * t - spanSag(length, t),
    z: a.z + (c.z - a.z) * t,
  });
  // The ribbon's own width runs across the span in the ground plane, so
  // the lying half is widest exactly where a car underneath looks at it.
  let from = point(0);
  for (let i = 1; i <= steps; i++) {
    const to = point(i / steps);
    quad(positions, from, to, 0, WIRE_HALF);
    quad(positions, from, to, WIRE_HALF, 0);
    from = to;
  }
}

/** One ribbon segment: a quad from `a` to `b`, offset `across` in the
 * ground plane and `up` vertically, written as two triangles. */
function quad(positions: number[], a: Vec, b: Vec, across: number, up: number): void {
  const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
  const nx = (-(b.z - a.z) / len) * across;
  const nz = ((b.x - a.x) / len) * across;
  const corners: Vec[] = [
    { x: a.x - nx, y: a.y - up, z: a.z - nz },
    { x: b.x - nx, y: b.y - up, z: b.z - nz },
    { x: b.x + nx, y: b.y + up, z: b.z + nz },
    { x: a.x + nx, y: a.y + up, z: a.z + nz },
  ];
  for (const i of [0, 1, 2, 0, 2, 3]) positions.push(corners[i].x, corners[i].y, corners[i].z);
}

/** Build one whole transmission line: its towers, their footings and every
 * span of wire between them, as one group of three meshes. */
export function buildPowerLine(track: Track, line: PowerLine, beside: GroundBeside): THREE.Group {
  const rng = createRng((track.seed ^ 0x3f7c1a95) >>> 0);
  const steel = new GeoBuilder(() => rng.next());
  const concrete = new GeoBuilder(() => rng.next());
  const positions: number[] = [];
  /** Every tower's wire attachment points, in world space and in
   * `pylonWirePoints` order — so a span is a walk down two matching lists
   * and the bundle stays a bundle from end to end. */
  const hangs: Vec[][] = [];
  for (const pylon of line.pylons) {
    const feet = pylonLegs(pylon).map((leg) => beside.heightAt(leg.x, leg.z));
    tower(steel, line.height, pylon, feet);
    footings(concrete, pylon, feet);
    const base = Math.max(...pylonFootings(feet));
    const across = { x: Math.cos(pylon.heading), z: -Math.sin(pylon.heading) };
    hangs.push(
      pylonWirePoints(line.height).map((w) => ({
        x: pylon.x + across.x * w.across,
        y: base + w.up,
        z: pylon.z + across.z * w.across,
      })),
    );
  }
  for (let i = 0; i + 1 < hangs.length; i++) {
    for (let k = 0; k < hangs[i].length; k++) wire(positions, hangs[i][k], hangs[i + 1][k]);
  }
  const group = new THREE.Group();
  group.add(new THREE.Mesh(steel.build(), steelMaterial()));
  group.add(new THREE.Mesh(concrete.build(), steelMaterial()));
  const wires = new THREE.BufferGeometry();
  wires.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  const mesh = new THREE.Mesh(wires, wireMaterial());
  // A line is kilometres long and its bound is the whole map: culled by its
  // own box it drops out the moment the camera looks along it rather than
  // across it, which is most of the time.
  mesh.frustumCulled = false;
  group.add(mesh);
  return group;
}

/** One whole tower standing at the origin, for the item sheet: the steel,
 * the footings and a stub of wire either way, at a mid-band height. */
export function buildPylon(rand: () => number, kind: Pylon["kind"] = "suspension"): THREE.Group {
  const height = (P.tower.height.min + P.tower.height.max) / 2;
  const pylon: Pylon = { x: 0, z: 0, y: 0, heading: 0, kind, deviation: 0, span: 0 };
  const steel = new GeoBuilder(rand);
  const concrete = new GeoBuilder(rand);
  tower(steel, height, pylon, [0, 0]);
  footings(concrete, pylon, [0, 0]);
  const group = new THREE.Group();
  group.add(new THREE.Mesh(steel.build(), steelMaterial()));
  group.add(new THREE.Mesh(concrete.build(), steelMaterial()));
  return group;
}
