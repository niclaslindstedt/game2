// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT A GATE STANDS ON THE GROUND — the candy-striped legs, the bale walls
// down each side, and the finish's guns. The arch's banner is the one piece
// of a gate that is a PICTURE, so it needs a canvas and lives next door in
// `finish-gate.ts`; everything here is geometry and heights, which is what
// lets the root suite hold it (`tests/gate_test.ts`).
//
// THE RULE THE WHOLE FILE EXISTS FOR: a gate is set out from the road's
// CENTRELINE — the posts at the ends of the timing line, the bales out past
// them, the guns further out again — and by the time it reaches any of them
// the mat has cambered away, the shoulder has stepped down and the verge has
// leaned off toward the country (R16). Foot a piece on the sample's own
// elevation and it hangs in the air over the hillside beside the road.

import * as THREE from "three";
import { corridorOffset, gateHalfWidth, type Track } from "@engine";

import { rightOf } from "./ribbon.ts";

const RED = "#e23c2c";
const WHITE = "#f6f3ea";

/** Where a cannon's muzzle is and which way it points — everything the FX
 * needs to fire one. */
export type Muzzle = {
  x: number;
  y: number;
  z: number;
  /** Unit direction the barrel points, world space. */
  dx: number;
  dy: number;
  dz: number;
};

/** How many cannons stand at a finish — two each side, angled differently
 * so a full-house salute crosses over the road rather than firing four
 * identical plumes. */
const PER_SIDE = 2;
/** Barrel length and bore, m. */
const BARREL = { length: 1.15, bore: 0.17 };
/** How far out past the road edge a cannon stands, and how high its muzzle
 * sits above the ground it is planted in. */
const STAND = { out: 1.4, height: 1.6 };
/** How far back down the road from the gate the cannons are planted, m —
 * behind the line, so what they throw arrives over a car that has already
 * crossed it. */
const BEHIND = 2.5;
/** How steeply a barrel is cocked, radians above horizontal, and how far it
 * is turned in across the road (0 is straight across it). The pair on each
 * side differ so the plumes cross instead of doubling up.
 *
 * Both are FLAT rather than skyward — around 35° and 47°. A cannon fired
 * near-vertical throws its load up out of the frame and rains it down on
 * nothing; the arc that reads is the one that crosses the road at about the
 * height of the gate's banner, which is exactly where the car is. */
const AIM = [
  { pitch: 0.62, yaw: 0.2 },
  { pitch: 0.82, yaw: 0.55 },
];

/** How high the arch's top sits over the road it spans, m. The legs reach it
 * whatever the ground below them does, because a scaffold is erected level
 * over the road and legged down to whatever it is standing on. */
export const ARCH_TOP = 5;

/** The drawn ground under a world point, m (`Terrain.standOn`). */
export type GroundUnder = (x: number, z: number) => number;

/** What every piece of a gate that RESTS ON THE GROUND is named — the bottom
 * bale of each wall, the lowest band of each post, a gun's plate. Everything
 * else in the group is carried by one of them (the bale stacked on the wall,
 * the bands up the leg, the barrel on its plate) or spans the road (the
 * banner). `tests/gate_test.ts` holds the named ones down. */
export const FOOTED = "gate foot";

/** Where a piece of gate furniture standing `lat` metres off the centreline
 * is FOOTED.
 *
 * `ground` is the surface everything else in the world stands on, and it is
 * the honest answer: it carries the mat's camber, the shoulder's step, the
 * verge leaning away and R16's hand-over onto the country, none of which a
 * sample's own elevation knows about. Without it — the item catalog, which
 * turns a gate on a bare ribbon with no landscape under it — the corridor's
 * cross-section is all there is to stand on, which is what the split boards
 * foot themselves on for the same reason (`split-board.ts`). */
function footAt(
  s: Track["samples"][number],
  lat: number,
  x: number,
  z: number,
  ground: GroundUnder | undefined,
): number {
  return ground ? ground(x, z) : s.elevation + corridorOffset(s, lat, s.width);
}

