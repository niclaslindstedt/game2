// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE GATES a stage begins and ends at — and the CANNONS at the finish.
//
// A rally gate is a scaffold arch over the road with a banner on it,
// candy-striped legs, and a wall of hay bales down each side. Both ends of
// the stage get one; only the finish gets artillery.
//
// The cannons are the payoff of a whole run, so what matters is that they go
// off where the car can SEE them. They are angled up and inward across the
// road, standing back beside the gate legs — the car crosses the line, keeps
// going (R25's run-out), and the confetti comes over the top of it from
// behind as the camera holds at the gate. A cannon aimed straight up, or
// placed past the line, fires into an empty frame.
//
// This module builds the objects and reports where their muzzles are; the
// renderer owns what comes out of them, because that is a particle system
// and particle systems live with the other particle systems.

import * as THREE from "three";
import { finishIndex, gateHalfWidth, type Track } from "@engine";

import { bannerTexture } from "./textures.ts";
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

/** The finish gate, plus the muzzles standing beside it. */
export type FinishGate = {
  group: THREE.Group;
  muzzles: Muzzle[];
};

/** How many cannons stand at a finish — two each side, angled differently
 * so a full-house salute crosses over the road rather than firing four
 * identical plumes. */
const PER_SIDE = 2;
/** Barrel length and bore, m. */
const BARREL = { length: 1.15, bore: 0.17 };
/** How far out past the road edge a cannon stands, and how high its muzzle
 * sits above the road. */
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

/** The furniture every gate wears: striped legs and a wall of bales. */
function gateFurniture(track: Track, index: number, group: THREE.Group): void {
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
  for (const side of [-1, 1]) {
    for (let k = 0; k < 5; k++) {
      const seg = new THREE.Mesh(stripeGeo, k % 2 === 0 ? red : white);
      seg.position.set(s.x + r.x * half * side, s.elevation + k + 0.5, s.z + r.z * half * side);
      seg.rotation.y = s.heading;
      group.add(seg);
    }
    // A short wall of bales each side: three along the road, one on top.
    for (let k = 0; k < 4; k++) {
      const along =
        track.samples[Math.max(0, Math.min(track.samples.length - 1, index + (k - 1) * 2))];
      const bale = new THREE.Mesh(baleGeo, baleMat);
      const lat = (half + 0.9) * side;
      const top = k === 3;
      const b = top ? track.samples[index] : along;
      bale.position.set(
        b.x + rightOf(b.heading).x * lat,
        b.elevation + (top ? 1.12 : 0.38),
        b.z + rightOf(b.heading).z * lat,
      );
      bale.rotation.y = b.heading + Math.PI / 2 + (k - 1.5) * 0.07;
      group.add(bale);
    }
  }
}

/** The banner across the top, reading back down the road at the car. */
function gateBanner(track: Track, index: number, label: string, group: THREE.Group): void {
  const s = track.samples[index];
  const white = new THREE.MeshLambertMaterial({ color: WHITE });
  const text = new THREE.MeshLambertMaterial({
    color: "#ffffff",
    map: bannerTexture(label),
  });
  // BoxGeometry face order is +x,-x,+y,-y,+z,-z; with rotation.y set to
  // the heading, -z is the face looking back down the road at the car.
  const banner = new THREE.Mesh(new THREE.BoxGeometry(gateHalfWidth(track) * 2, 1.3, 0.3), [
    white,
    white,
    white,
    white,
    white,
    text,
  ]);
  banner.position.set(s.x, s.elevation + 4.7, s.z);
  banner.rotation.y = s.heading;
  banner.name = label;
  group.add(banner);
}

/** A rally gate over the road at a sample, after the real thing. */
export function buildStartGate(track: Track, index: number): THREE.Group {
  const group = new THREE.Group();
  gateFurniture(track, index, group);
  gateBanner(track, index, "START", group);
  return group;
}

/** ...and the finish, which is the same gate with the guns beside it. The
 * label is the caller's because a circuit's finish is also its start (R22)
 * and says so on one banner. */
export function buildFinishGate(track: Track, label = "FINISH"): FinishGate {
  const group = new THREE.Group();
  const index = finishIndex(track);
  gateFurniture(track, index, group);
  gateBanner(track, index, label, group);

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
      const x = at.x + r.x * out * side;
      const z = at.z + r.z * out * side;
      const foot = at.elevation;
      const base = new THREE.Mesh(baseGeo, baseMat);
      base.position.set(x, foot + 0.17, z);
      base.rotation.y = at.heading;
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
  return { group, muzzles };
}
