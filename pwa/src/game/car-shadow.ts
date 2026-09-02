// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE SHADOW A CAR THROWS ON THE GROUND.
//
// A real one. The stage is lit by one directional light, and this module
// hangs a shadow map off it. Two things are decided here and nowhere else,
// and the whole cost of the thing rides on them:
//
//   WHO CASTS      the cars, and nothing but the cars (car-body.ts flags
//                  the shell, the glass and the wheels). Fifteen bodies
//                  drawn once more into a depth map is a pass the GPU
//                  barely notices; a forest drawn into one is not.
//   WHO RECEIVES   the ground — the terrain, the road, the water. Only a
//                  material that receives pays the shadow lookup, so the
//                  trees, the crowd and the buildings never see the map.
//
// That split is also what makes the map CLEAN. The one thing a shadow map
// classically gets wrong — acne, the receiver shadowing itself where its own
// depth and the map's disagree by a rounding error — needs the receiver to
// be IN the map, and the ground never is. So there is no bias to tune and
// nothing to peter-pan: a car on the ground throws a shadow that starts at
// its tyres, on any slope, over any crest, on a cambered road or a bridge
// deck, without anybody having to work out where the ground under it is.
//
// The other classic fault is SHIMMER: an orthographic shadow camera towed
// along behind the player samples the world on a texel grid that slides
// with it, so the same still car gets a different set of texels every frame
// and its edges crawl. The frame is snapped to whole texels in the light's
// own plane before it is placed, so the grid never moves by less than one
// cell — the standard fix, and the one that separates a shadow that is
// there from one that flickers.

import * as THREE from "three";

import type { VideoSettings } from "./settings.ts";

/** The side of the depth map, px, per effects level — and whether there is
 * one at all. A shadow is an effect the way dust is: information about the
 * car's weight and its height off the ground, worth a pass on any machine
 * that can afford one and the first thing to go on one that cannot. */
export const SHADOW_MAP_SIZE: Record<VideoSettings["effects"], number> = {
  off: 0,
  low: 1024,
  full: 2048,
};

/** How far the map reaches from its focus, m, in the light's own plane —
 * so on the ground it covers at least this far in every direction, and a
 * good deal further along a low sun's azimuth. Every car inside it throws
 * a shadow; a car outside throws none. Wide enough that the rivals a chase
 * camera can actually make out are all in, at a texel small enough on the
 * `full` map that the shadow's edge is read as an edge. */
export const SHADOW_REACH = 40;

/** How much of the light has to be a BEAM (sky.ts's `sunHardness`) before a
 * shadow is thrown at all. Under a storm's ceiling the key light is still
 * there — the stage would be black without it — but the light it stands in
 * for arrives from everywhere at once and throws nothing, so a directional
 * shadow under it is a lie. A thin sheet of rain cloud still clears the
 * bar, with the shadow faded to match. */
export const SHADOW_MIN_HARDNESS = 0.08;

/** How far up the sun's ray the light stands off its focus, m, and the
 * depth range the map covers from there. The ground is never in the map,
 * so the range only has to hold the cars — but at a low sun the map's
 * footprint runs hundreds of metres along the azimuth and the cars out
 * there can stand well above or below the focus, which is what the far
 * plane is paying for. */
const LIGHT_DISTANCE = 250;
const SHADOW_NEAR = 1;
const SHADOW_FAR = 900;

/** How far ahead of the focused car the map is centred, m, along the
 * camera's own forward. The player looks up the road, so that is where the
 * rivals worth a shadow are; a map centred dead on the car spends half its
 * reach on the stage behind. */
const FOCUS_AHEAD = 10;

/** The width of one texel of the map on the light's plane, m. */
export function shadowTexel(size: number): number {
  return (2 * SHADOW_REACH) / Math.max(1, size);
}

/** The two axes the map is laid out along, for a light coming FROM `dir`
 * (unit, pointing at the sun). The same basis three.js's `lookAt` builds
 * for the shadow camera — it has to be, because the point of having it is
 * to snap to that camera's texel grid and no other. */
export function lightFrame(dir: THREE.Vector3): { right: THREE.Vector3; up: THREE.Vector3 } {
  const z = dir.clone().normalize();
  const right = new THREE.Vector3(0, 1, 0).cross(z);
  if (right.lengthSq() < 1e-12) {
    // The sun straight overhead: `lookAt` nudges the axis off the pole by
    // this much, along z, rather than failing — so the frame stays defined,
    // and stays the camera's.
    z.z += 1e-4;
    z.normalize();
    right.set(0, 1, 0).cross(z);
  }
  right.normalize();
  const up = z.clone().cross(right).normalize();
  return { right, up };
}

/** `focus`, moved by less than a texel so that it lands on the map's own
 * grid. Written into `out` (which may be `focus` itself). The move is
 * entirely within the light's plane — nothing along the ray, because a step
 * along the light does not change which texels the ground falls into and
 * would only shift the depth range for nothing. */
