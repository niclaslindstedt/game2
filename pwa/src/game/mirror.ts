// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The rear-view mirror: a second pass over the same scene, taken from the
// CAR looking back, drawn as a strip of glass at the top of the frame.
//
// It is bolted to the body, not to the camera. Whichever way the player is
// watching the run from — hood, chase, heli, straight down over the roof —
// the strip shows the same thing: the road behind the car, from the car.
// That is the whole point of it. A mirror that swung around with the
// camera would answer a different question every time the camera key was
// pressed, and none of them the one being asked.
//
// The image is FLIPPED left-for-right, because that is what a mirror does
// and what the player's hands expect: something coming up the inside on the
// left has to appear on the left of the glass. The flip is why the pass
// goes through a render target rather than straight into a scissored
// viewport — negating the projection's x would reverse every triangle's
// winding and turn the world inside out, so the scene is drawn upright into
// a texture and the texture is what gets reversed.

import * as THREE from "three";
import type { GameState } from "@engine";

/** Width over height of the glass. Wide and shallow, like the real thing:
 * what a mirror is for is who is beside and behind, and the sky above them
 * is not information. */
const ASPECT = 3.2;

/** How wide the glass is, as a fraction of the canvas — one number for a
 * landscape frame and one for a portrait one. They are not the same number
 * because the two frames have different room: landscape has a clear span
 * between the clock and the minimap, portrait has almost none, so the
 * portrait strip goes wider and drops below that row instead.
 *
 * PARITY with `.hud` in pwa/src/styles.css, which restates these to hang the
 * co-driver's calls under the glass rather than across it. */
const WIDTH_WIDE = 0.21;
const WIDTH_TALL = 0.52;

/** How far down from the top edge the glass hangs, as a fraction of canvas
 * height. Landscape tucks under the top edge; portrait clears the clock and
 * the minimap that already own that corner. */
const TOP_WIDE = 0.022;
const TOP_TALL = 0.135;

/** How far the mirror sees, as a fraction of what the forward view is given.
 * A mirror answers one question — is anyone close enough to matter — and a
 * rival four hundred metres back is not an answer anybody acts on. Drawing
 * the whole stage a second time is what the second pass would otherwise
 * cost, and this is the number that stops it: the world leaves the mirror's
 * frustum at the range the fog is pulled in to (environment.withHaze), so
 * nothing is cut off in mid-view — it goes the way distance goes. */
export const MIRROR_RANGE = 0.45;

/** Horizontal field of view through the glass, deg. Wider than a road car's
 * mirror on purpose: the useful question is whether anyone is close enough
 * to matter, and a true 35° would answer it only after they were already
 * alongside. */
const FOV_H = 62;

/** Where the eye sits, m above the driver's own — high enough to clear the
 * roof of every body in the roster, so the mirror looks over the car rather
 * than into the back of its own cabin. The tail deck stays in shot at the
 * bottom of the glass, which is what tells the player whose mirror it is. */
const RISE = 0.5;

/** How much of the body's attitude the aim takes, 0–1, and how far below
 * level it points, rad. A mirror bolted to a car does move with it — a
 * rigid horizon in a shaking frame reads as a video playing on the
 * windscreen — but it is also an INSTRUMENT, and one that swung the full
 * travel of a landing would be unreadable exactly when it matters. The
 * down-aim is small on purpose: a rally stage is cut through hills, so the
 * ground behind already takes most of a level frame, and spending any real
 * angle on it leaves a strip of nothing but the dirt ten metres back. */
const PITCH_FOLLOW = 0.55;
const ROLL_FOLLOW = 0.35;
const AIM_DOWN = 0.02;

/** The frame around the glass, CSS px, and its colour. Dark and thin: it is
 * there to separate the mirror from the sky behind it, and a heavy chrome
 * bezel would be the biggest thing on the screen. */
const BEZEL = 3;
const BEZEL_COLOR = 0x161a20;

/** Ceiling on the target's width, device px. The glass is drawn at the
 * screen's own resolution below it — anything softer turns the one car that
 * matters into a smudge — and the cap is what stops a 3× phone from paying
 * for a strip wider than the road it is showing. */
const MAX_WIDTH = 1024;

export type MirrorRect = { x: number; y: number; width: number; height: number };

export type RearMirror = {
  /** The camera the mirror pass draws with — handed to the world's cull so
   * the scenery behind the car is still in the pool when it is asked for. */
  camera: THREE.PerspectiveCamera;
  /** Aim it from the car for this frame. `far` is the fog's far distance:
   * the mirror sees exactly as far as the forward view does, so nothing
   * cuts off in one and fades in the other. */
  aim: (state: GameState, driverEyeY: number, far: number) => void;
  /** Where the glass sits on a `w`×`h` canvas, CSS px from its top-left. */
  rect: (w: number, h: number) => MirrorRect;
  /** Draw the mirror over the frame already in the buffer. */
  draw: (renderer: THREE.WebGLRenderer, scene: THREE.Scene, w: number, h: number) => void;
  dispose: () => void;
};

const UP = new THREE.Vector3(0, 1, 0);
const RIGHT = new THREE.Vector3(1, 0, 0);
const NOSE = new THREE.Vector3(0, 0, 1);

