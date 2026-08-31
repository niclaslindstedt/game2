// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The way home: the arrow that sits under the co-driver's RETURN TO TRACK
// sign and points at the exact spot the reset would put the car back. Out in
// the wild there is no centerline in frame and no horizon to read — the
// stage's shape stops being navigable the moment the road is behind a hill —
// so the guidance has to be somewhere the player is already looking.
//
// It hangs off the CAMERA rather than the car: a slot just BELOW the sign,
// measured off the sign itself so the two never overlap in any orientation
// or with the mirror up, and sized as a fraction of the frame so a phone
// gets the same instrument a desktop does. It swings in the plane of the
// FRAME — up means the road is that way past the top of the screen, down
// means it is behind you — because an arrow that took the world bearing
// literally would aim straight into the lens and collapse to a blob at
// exactly the two bearings a lost player most needs to read. Presentation
// only: the engine decides where home IS (wayHome), this points at it.

import * as THREE from "three";
import { wayHome, type GameState } from "@engine";

/** How far in front of the camera the arrow rides, m. Only the ratios below
 * depend on it — near enough to sit in front of any terrain, far enough that
 * the perspective on it stays gentle. */
const DIST = 6;
/** Where it sits down the frame, 0 (top) .. 1 (bottom), when the sign is not
 * on screen to be measured against. */
const SLOT = 0.42;
/** Arrow length as a fraction of the frame's half-height — the frame, not
 * the world, so portrait and landscape read identically. Small: it is a
 * bearing, not an instruction, and the instruction is already on the sign
 * above it. An arrow big enough to be the subject of the frame covers the
 * ground the driver is trying to pick a way back across. */
const SIZE = 0.075;
/** How far the arrow reaches either side of its own centre, in the units it
 * is modelled in: the head's tip at 1.32, the shaft's tail at -0.95. */
const REACH = 1.3;
/** Clear air between the sign's bottom edge and the top of the arrow, as a
 * fraction of the frame height. Enough that the two read as one instrument
 * stacked, rather than as a sign with something growing out of it. */
const AIR = 0.03;
/** How far the tip leans INTO the screen, rad — enough that the head and
 * shaft read as a solid lying on the ground rather than a flat cut-out,
 * shallow enough that nothing is lost to foreshortening. */
const TILT = 0.4;
/** How fast the arrow appears and fades, 1/s — a wheel briefly clipping the
 * verge should not strobe it on and off. */
const FADE = 4;
/** How fast it swings to a new bearing, 1/s: a slide that spins the car must
 * not whip the arrow round with it. */
const SWING = 6;

export type WayHomeArrow = {
  /** Parent this to the camera — the slot is expressed in camera space. */
  group: THREE.Group;
  update: (state: GameState, camera: THREE.PerspectiveCamera, dt: number) => void;
  dispose: () => void;
};

/** Two flat-shaded pieces on the +z axis, so the whole arrow is aimed with
 * one heading rotation. Long and slim rather than short and fat: the length
 * is what survives foreshortening, and a head only just wider than the shaft
 * would read as a stick from behind. Six-sided head and a square shaft keep
 * it inside the world's low-poly vocabulary. */
