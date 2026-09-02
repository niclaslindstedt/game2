// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE FRAME THE CARS' SHADOW MAP IS DRAWN IN.
//
// The shadows themselves are a depth map the GPU draws (pwa/src/game/
// car-shadow.ts), and there is no GPU here. What CAN be held from Node is
// the arithmetic that decides whether the map flickers: the frame it is
// drawn in has to land on its own texel grid every time it moves, or a car
// standing still gets a different set of texels each frame and its edges
// crawl. That, the gate that keeps a storm from throwing a shadow, and the
// sizes the video options buy.

import * as THREE from "three";
import { describe, expect, it } from "vitest";

import {
  createSunShadows,
  lightFrame,
  SHADOW_MAP_SIZE,
  SHADOW_MIN_HARDNESS,
  SHADOW_REACH,
  shadowTexel,
  snapToTexels,
} from "../pwa/src/game/car-shadow.ts";

/** A sun at elevation `el` (rad) and azimuth `az`, as the direction the
 * light comes FROM. */
function sunAt(el: number, az: number): THREE.Vector3 {
  const c = Math.cos(el);
  return new THREE.Vector3(Math.sin(az) * c, Math.sin(el), Math.cos(az) * c);
}

const SUNS = [
  ["noon", sunAt(0.95, 0.9)],
  ["dusk", sunAt(0.09, 0.9)],
  ["nearly overhead", sunAt(1.5, 0)],
  ["low and turned", sunAt(0.3, -2.1)],
] as const;

describe("the light's own frame", () => {
  it.each(SUNS)("is orthonormal and perpendicular to the light under a %s sun", (_n, dir) => {
    const { right, up } = lightFrame(dir);
    expect(right.length()).toBeCloseTo(1, 9);
    expect(up.length()).toBeCloseTo(1, 9);
    expect(right.dot(up)).toBeCloseTo(0, 9);
    expect(right.dot(dir)).toBeCloseTo(0, 6);
    expect(up.dot(dir)).toBeCloseTo(0, 6);
  });

  it("matches the basis three.js builds for the shadow camera", () => {
    // The whole point of the frame is to snap to THAT camera's texel grid,
    // so its axes must be the camera's own — `lookAt` from the light's
    // position down onto its target, with the world's up. The sun dead
    // overhead included: `lookAt` has a way off that pole, and the frame
    // has to take the same one.
    const suns = [...SUNS.map(([, d]) => d), new THREE.Vector3(0, 1, 0)];
    for (const dir of suns) {
      const cam = new THREE.OrthographicCamera();
      cam.position.copy(dir).multiplyScalar(250);
      cam.lookAt(0, 0, 0);
      cam.updateMatrixWorld();
      const x = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0);
      const y = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
      const { right, up } = lightFrame(dir);
      expect(right.distanceTo(x)).toBeLessThan(1e-3);
      expect(up.distanceTo(y)).toBeLessThan(1e-3);
    }
  });
});