export function createMirror(): RearMirror {
  const camera = new THREE.PerspectiveCamera(20, ASPECT, 0.3, 800);

  const target = new THREE.WebGLRenderTarget(2, 2);
  // The glass is what gets reversed. A negative repeat with the offset that
  // puts it back in range is the whole flip — the scene itself is drawn the
  // right way round, so every triangle keeps the winding it was built with.
  const glassMap = target.texture;
  glassMap.wrapS = THREE.RepeatWrapping;
  glassMap.repeat.x = -1;
  glassMap.offset.x = 1;

  // The strip is composited by an orthographic pass over the finished
  // frame: the bezel first, then the glass inset into it.
  const quadScene = new THREE.Scene();
  const quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const plane = new THREE.PlaneGeometry(2, 2);
  const bezelMaterial = new THREE.MeshBasicMaterial({
    color: BEZEL_COLOR,
    depthTest: false,
    depthWrite: false,
  });
  const glassMaterial = new THREE.MeshBasicMaterial({
    map: glassMap,
    depthTest: false,
    depthWrite: false,
  });
  const bezel = new THREE.Mesh(plane, bezelMaterial);
  const glass = new THREE.Mesh(plane, glassMaterial);
  bezel.renderOrder = 0;
  glass.renderOrder = 1;
  bezel.frustumCulled = false;
  glass.frustumCulled = false;
  quadScene.add(bezel, glass);

  const yawQ = new THREE.Quaternion();
  const rollQ = new THREE.Quaternion();
  const pitchQ = new THREE.Quaternion();

  const rect = (w: number, h: number): MirrorRect => {
    const width = Math.round(w * (w > h ? WIDTH_WIDE : WIDTH_TALL));
    const height = Math.round(width / ASPECT);
    return {
      x: Math.round((w - width) / 2),
      y: Math.round(h * (w > h ? TOP_WIDE : TOP_TALL)),
      width,
      height,
    };
  };

  const aim = (state: GameState, driverEyeY: number, far: number): void => {
    const car = state.car;
    // The mount rides the body the way the car's own meshes do: the load
    // pitch the brakes and the power put in, then the springs' heave, then
    // the attitude of the ground under the wheels. Only the height is
    // needed — the eye sits on the car's centreline, over its middle — so
    // the chain collapses to what that height does under each rotation.
    const local = driverEyeY + RISE;
    const ly = local * Math.cos(car.pitchLoad) + car.ride;
    const lz = -local * Math.sin(car.pitchLoad);
    const py = ly * Math.cos(car.pitch) + lz * Math.sin(car.pitch);
    const pz = lz * Math.cos(car.pitch) - ly * Math.sin(car.pitch);
    const bx = -py * Math.sin(car.roll);
    const by = py * Math.cos(car.roll);
    const ch = Math.cos(car.heading);
    const sh = Math.sin(car.heading);
    camera.position.set(car.x + bx * ch + pz * sh, car.y + by, car.z - bx * sh + pz * ch);

    // The car's local +z is its nose and a three.js camera looks down its
    // own -z, so a camera wearing the body's own rotation is already facing
    // backwards. The follow fractions and the down-aim are the only things
    // added to it. Rotation order matches car-mesh.ts: heading, then roll,
    // then a nose-up pitch as a NEGATIVE turn about +x.
    yawQ.setFromAxisAngle(UP, car.heading);
    rollQ.setFromAxisAngle(NOSE, car.roll * ROLL_FOLLOW);
    pitchQ.setFromAxisAngle(RIGHT, -(car.pitch + car.pitchLoad) * PITCH_FOLLOW - AIM_DOWN);
    camera.quaternion.copy(yawQ).multiply(rollQ).multiply(pitchQ);

    camera.far = far;
    camera.updateProjectionMatrix();
  };

  const draw = (renderer: THREE.WebGLRenderer, scene: THREE.Scene, w: number, h: number): void => {
    const box = rect(w, h);
    if (box.width < 2 || box.height < 2) return;

    const ratio = renderer.getPixelRatio();
    const px = Math.min(MAX_WIDTH, Math.max(2, Math.round(box.width * ratio)));
    const py = Math.max(2, Math.round(px / ASPECT));
    if (target.width !== px || target.height !== py) target.setSize(px, py);
    if (camera.aspect !== box.width / box.height) {
      camera.aspect = box.width / box.height;
      // three's fov is VERTICAL; the number worth holding steady across
      // viewports is how much road the glass shows to either side.
      camera.fov = (Math.atan(Math.tan((FOV_H * Math.PI) / 360) / camera.aspect) * 360) / Math.PI;
      camera.updateProjectionMatrix();
    }

    const previousTarget = renderer.getRenderTarget();
    renderer.setScissorTest(false);
    renderer.setRenderTarget(target);
    renderer.render(scene, camera);
    renderer.setRenderTarget(previousTarget);

    // WebGL's origin is the BOTTOM-left; the rect is measured from the top.
    const y = h - box.y - box.height;
    const inset = Math.min(BEZEL, Math.floor(box.height / 4));
    glass.scale.set(1 - (2 * inset) / box.width, 1 - (2 * inset) / box.height, 1);
    const autoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.setViewport(box.x, y, box.width, box.height);
    renderer.setScissor(box.x, y, box.width, box.height);
    renderer.setScissorTest(true);
    renderer.render(quadScene, quadCamera);
    renderer.setScissorTest(false);
    renderer.autoClear = autoClear;
    renderer.setViewport(0, 0, w, h);
  };

  const dispose = (): void => {
    target.dispose();
    plane.dispose();
    bezelMaterial.dispose();
    glassMaterial.dispose();
  };

  return { camera, aim, rect, draw, dispose };
}