export function snapToTexels(
  focus: THREE.Vector3,
  dir: THREE.Vector3,
  texel: number,
  out: THREE.Vector3 = new THREE.Vector3(),
): THREE.Vector3 {
  const { right, up } = lightFrame(dir);
  const r = focus.dot(right);
  const u = focus.dot(up);
  const dr = Math.round(r / texel) * texel - r;
  const du = Math.round(u / texel) * texel - u;
  return out.copy(focus).addScaledVector(right, dr).addScaledVector(up, du);
}

export type SunShadows = {
  /** Hand over the renderer the map is drawn with, and the effects level it
   * starts at. Once, when the renderer is made. */
  bind: (renderer: THREE.WebGLRenderer, effects: VideoSettings["effects"]) => void;
  /** The video options' effects level: which map, or none. */
  setQuality: (effects: VideoSettings["effects"]) => void;
  /** How much of the stage's light is a beam, 0..1 (sky.ts). Below
   * `SHADOW_MIN_HARDNESS` nothing is cast; above it the shadow is faded to
   * match, so a thin overcast throws a soft one. */
  setHardness: (hardness: number) => void;
  /** Put the map where this frame needs it: around `car`, biased up the
   * road the camera is looking along, and snapped to its own texels. Every
   * frame, after whatever else has moved the light — the frame is rebuilt
   * from the light's current direction, so a lightning strike that swings
   * the key light swings the shadows with it. */
  follow: (car: { x: number; y: number; z: number }, camera: THREE.Camera) => void;
  /** Whether anything is being cast right now. */
  active: () => boolean;
};

export function createSunShadows(light: THREE.DirectionalLight): SunShadows {
  const shadow = light.shadow;
  const cam = shadow.camera;
  cam.left = -SHADOW_REACH;
  cam.right = SHADOW_REACH;
  cam.top = SHADOW_REACH;
  cam.bottom = -SHADOW_REACH;
  cam.near = SHADOW_NEAR;
  cam.far = SHADOW_FAR;
  cam.updateProjectionMatrix();
  // No bias: nothing that reads the map is ever in it (see the module
  // note), and a bias would only lift every shadow off the tyres that
  // throw it.
  shadow.bias = 0;
  shadow.normalBias = 0;

  let renderer: THREE.WebGLRenderer | null = null;
  let size = 0;
  let hardness = 0;

  const dir = new THREE.Vector3();
  const fwd = new THREE.Vector3();
  const focus = new THREE.Vector3();

  const refresh = (): void => {
    light.castShadow = size > 0 && hardness >= SHADOW_MIN_HARDNESS;
    shadow.intensity = Math.min(1, Math.max(0, hardness));
    if (renderer) renderer.shadowMap.enabled = size > 0;
  };

  const setQuality = (effects: VideoSettings["effects"]): void => {
    const next = SHADOW_MAP_SIZE[effects];
    if (next !== size) {
      size = next;
      shadow.mapSize.set(Math.max(1, next), Math.max(1, next));
      // The target is allocated at the size the map had when it was first
      // drawn; dropping it is what makes the next draw allocate the new one.
      if (shadow.map) {
        shadow.map.dispose();
        shadow.map = null;
      }
    }
    refresh();
  };

  const bind = (next: THREE.WebGLRenderer, effects: VideoSettings["effects"]): void => {
    renderer = next;
    // Soft-filtered: the map is read with a small kernel, so the edge is a
    // short gradient rather than a staircase of texels — the penumbra a
    // body a third of a metre off the ground actually throws, near enough.
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // Drawn ONCE a frame, on the first pass that asks. The driving frame
    // renders the scene twice when the mirror is up, and the map is the
    // same picture for both — the mirror looks back down the same road.
    renderer.shadowMap.autoUpdate = false;
    setQuality(effects);
  };

  const setHardness = (next: number): void => {
    hardness = next;
    refresh();
  };

  const follow = (car: { x: number; y: number; z: number }, camera: THREE.Camera): void => {
    if (!light.castShadow) return;
    // Which way the light is coming from is whoever last placed it —
    // the sky's sun, or a strike for as long as it burns.
    dir.copy(light.position).sub(light.target.position).normalize();
    camera.getWorldDirection(fwd);
    fwd.y = 0;
    const along = fwd.length();
    focus.set(car.x, car.y, car.z);
    if (along > 1e-3) focus.addScaledVector(fwd, FOCUS_AHEAD / along);
    snapToTexels(focus, dir, shadowTexel(size), focus);
    light.target.position.copy(focus);
    light.position.copy(focus).addScaledVector(dir, LIGHT_DISTANCE);
    if (renderer) renderer.shadowMap.needsUpdate = true;
  };

  return {
    bind,
    setQuality,
    setHardness,
    follow,
    active: () => light.castShadow,
  };
}
