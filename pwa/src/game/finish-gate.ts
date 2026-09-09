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
//
// What a gate stands ON THE GROUND — the legs, the bales, the guns — is
// `gate-furniture.ts`, which is DOM-free so the root suite can hold it down.
// What is left here is the BANNER, which is lettering painted on a canvas,
// and the two ways a gate is asked for.

import * as THREE from "three";
import { finishIndex, gateHalfWidth, type Track } from "@engine";

import {
  buildGateFurniture,
  buildGateGuns,
  type GroundUnder,
  type Muzzle,
} from "./gate-furniture.ts";
import { bannerTexture } from "./textures.ts";

export type { GroundUnder, Muzzle } from "./gate-furniture.ts";

const WHITE = "#f6f3ea";

/** The finish gate, plus the muzzles standing beside it. */
export type FinishGate = {
  group: THREE.Group;
  muzzles: Muzzle[];
};

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

/** A rally gate over the road at a sample, after the real thing. `ground` is
 * the drawn surface beside the road (`Terrain.standOn`) the furniture stands
 * on; without it the corridor's own cross-section is used, which is what a
 * gate turned on a bare ribbon has (`tools/item-catalog.ts`). */
export function buildStartGate(track: Track, index: number, ground?: GroundUnder): THREE.Group {
  const group = new THREE.Group();
  buildGateFurniture(track, index, group, ground);
  gateBanner(track, index, "START", group);
  return group;
}

/** ...and the finish, which is the same gate with the guns beside it. The
 * label is the caller's because a circuit's finish is also its start (R22)
 * and says so on one banner. */
export function buildFinishGate(track: Track, label = "FINISH", ground?: GroundUnder): FinishGate {
  const group = new THREE.Group();
  const index = finishIndex(track);
  buildGateFurniture(track, index, group, ground);
  gateBanner(track, index, label, group);
  return { group, muzzles: buildGateGuns(track, index, group, ground) };
}