export function createWayHomeArrow(canvas: HTMLCanvasElement): WayHomeArrow {
  const group = new THREE.Group();
  const material = new THREE.MeshBasicMaterial({
    // The same amber as the sign's warning triangle: one marker, two places.
    color: 0xffa726,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    // The slot is a place on the SCREEN — nothing in the world may occlude
    // it, least of all the hill it is pointing you off.
    depthTest: false,
  });

  // The shaft a shade darker than the head: unlit flat color has no
  // silhouette to give the two pieces apart, so the tone does it.
  const shaftMaterial = material.clone();
  shaftMaterial.color.set(0xe08a12);
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.95, 6), material);
  head.rotation.x = Math.PI / 2; // the cone's +y nose onto +z
  head.position.z = 0.85;
  const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 1.3), shaftMaterial);
  shaft.position.z = -0.3;
  group.add(head, shaft);
  group.renderOrder = 3;
  group.visible = false;

  const toHome = new THREE.Vector3();
  const camQuat = new THREE.Quaternion();
  let shown = 0;
  let bearing = 0;
  /** Where the arrow currently sits down the frame, and the sign it is
   * hanging off. Negative until the first measurement, which is what makes
   * the arrow ARRIVE in place: the HUD ticks at ~12 Hz, so the sign can be a
   * frame or two behind the fade, and a slot that starts at a guess and then
   * lerps would drop the arrow down the screen as it appears. */
  let slot = -1;
  let sign: Element | null = null;

  /** The frame position, 0 (top) .. 1 (bottom), of the arrow's centre when
   * it is hung under the co-driver's sign. The sign is DOM and the arrow is
   * in the scene, so there is no shared measurement to read — but they share
   * a box (the canvas and the HUD are the same inset-0 rectangle), and one
   * rect off each is cheaper than restating the CSS that places the sign in
   * every orientation and on both sides of the mirror toggle. */
  const slotUnderSign = (): number => {
    if (!sign?.isConnected) sign = document.querySelector(".hud-pace-home");
    const frame = canvas.getBoundingClientRect();
    if (!sign || frame.height <= 0) return SLOT;
    const below = (sign.getBoundingClientRect().bottom - frame.top) / frame.height;
    return Math.min(0.75, below + AIR + (SIZE * REACH) / 2);
  };

  const update = (state: GameState, camera: THREE.PerspectiveCamera, dt: number): void => {
    // The same test the co-driver's strip runs off — pointing away from a
    // road that is a long way behind, not merely off it. One rule, both
    // halves of the guidance: the engine's `trackLost`, kept on the state as
    // `lost`. (The TRACK button is not guidance; it stays offered for as
    // long as the car is off the road at all.)
    const want = state.lost && state.phase === "racing" ? 1 : 0;
    shown += (want - shown) * Math.min(1, FADE * dt);
    group.visible = shown > 0.01;
    if (!group.visible) {
      slot = -1;
      sign = null;
      return;
    }

    const car = state.car;
    const home = wayHome(state);
    // The bearing is worked out in CAMERA space, never in the engine's — the
    // rendered world mirrors the map view, so a heading difference would put
    // the arrow on the wrong side of the frame. Rotated into the camera's own
    // axes, +x is screen-right and -z is straight ahead, by construction.
    camera.getWorldQuaternion(camQuat);
    toHome.set(home.x - car.x, 0, home.z - car.z).applyQuaternion(camQuat.invert());
    const target = Math.atan2(toHome.x, -toHome.z);
    // Chase it the short way round, so crossing the ±π seam is a nudge
    // rather than a full spin.
    let delta = (target - bearing) % (Math.PI * 2);
    if (delta > Math.PI) delta -= Math.PI * 2;
    if (delta < -Math.PI) delta += Math.PI * 2;
    bearing += delta * Math.min(1, SWING * dt);

    // The slot, in camera space: the camera looks down its own -z, and the
    // frame's half-height at DIST follows from the vertical fov the camera
    // is currently on (portrait and landscape do not share one). The sign is
    // re-measured every frame it is up — it moves when the mirror is toggled
    // and when the device turns — but it only SNAPS into place once, on the
    // frame the arrow appears.
    const under = slotUnderSign();
    slot = slot < 0 ? under : slot + (under - slot) * Math.min(1, SWING * dt);
    const halfHeight = DIST * Math.tan((camera.fov * Math.PI) / 360);
    group.position.set(0, halfHeight * (1 - 2 * slot), -DIST);
    group.scale.setScalar(halfHeight * SIZE * (0.7 + 0.3 * shown));

    // Stand the arrow up in the frame (its +z onto screen-up, tipped into
    // the screen), then spin it about the view axis by the bearing: dead
    // ahead points up, behind points down, either side points that side.
    group.rotation.set(-Math.PI / 2 - TILT, 0, -bearing, "ZXY");
    material.opacity = 0.92 * shown;
    shaftMaterial.opacity = 0.92 * shown;
  };

  const dispose = (): void => {
    head.geometry.dispose();
    shaft.geometry.dispose();
    material.dispose();
    shaftMaterial.dispose();
  };

  return { group, update, dispose };
}
