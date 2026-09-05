// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The rear-view mirror: a second pass over the same scene, taken from the
// CAR looking back, drawn as a strip of glass at the top of the frame — or,
// from the driver's seat, put into the physical mirror hanging in the
// windscreen (car/cockpit.ts).
//
// It is bolted to the body, not to the camera. Whichever way the player is
// watching the run from — hood, chase, heli, straight down over the roof —
// the strip shows the same thing: the road behind the car, from the car.
// That is the whole point of it. A mirror that swung around with the
// camera would answer a different question every time the camera key was
// pressed, and none of them the one being asked.
//
// THE LENS STANDS ON THE MIRROR'S OWN GLASS, inside the cabin, looking back
// through the car: what it sees is the backlight in its frame of lining,
// the film the stage has thrown on that glass, and the road through
// whatever is left of it. A lens raised over the roof would show a cleaner
// road than the driver could, and the whole point of a dirty back window is
// that the mirror is where you find out about it.
//
// The image is FLIPPED left-for-right, because that is what a mirror does
// and what the player's hands expect: something coming up the inside on the
// left has to appear on the left of the glass. The flip is why the pass
// goes through a render target rather than straight into a scissored
// viewport — negating the projection's x would reverse every triangle's
// winding and turn the world inside out, so the scene is drawn upright into
// a texture and the texture is what gets reversed.
//
// HOW OFTEN the glass is refilled and HOW FAR it sees are not here: they are
// not properties of the mirror but of the machine drawing it, and they move
// while a stage is being driven. mirror-pace.ts owns both, and the renderer
// hands the answers in — the rate to `fill`'s caller, the reach to `aim`.

import * as THREE from "three";
import type { GameState } from "@engine";

import type { MirrorMount } from "./car-body.ts";

/** Width over height of the glass. Wide and shallow, like the real thing:
 * what a mirror is for is who is beside and behind, and the sky above them
 * is not information.
 *
 * Exported because the COCKPIT hangs a physical mirror in the top of its
 * windscreen and shows this same image in it (car/cockpit.ts): a pane built
 * at any other shape stretches the picture, and the mirror camera only ever
 * renders one.  */
export const MIRROR_ASPECT = 3.2;
const ASPECT = MIRROR_ASPECT;

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

/** Horizontal field of view through the glass, deg. Wider than a road car's
 * mirror on purpose: the useful question is whether anyone is close enough
 * to matter, and a true 35° would answer it only after they were already
 * alongside. Not so wide that the cabin takes the frame, either: from the
 * mirror the backlight subtends forty degrees or so, and the picture is
 * that window with a hand of lining round it, not a room with a window at
 * the back. */
const FOV_H = 52;

/** Where the lens stands on a car with no cockpit to hang a mirror in — a
 * ghost, a tool's bare body — m above the driver's own eye, and how far
 * below level it looks, rad. High enough to clear the roof, so it looks
 * over the car rather than into the back of its cabin. */
const RISE = 0.5;
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
  /** Aim it from the car for this frame. `mount` is where the glass hangs
   * in the car and what it is tilted at, car-local (the cockpit's own
   * mirror, or `fallbackMount` on a car without one). `far` is how far the
   * mirror is allowed to see — the forward view's fog distance times the
   * reach of the rung in force (mirror-pace.ts) — and the fog is pulled in
   * to the same fraction around the pass, so the world leaves this frustum
   * where the air had already gone solid rather than being cut off in
   * mid-view. */
  aim: (state: GameState, mount: MirrorMount, far: number) => void;
  /** Where the glass sits on a `w`×`h` canvas, CSS px from its top-left. */
  rect: (w: number, h: number) => MirrorRect;
  /** Render the road behind into the mirror's own target. Split from the
   * composite below because the picture has TWO homes now: the HUD's strip,
   * which is drawn over the finished frame, and the cockpit's physical
   * mirror, which is geometry inside the scene and therefore needs the
   * texture ready BEFORE the frame is drawn rather than after. */
  fill: (renderer: THREE.WebGLRenderer, scene: THREE.Scene, w: number, h: number) => void;
  /** Draw the strip over the frame already in the buffer. */
  composite: (renderer: THREE.WebGLRenderer, w: number, h: number) => void;
  /** The image itself, for the cockpit's pane to sample. Already reversed
   * left-for-right by the texture's own transform. */
  texture: THREE.Texture;
  dispose: () => void;
};

