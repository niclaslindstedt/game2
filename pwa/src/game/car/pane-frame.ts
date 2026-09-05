// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// A PANE'S OWN METRIC FRAME — the one piece of arithmetic everything laid on
// a window needs before it can lay anything.
//
// A screen is a warped quad in car-local metres with two parameter axes that
// mean different things on different panels: the windscreen's v runs cowl →
// roof, the backlight's runs roof → deck, and a left flank's patch is the
// x-mirror of the right's and hands back its normal pointing INTO the cabin.
// Nothing that has to put a wiper arc or a raindrop on the glass can work in
// u and v, because both of those questions are asked in METRES about a
// bottom sill.
//
// So this is the change of basis, stated once: an origin at the middle of
// the pane's bottom edge, `right` across it, `up` along it, `normal` out of
// it, and how big the pane is in each. car/wipers.ts hangs its arms off it
// and car/screen-rain.ts beads its glass in it, and the two agree about
// where the pivot is because they are reading the same frame rather than two
// derivations of it.

import * as THREE from "three";

import { patchAt, patchNormal, rectU } from "./builder.ts";
import type { ScreenPane } from "./greenhouse.ts";
import type { V3 } from "./builder.ts";

/** A screen's own metric frame: an origin at the middle of its bottom edge,
 * `right` across it, `up` along it, `normal` out of it. Built from the patch
 * rather than assumed, because a windscreen is a warped quad and the
 * backlight's own v axis runs the other way. */
export type PaneFrame = {
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

export function paneFrame(pane: ScreenPane): PaneFrame {
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

  const left = vec(patchAt(patch, rectU(rect, 0, vBottom), vBottom));
  const right = vec(patchAt(patch, rectU(rect, 1, vBottom), vBottom)).sub(left);
  const width = right.length() || 1;
  right.divideScalar(width);
  // Orthogonalise against `up`, then point the frame the same way the panel
  // faces — a left-handed frame would sweep the blades behind the glass.
  right.addScaledVector(up, -right.dot(up)).normalize();
  // OUTWARD, always: the left flank's patch is an x-mirror, so its diagonals
  // hand back the normal pointing into the cabin (`patchNormal`). Taken as
  // it comes, every film and every blade on that side of the car is laid
  // inside the bodywork.
  const normal = vec(patchNormal(patch));
  if (pane.mirrored) normal.negate();
  if (new THREE.Vector3().crossVectors(right, up).dot(normal) < 0) right.negate();
  return { origin, right, up, normal, width, height };
}

/** Where a point on the pane sits in that frame: x across from the middle of
 * the sill, y up from it, both in metres. */
export function paneLocal(frame: PaneFrame, p: THREE.Vector3): { x: number; y: number } {
  const d = p.clone().sub(frame.origin);
  return { x: d.dot(frame.right), y: d.dot(frame.up) };
}
