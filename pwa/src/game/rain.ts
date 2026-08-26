// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Rain: a pooled box of streaks that travels with the camera. Each drop is
// one short line segment stretched along its own velocity, so the whole
// sheet leans with the wind — a storm's rain arrives sideways. The box
// wraps around the camera; drops respawn at the top (or wherever they left
// the box), which makes the rain endless without ever allocating.

import * as THREE from "three";

const POOL = 520;
/** Half-extent of the rain box around the camera, m. */
const BOX = 26;
const TOP = 24;
const FALL = 21; // m/s straight down before wind lean

export type Rain = {
  lines: THREE.LineSegments;
  /** drops/box density 0–1 (0 hides the whole system). */
  setIntensity: (intensity: number) => void;
  update: (
    camX: number,
    camY: number,
    camZ: number,
    windX: number,
    windZ: number,
    dt: number,
  ) => void;
  dispose: () => void;
};

export function createRain(): Rain {
  const positions = new Float32Array(POOL * 6);
  const drops = new Float32Array(POOL * 3);
  for (let i = 0; i < POOL; i++) {
    drops[i * 3] = (Math.random() * 2 - 1) * BOX;
    drops[i * 3 + 1] = Math.random() * TOP * 2;
    drops[i * 3 + 2] = (Math.random() * 2 - 1) * BOX;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.LineBasicMaterial({
    color: 0xc8d8ea,
    transparent: true,
    opacity: 0.34,
    depthWrite: false,
  });
  const lines = new THREE.LineSegments(geo, mat);
  lines.frustumCulled = false;
  lines.visible = false;
  let active = 0;

  const setIntensity = (intensity: number): void => {
    active = Math.round(POOL * Math.max(0, Math.min(1, intensity)));
    lines.visible = active > 0;
  };

  const update = (
    camX: number,
    camY: number,
    camZ: number,
    windX: number,
    windZ: number,
    dt: number,
  ): void => {
    if (active === 0) return;
    // Drops live in camera-relative coordinates; the wind leans them.
    const vx = windX * 0.9;
    const vz = windZ * 0.9;
    const streak = 0.045; // seconds of travel drawn as the streak
    for (let i = 0; i < POOL; i++) {
      let x = drops[i * 3];
      let y = drops[i * 3 + 1];
      let z = drops[i * 3 + 2];
      if (i < active) {
        x += vx * dt;
        y -= FALL * dt;
        z += vz * dt;
        if (y < -6) {
          y += TOP * 2;
          x = (Math.random() * 2 - 1) * BOX;
          z = (Math.random() * 2 - 1) * BOX;
        }
        if (x < -BOX) x += BOX * 2;
        else if (x > BOX) x -= BOX * 2;
        if (z < -BOX) z += BOX * 2;
        else if (z > BOX) z -= BOX * 2;
      }
      drops[i * 3] = x;
      drops[i * 3 + 1] = y;
      drops[i * 3 + 2] = z;
      const visible = i < active;
      const wx = camX + x;
      const wy = camY + y - 4;
      const wz = camZ + z;
      positions[i * 6] = wx;
      positions[i * 6 + 1] = visible ? wy : -80;
      positions[i * 6 + 2] = wz;
      positions[i * 6 + 3] = wx + vx * streak;
      positions[i * 6 + 4] = visible ? wy - FALL * streak : -80;
      positions[i * 6 + 5] = wz + vz * streak;
    }
    geo.attributes.position.needsUpdate = true;
  };

  const dispose = (): void => {
    geo.dispose();
    mat.dispose();
  };

  return { lines, setIntensity, update, dispose };
}