const UP = new THREE.Vector3(0, 1, 0);

/** Where the lens stands on a car with no mirror of its own: over the
 * driver's eye on the centreline, looking back and a touch down. */
export function fallbackMount(driverEyeY: number): MirrorMount {
  const y = driverEyeY + RISE;
  return { at: { x: 0, y, z: 0 }, look: { x: 0, y: y - Math.tan(AIM_DOWN) * 10, z: -10 } };
}

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

  // The mount rides the body the way the car's own meshes do (car-mesh.ts):
  // the springs' heave and the load pitch on the sprung chassis, then the
  // attitude of the ground under the wheels on the body, then the heading.
  // Position and aim take the whole of it — this is a piece of the car,
  // and a mirror that did not swing with the cabin around it would slide
  // about in its own housing.
  const chassisEuler = new THREE.Euler();
  const bodyEuler = new THREE.Euler();
  const yawQ = new THREE.Quaternion();
  const bodyQ = new THREE.Quaternion();
  const chassisQ = new THREE.Quaternion();
  const lookQ = new THREE.Quaternion();
  const at = new THREE.Vector3();
  const look = new THREE.Vector3();
  const lookM = new THREE.Matrix4();
  const origin = new THREE.Vector3();
  /** A car-local point carried into the world through the body's chain. */
  const carry = (
    state: GameState,
    p: { x: number; y: number; z: number },
    out: THREE.Vector3,
  ): void => {
    const car = state.car;
    out.set(p.x, p.y, p.z);
    out.applyEuler(chassisEuler.set(-car.pitchLoad, 0, 0));
    out.y += car.ride;
    out.applyEuler(bodyEuler.set(-car.pitch, 0, car.roll));
    out.applyAxisAngle(UP, car.heading);
    out.x += car.x;
    out.y += car.y;
    out.z += car.z;
  };

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

  const aim = (state: GameState, mount: MirrorMount, far: number): void => {
    const car = state.car;
    carry(state, mount.at, at);
    camera.position.copy(at);
    // The aim is the line from the glass to what it is tilted at, in the
    // car's own frame, worn under the body's rotation: the same chain the
    // position went through, as quaternions. A three.js camera looks down
    // its own -z, and `lookAt` on the local line hands back the turn that
    // points -z along it with the car's own up.
    look.set(mount.look.x - mount.at.x, mount.look.y - mount.at.y, mount.look.z - mount.at.z);
    lookM.lookAt(origin, look, UP);
    lookQ.setFromRotationMatrix(lookM);
    yawQ.setFromAxisAngle(UP, car.heading);
    bodyQ.setFromEuler(bodyEuler.set(-car.pitch, 0, car.roll));
    chassisQ.setFromEuler(chassisEuler.set(-car.pitchLoad, 0, 0));
    camera.quaternion.copy(yawQ).multiply(bodyQ).multiply(chassisQ).multiply(lookQ);

    camera.far = far;
    camera.updateProjectionMatrix();
  };

  const fill = (renderer: THREE.WebGLRenderer, scene: THREE.Scene, w: number, h: number): void => {
    const box = rect(w, h);
    const ratio = renderer.getPixelRatio();
    const px = Math.min(MAX_WIDTH, Math.max(2, Math.round(Math.max(box.width, 8) * ratio)));
    const py = Math.max(2, Math.round(px / ASPECT));
    if (target.width !== px || target.height !== py) target.setSize(px, py);
    if (camera.aspect !== ASPECT) {
      camera.aspect = ASPECT;
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
  };

  const composite = (renderer: THREE.WebGLRenderer, w: number, h: number): void => {
    const box = rect(w, h);
    if (box.width < 2 || box.height < 2) return;
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

  return { camera, aim, rect, fill, composite, texture: glassMap, dispose };
}