/** The furniture every gate wears: striped legs and a wall of bales. */
export function buildGateFurniture(
  track: Track,
  index: number,
  group: THREE.Group,
  ground: GroundUnder | undefined,
): void {
  // The posts stand at the ends of the LINE the engine watches, so what the
  // player aims between is exactly what the timer counts as crossed.
  const half = gateHalfWidth(track);
  const s = track.samples[index];
  const r = rightOf(s.heading);
  const red = new THREE.MeshLambertMaterial({ color: RED });
  const white = new THREE.MeshLambertMaterial({ color: WHITE });
  const stripeGeo = new THREE.BoxGeometry(0.45, 1, 0.45);
  const baleGeo = new THREE.BoxGeometry(1.5, 0.75, 0.85);
  const baleMat = new THREE.MeshLambertMaterial({ color: "#d9b45c" });
  const top = s.elevation + ARCH_TOP;
  for (const side of [-1, 1]) {
    // The leg runs from its own footing up to the arch, so the banner stays
    // level over the road however far the ground has fallen away under it.
    // The stripes divide that span rather than counting off a fixed five, or
    // a legged-down gate would stop short of its own banner.
    const lat = half * side;
    const px = s.x + r.x * lat;
    const pz = s.z + r.z * lat;
    const foot = footAt(s, lat, px, pz, ground);
    const span = Math.max(1, top - foot);
    const bands = Math.max(2, Math.round(span));
    const band = span / bands;
    for (let k = 0; k < bands; k++) {
      const seg = new THREE.Mesh(stripeGeo, k % 2 === 0 ? red : white);
      seg.position.set(px, foot + (k + 0.5) * band, pz);
      seg.scale.y = band;
      seg.rotation.y = s.heading;
      seg.name = k === 0 ? FOOTED : "post";
      group.add(seg);
    }
    // A short wall of bales each side: three along the road, one on top.
    for (let k = 0; k < 4; k++) {
      const along =
        track.samples[Math.max(0, Math.min(track.samples.length - 1, index + (k - 1) * 2))];
      const bale = new THREE.Mesh(baleGeo, baleMat);
      const lat = (half + 0.9) * side;
      const stacked = k === 3;
      const b = stacked ? track.samples[index] : along;
      const bx = b.x + rightOf(b.heading).x * lat;
      const bz = b.z + rightOf(b.heading).z * lat;
      bale.position.set(bx, footAt(b, lat, bx, bz, ground) + (stacked ? 1.12 : 0.38), bz);
      bale.rotation.y = b.heading + Math.PI / 2 + (k - 1.5) * 0.07;
      bale.name = stacked ? "bale" : FOOTED;
      group.add(bale);
    }
  }
}

/** ...and the artillery a FINISH gets: the guns standing back beside its
 * legs, and where each muzzle ended up. */
export function buildGateGuns(
  track: Track,
  index: number,
  group: THREE.Group,
  ground: GroundUnder | undefined,
): Muzzle[] {
  const muzzles: Muzzle[] = [];
  const half = gateHalfWidth(track);
  const at = track.samples[Math.max(0, index - Math.round(BEHIND / track.step))];
  const r = rightOf(at.heading);
  const barrelGeo = new THREE.CylinderGeometry(BARREL.bore, BARREL.bore * 0.85, BARREL.length, 8);
  const barrelMat = new THREE.MeshLambertMaterial({ color: "#2b3440" });
  const baseGeo = new THREE.BoxGeometry(0.5, 0.34, 0.5);
  const baseMat = new THREE.MeshLambertMaterial({ color: "#4d5663" });
  for (const side of [-1, 1] as const) {
    for (let k = 0; k < PER_SIDE; k++) {
      const aim = AIM[k];
      const out = half + STAND.out + k * 0.75;
      const lat = out * side;
      const x = at.x + r.x * lat;
      const z = at.z + r.z * lat;
      const foot = footAt(at, lat, x, z, ground);
      const base = new THREE.Mesh(baseGeo, baseMat);
      base.position.set(x, foot + 0.17, z);
      base.rotation.y = at.heading;
      base.name = FOOTED;
      group.add(base);

      // The barrel points up and IN across the road. Yaw is measured off
      // the road's heading and turned toward the middle, so both sides
      // throw their load over the car rather than out into the trees.
      const heading = at.heading - (Math.PI / 2) * side + aim.yaw * side;
      const dx = Math.sin(heading) * Math.cos(aim.pitch);
      const dz = Math.cos(heading) * Math.cos(aim.pitch);
      const dy = Math.sin(aim.pitch);
      const barrel = new THREE.Mesh(barrelGeo, barrelMat);
      // A cylinder stands up the Y axis; point it down the aim vector.
      barrel.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        new THREE.Vector3(dx, dy, dz),
      );
      const midY = foot + STAND.height - (BARREL.length / 2) * dy;
      barrel.position.set(x - (dx * BARREL.length) / 2, midY, z - (dz * BARREL.length) / 2);
      group.add(barrel);
      muzzles.push({
        x: x + (dx * BARREL.length) / 2,
        y: midY + (dy * BARREL.length) / 2,
        z: z + (dz * BARREL.length) / 2,
        dx,
        dy,
        dz,
      });
    }
  }
  return muzzles;
}
