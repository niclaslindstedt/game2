// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// RAIN — a pooled box of streaks that travels with the camera. Each drop is
// one line segment stretched along the velocity it is SEEN at, and the box
// wraps around the camera, so the sheet is endless without ever allocating.
//
// THE VELOCITY IS RELATIVE, and that is the whole effect. Rain hangs in the
// air the ground owns: it falls, it leans on the wind, and it does not
// travel with the car. So what a driver sees is the drop's own velocity
// MINUS the car's — which at rally pace is almost entirely the car's, and
// turns a vertical drizzle into near-horizontal tracer fire coming at the
// windscreen. A sheet that rides along with the camera reads as a car
// parked in a shower whatever the speedo says, and it is the single most
// common thing wrong with rain in a driving game.
//
// Drops are not all the same size, either. Big ones fall faster, streak
// longer and read brighter; small ones hang and blur. One random size per
// drop, baked at birth, is what gives the sheet depth instead of a moiré of
// identical dashes.

import * as THREE from "three";

const POOL = 1400;
/** Half-extent of the rain box around the camera, m. What matters is not
 * how many drops there are but how many the FRAME has in it, and a box that
 * reaches further than the drops can be told apart spends its pool out
 * where the fog has already taken them. */
const BOX = 20;
const TOP = 20;

/** Terminal fall speed, m/s, for the smallest drop in the sheet and the
 * largest. Real raindrops run about 4 m/s for drizzle up to 9 for a 5 mm
 * drop; these are well past that, because a game's rain is read for a
 * fraction of a second against a world going by at forty metres a second
 * and honest terminal velocity reads as snow. */
const FALL = { light: 15, heavy: 26 };

/** Seconds of travel drawn as the streak, for the smallest drop and the
 * largest. */
const STREAK = { light: 0.03, heavy: 0.055 };

/** …and how long a streak is ever allowed to get, m. Past this the sheet
 * stops being rain and becomes a wireframe tunnel around the car. */
const STREAK_MAX = 4.5;

/** How fast the camera is ever believed to be going, m/s. A respawn, a
 * camera cut or a dropped frame moves it a long way between two updates,
 * and without a ceiling the whole sheet is flung out of the box in one
 * frame and takes seconds to wrap back in. */
const CAMERA_MAX = 90;

/** How bright a drop is at the two ends of the size range, against
 * whatever tone the sheet has been given. */
const TONE = { light: 0.55, heavy: 1 };

export type Rain = {
  lines: THREE.LineSegments;
  /** drops/box density 0–1 (0 hides the whole system). */
  setIntensity: (intensity: number) => void;
  /** Light the sheet up for a lightning flash, 0..1. Rain is the nearest
   * thing to the camera there is, so a strike hits it before it hits
   * anything else in the frame. */
  setFlash: (surge: number) => void;
  /** What colour the drops read as. A drop is a lens, not a light: against
   * a bright overcast it is DARKER than the sky behind it, and only against
   * a dark one does it read pale. A sheet that is always pale grey
   * disappears on exactly the weather that has the most rain in it. */
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

export function createRain(): Rain {
  const positions = new Float32Array(POOL * 6);
  const colors = new Float32Array(POOL * 6);
  const drops = new Float32Array(POOL * 3);
  /** Each drop's size, 0 (fine) to 1 (fat) — fixed for its whole life, so
   * the sheet keeps a mix rather than shimmering between two looks. */
  const size = new Float32Array(POOL);
  const base = new THREE.Color(0xc8d8ea);
  const tone = new THREE.Color(1, 1, 1);
  for (let i = 0; i < POOL; i++) {
    drops[i * 3] = (Math.random() * 2 - 1) * BOX;
    drops[i * 3 + 1] = Math.random() * TOP * 2;
    drops[i * 3 + 2] = (Math.random() * 2 - 1) * BOX;
    size[i] = Math.random();
    const tone = TONE.light + (TONE.heavy - TONE.light) * size[i];
    for (let v = 0; v < 2; v++) {
      colors[i * 6 + v * 3] = base.r * tone;
      colors[i * 6 + v * 3 + 1] = base.g * tone;
      colors[i * 6 + v * 3 + 2] = base.b * tone;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.46,
    depthWrite: false,
  });
  const lines = new THREE.LineSegments(geo, mat);
  lines.frustumCulled = false;
  lines.visible = false;
  let active = 0;
  /** Where the camera was last update, for its own velocity. */
  let wasX = 0;
  let wasZ = 0;
  let seen = false;

  const setIntensity = (intensity: number): void => {
    active = Math.round(POOL * Math.max(0, Math.min(1, intensity)));
    lines.visible = active > 0;
  };

  let flash = 0;
  const paint = (): void => {
    mat.color.copy(tone).multiplyScalar(1 + 2.2 * flash);
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
    // What the camera itself is doing, held inside believable pace so a
    // teleport does not empty the box.
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

    // Drops live in camera-relative coordinates: the wind blows them, and
    // the camera's own travel comes back out of them.
    const vx = windX * 0.9 - camVX;
    const vz = windZ * 0.9 - camVZ;
    for (let i = 0; i < POOL; i++) {
      const fat = size[i];
      const fall = FALL.light + (FALL.heavy - FALL.light) * fat;
      let x = drops[i * 3];
      let y = drops[i * 3 + 1];
      let z = drops[i * 3 + 2];
      const visible = i < active;
      if (visible) {
        x += vx * dt;
        y -= fall * dt;
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
      // The streak is the drop's path over a slice of time, capped in
      // LENGTH rather than in time so a fast car gets long streaks and
      // never gets a cage of lines.
      let tail = STREAK.light + (STREAK.heavy - STREAK.light) * fat;
      const travel = Math.hypot(vx, fall, vz);
      if (travel * tail > STREAK_MAX) tail = STREAK_MAX / travel;
      const wx = camX + x;
      const wy = camY + y - 4;
      const wz = camZ + z;
      positions[i * 6] = wx;
      positions[i * 6 + 1] = visible ? wy : -80;
      positions[i * 6 + 2] = wz;
      positions[i * 6 + 3] = wx + vx * tail;
      positions[i * 6 + 4] = visible ? wy - fall * tail : -80;
      positions[i * 6 + 5] = wz + vz * tail;
    }
    geo.attributes.position.needsUpdate = true;
  };

  const dispose = (): void => {
    geo.dispose();
    mat.dispose();
  };

  return { lines, setIntensity, setFlash, setTone, update, dispose };
}
