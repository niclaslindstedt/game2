// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// SNOW FALLING — a pooled box of flakes that travels with the camera, the
// way the rain's box of streaks does (rain.ts), and for the same reason: the
// sheet is endless without ever allocating, and what a driver sees is the
// flake's own velocity MINUS the car's. A flake falls at a metre or two a
// second, which is nothing beside the car, so at rally pace the whole sky
// comes AT the windscreen in near-horizontal lines — a blizzard at 140 km/h
// is a hyperspace jump — and at a standstill it drifts, wanders, and lands.
//
// Where a drop is a streak, a flake is a DOT: too slow to stretch, and
// tumbling, so it wanders sideways on its way down (`FLUTTER`) and no two
// fall the same way. Big ones fall a little faster and read brighter; the
// small ones hang and are mostly what a blizzard is made of.
//
// Which of the two falls is the climate's call (climate.ts, `fallsAsSnow`,
// at the CAMERA's height): the environment cross-fades the rain's box and
// this one, so a stage that starts at the snowline rains in the valley.

import * as THREE from "three";

const POOL = 1200;
/** Half-extent of the box around the camera, m. Flakes are seen further
 * than drops are — they are white, and they hang — so the box reaches a
 * little further than the rain's. */
const BOX = 24;
const TOP = 18;

/** Fall speed, m/s, for the smallest flake and the largest. Real snow runs
 * one to two metres a second; a game's flake is read against a world
 * going by at forty, so it can afford to be honest here, and is. */
const FALL = { light: 0.9, heavy: 1.9 };

/** How far a flake wanders sideways on its way down, m, and how fast it
 * changes its mind, rad/s — a flake tumbles. */
const FLUTTER = { swing: 0.35, rate: 2.1 };

/** How big a flake is drawn, m, small to large. Bigger than a real flake
 * (a few millimetres) because a sprite under a pixel is not there. */
const SIZE = { light: 0.045, heavy: 0.11 };

/** How fast the camera is ever believed to be going, m/s (see rain.ts). */
const CAMERA_MAX = 90;

/** How bright a flake is at the two ends of the size range. */
const TONE = { light: 0.7, heavy: 1 };

export type Snowfall = {
  points: THREE.Points;
  /** Flakes per box, 0..1 (0 parks the whole system). */
  setIntensity: (intensity: number) => void;
  /** Light the flakes up for a lightning flash, 0..1. */
  setFlash: (surge: number) => void;
  /** What colour the flakes read as — white, in the sky's own light. */
  setTone: (tone: THREE.Color) => void;
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

/** A soft round sprite, drawn once: a flake is a blob, not a square. */
function flakeSprite(): THREE.Texture {
  const size = 32;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.45, "rgba(255,255,255,0.9)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createSnowfall(): Snowfall {
  const positions = new Float32Array(POOL * 3);
  const colors = new Float32Array(POOL * 3);
  const flakes = new Float32Array(POOL * 3);
  /** Each flake's size, 0 (fine) to 1 (fat), and the phase its flutter runs
   * on — both fixed for its life, so the sheet keeps a mix. */
  const size = new Float32Array(POOL);
  const phase = new Float32Array(POOL);
  const base = new THREE.Color(0xf4f8ff);
  const tone = new THREE.Color(1, 1, 1);
  for (let i = 0; i < POOL; i++) {
    flakes[i * 3] = (Math.random() * 2 - 1) * BOX;
    flakes[i * 3 + 1] = Math.random() * TOP * 2;
    flakes[i * 3 + 2] = (Math.random() * 2 - 1) * BOX;
    size[i] = Math.random();
    phase[i] = Math.random() * Math.PI * 2;
    const bright = TONE.light + (TONE.heavy - TONE.light) * size[i];
    colors[i * 3] = base.r * bright;
    colors[i * 3 + 1] = base.g * bright;
    colors[i * 3 + 2] = base.b * bright;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.PointsMaterial({
    vertexColors: true,
    map: flakeSprite(),
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    // One size for the pool, in metres of world, attenuated with distance:
    // the mix of sizes rides the per-flake brightness instead, because a
    // per-particle size on PointsMaterial is a shader graft this does not
    // need — near the lens a flake is a blob either way.
    size: (SIZE.light + SIZE.heavy) / 2,
    sizeAttenuation: true,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.visible = false;
  let active = 0;
  let wasX = 0;
  let wasZ = 0;
  let seen = false;
  let clock = 0;

  const setIntensity = (intensity: number): void => {
    active = Math.round(POOL * Math.max(0, Math.min(1, intensity)));
    points.visible = active > 0;
  };

  let flash = 0;
  const paint = (): void => {
    mat.color.copy(tone).multiplyScalar(1 + 1.6 * flash);
  };
  const setFlash = (surge: number): void => {
    flash = surge;
    paint();
  };
  const setTone = (next: THREE.Color): void => {
    tone.copy(next);
    paint();
  };

  const update = (
    camX: number,
    camY: number,
    camZ: number,
    windX: number,
    windZ: number,
    dt: number,
  ): void => {
    if (active === 0 || dt <= 0) {
      wasX = camX;
      wasZ = camZ;
      seen = true;
      return;
    }
    clock += dt;
    let camVX = seen ? (camX - wasX) / dt : 0;
    let camVZ = seen ? (camZ - wasZ) / dt : 0;
    const pace = Math.hypot(camVX, camVZ);
    if (pace > CAMERA_MAX) {
      camVX *= CAMERA_MAX / pace;
      camVZ *= CAMERA_MAX / pace;
    }
    wasX = camX;
    wasZ = camZ;
    seen = true;

    // A flake is carried by the wind almost entirely — it has nothing to
    // resist it with — and the camera's own travel comes back out of it.
    const vx = windX - camVX;
    const vz = windZ - camVZ;
    for (let i = 0; i < POOL; i++) {
      const fat = size[i];
      const fall = FALL.light + (FALL.heavy - FALL.light) * fat;
      let x = flakes[i * 3];
      let y = flakes[i * 3 + 1];
      let z = flakes[i * 3 + 2];
      const visible = i < active;
      if (visible) {
        const t = clock * FLUTTER.rate + phase[i];
        x += (vx + Math.sin(t) * FLUTTER.swing) * dt;
        y -= fall * dt;
        z += (vz + Math.cos(t * 0.77) * FLUTTER.swing) * dt;
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
      flakes[i * 3] = x;
      flakes[i * 3 + 1] = y;
      flakes[i * 3 + 2] = z;
      positions[i * 3] = camX + x;
      positions[i * 3 + 1] = visible ? camY + y - 4 : -80;
      positions[i * 3 + 2] = camZ + z;
    }
    geo.attributes.position.needsUpdate = true;
  };

  const dispose = (): void => {
    geo.dispose();
    mat.map?.dispose();
    mat.dispose();
  };

  return { points, setIntensity, setFlash, setTone, update, dispose };
}