describe("snapping the map to its texels", () => {
  const texel = shadowTexel(SHADOW_MAP_SIZE.full);

  it("sizes a texel off the reach and the map", () => {
    expect(texel).toBeCloseTo((2 * SHADOW_REACH) / SHADOW_MAP_SIZE.full, 12);
    expect(shadowTexel(SHADOW_MAP_SIZE.low)).toBeCloseTo(texel * 2, 12);
    // No map is not a division by zero.
    expect(Number.isFinite(shadowTexel(SHADOW_MAP_SIZE.off))).toBe(true);
  });

  it.each(SUNS)("moves the focus by under a texel, only in the light's plane (%s)", (_n, dir) => {
    const focus = new THREE.Vector3(123.456, 7.89, -321.01);
    const snapped = snapToTexels(focus, dir, texel);
    const moved = snapped.clone().sub(focus);
    // Nothing along the light — the depth range does not shift.
    expect(moved.dot(dir)).toBeCloseTo(0, 6);
    // …and less than half a texel each way in the plane.
    const { right, up } = lightFrame(dir);
    expect(Math.abs(moved.dot(right))).toBeLessThanOrEqual(texel / 2 + 1e-9);
    expect(Math.abs(moved.dot(up))).toBeLessThanOrEqual(texel / 2 + 1e-9);
  });

  it("puts every focus inside one cell on the same point — the frame never crawls", () => {
    const dir = sunAt(0.6, 0.9);
    const base = new THREE.Vector3(40, 3, 90);
    const first = snapToTexels(base, dir, texel);
    // A car creeping forward by a few millimetres a frame, well inside a
    // texel: every one of those frames has to draw the same grid.
    const { right, up } = lightFrame(dir);
    for (let i = 1; i <= 8; i++) {
      const creep = base
        .clone()
        .addScaledVector(right, (i * texel) / 40)
        .addScaledVector(up, (i * texel) / 50);
      expect(snapToTexels(creep, dir, texel).distanceTo(first)).toBeLessThan(1e-9);
    }
    // …and a step of exactly one texel lands exactly one cell over.
    const next = snapToTexels(base.clone().addScaledVector(right, texel), dir, texel);
    expect(next.clone().sub(first).dot(right)).toBeCloseTo(texel, 9);
  });

  it("writes into the vector it is handed when asked to", () => {
    const focus = new THREE.Vector3(1, 2, 3);
    const out = snapToTexels(focus, sunAt(0.5, 1), texel, focus);
    expect(out).toBe(focus);
  });
});

describe("the shadows hung off the sun", () => {
  const rig = (): {
    light: THREE.DirectionalLight;
    shadows: ReturnType<typeof createSunShadows>;
  } => {
    const light = new THREE.DirectionalLight();
    const shadows = createSunShadows(light);
    shadows.setQuality("full");
    return { light, shadows };
  };

  it("cast only when the light is a beam", () => {
    const { light, shadows } = rig();
    shadows.setHardness(1);
    expect(light.castShadow).toBe(true);
    expect(shadows.active()).toBe(true);
    // A storm's ceiling: the key is still on, and throws nothing.
    shadows.setHardness(0);
    expect(light.castShadow).toBe(false);
    shadows.setHardness(SHADOW_MIN_HARDNESS / 2);
    expect(light.castShadow).toBe(false);
    // A thin sheet of cloud: a shadow, faded to match.
    shadows.setHardness(0.3);
    expect(light.castShadow).toBe(true);
    expect(light.shadow.intensity).toBeCloseTo(0.3, 9);
  });

  it("cast nothing at all with the effects off", () => {
    const { light, shadows } = rig();
    shadows.setHardness(1);
    shadows.setQuality("off");
    expect(light.castShadow).toBe(false);
    shadows.setQuality("low");
    expect(light.castShadow).toBe(true);
    expect(light.shadow.mapSize.x).toBe(SHADOW_MAP_SIZE.low);
  });

  it("frame the map around the car, ahead of it, on the grid, without turning the light", () => {
    const { light, shadows } = rig();
    shadows.setHardness(1);
    const dir = sunAt(0.7, 0.9);
    light.target.position.set(5, 0, 5);
    light.position.copy(light.target.position).addScaledVector(dir, 300);
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(100, 3, 194);
    camera.lookAt(100, 0, 210);
    camera.updateMatrixWorld();

    shadows.follow({ x: 100, y: 1, z: 200 }, camera);
    const focus = light.target.position;
    // Ahead of the car along the camera's look, and on the texel grid.
    expect(focus.z).toBeGreaterThan(200);
    expect(focus.z).toBeLessThan(215);
    expect(Math.abs(focus.x - 100)).toBeLessThan(shadowTexel(SHADOW_MAP_SIZE.full));
    const again = snapToTexels(focus, dir, shadowTexel(SHADOW_MAP_SIZE.full));
    expect(again.distanceTo(focus)).toBeLessThan(1e-9);
    // The light still comes from where the sky put it.
    const after = light.position.clone().sub(focus).normalize();
    expect(after.distanceTo(dir)).toBeLessThan(1e-6);
  });
});
