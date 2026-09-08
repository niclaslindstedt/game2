// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE AIR INSIDE A SANDSTORM — the two things a player actually sees of the
// front the engine is running (`engine/game/sandstorm.ts`).
//
// THE WALL is the one that matters, and it is the reason the storm is a
// thing that happens rather than a setting. A haboob announces itself: a
// brown line under the sky, standing a kilometre up, coming on at the speed
// of the outflow that threw it out. You get a minute of watching it arrive
// and deciding what to do about the next corner, and then it takes you.
// So the wall is drawn as a CURTAIN out at the fog's own far edge, upwind,
// rising and darkening across the approach — nothing but a big billboard
// with a soft noise-cut top edge, because at that distance a wall of dust
// is a silhouette and nothing else.
//
// THE GRAINS are what it is like inside: sand streaming past the glass.
// Built exactly like the rain (`rain.ts`) and for the same reason — the
// velocity a grain is SEEN at is its own minus the camera's, which at rally
// pace is almost all the camera's — but sand is not rain and does not fall.
// It is CARRIED: it goes where the wind goes, nearly level, and its own
// terminal fall is a metre or two a second under a wind doing thirty. That
// difference is the whole look. Rain comes at the screen; sand goes ACROSS
// it, and a driver in a crosswind can see which way the wind is blowing by
// watching it.
//
// Both are pooled, both wrap around the camera, and neither allocates after
// it is built.

import * as THREE from "three";

/** How many grains are in the box at full strength. Fewer than the rain's
 * pool, because the box is smaller and the fog inside a storm eats the far
 * half of it long before the count runs out. */
const POOL = 1100;

/** Half-extent of the grain box around the camera, m, and how high it
 * reaches. Lower and tighter than the rain's box — sand near the ground is
 * where the sand is, and a box that reaches up into clear air spends its
 * pool where nothing is lifted. */
const BOX = 22;
const TOP = 14;

/** A grain's own fall, m/s: what is left of gravity once the wind has hold
 * of it. Saltating sand hops rather than falls, and at the wind speeds a
 * front blows at the hop is very nearly horizontal. */
const FALL = { light: 0.6, heavy: 2.4 };

/** Seconds of travel drawn as the streak, and the cap on how long one may
 * get, m. Shorter than the rain's: a grain is small and near, and a long
 * streak reads as a scratch on the lens. */
const STREAK = { light: 0.012, heavy: 0.026 };
const STREAK_MAX = 2.2;

/** How fast the camera is ever believed to have moved between two updates,
 * m/s — a respawn or a camera cut would otherwise fling the whole box out
 * of range for seconds (`rain.ts` has the same guard, for the same jump). */
const CAMERA_MAX = 90;

/** THE WALL: how far out it stands at the moment it lands, m, how much
 * further out it starts the approach, and how big it is drawn.
 *
 * THE DISTANCE IS BOUNDED BY THE CAMERA, not by the weather. A haboob is
 * kilometres away when you first see it, but the driving camera's far
 * plane is 900 m (`DRIVING_FAR` in camera.ts) and anything past it is
 * clipped and simply never drawn — so the wall is stood well inside that
 * and drawn at the size that subtends the ANGLE the real thing would.
 * A real front stands up to 1,500 m tall; 400 m of curtain at 620 m out is
 * 33° up, which is most of the way up the screen and is what the eye
 * actually reads. It still comes ON across the approach — from `START`
 * times that distance in to the distance itself — which is what makes it
 * arrive rather than merely appear. */
const WALL_OUT = 620;
const WALL_START = 1.35;
const WALL_HEIGHT = 400;
const WALL_WIDE = 1900;

/** The two tones of the sand in the air: what the light does to the top of
 * a dust wall, and what is inside it. A haboob is lit copper along its
 * crown and near black in its body, and the gradient between them is what
 * gives a flat billboard its depth. */
const CROWN = new THREE.Color(0xd6a463);
const BODY = new THREE.Color(0x8a5a30);
const GRAIN = new THREE.Color(0xd9b284);

export type SandAir = {
  /** The grains streaming past, and the wall out on the horizon. Both go
   * in the scene; both are hidden when there is no storm. */
  grains: THREE.LineSegments;
  wall: THREE.Mesh;
  /** How much sand is in the air here, 0..1, and how close the wall is. */
  set: (sand: number, approach: number) => void;
  /** Move the box with the camera and blow the grains down the wind, and
   * stand the wall upwind of the camera at the storm's own distance. */
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

export function createSandAir(): SandAir {
  // ── The grains ────────────────────────────────────────────────────────
  // Two vertices per grain: where it is, and where it was a streak ago.
  // The head is what moves; the tail is written from the velocity the grain
  // is SEEN at, every frame.
  const head = new Float32Array(POOL * 3);
  const line = new Float32Array(POOL * 6);
  // Per-grain size roll, baked once: big grains hop faster and streak
  // longer, which is what stops the sheet reading as one moiré of dashes.
  const size = new Float32Array(POOL);
  for (let i = 0; i < POOL; i++) {
    head[i * 3] = (Math.random() * 2 - 1) * BOX;
    head[i * 3 + 1] = Math.random() * TOP;
    head[i * 3 + 2] = (Math.random() * 2 - 1) * BOX;
    size[i] = Math.random();
  }
  const grainGeo = new THREE.BufferGeometry();
  grainGeo.setAttribute("position", new THREE.BufferAttribute(line, 3));
  const grainMat = new THREE.LineBasicMaterial({
    color: GRAIN,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    fog: true,
  });
  const grains = new THREE.LineSegments(grainGeo, grainMat);
  grains.frustumCulled = false;
  grains.visible = false;
  grains.renderOrder = 6;

  // ── The wall ──────────────────────────────────────────────────────────
  // A plain quad with a vertical gradient painted into its vertex colours
  // and a soft, noisy top edge cut by the alpha — the cheapest thing that
  // reads as a kilometre of lifted dust, and the only honest one at this
  // distance. Its own material rather than the scene's fog, because the
  // wall IS the far distance: fogged, it would be the fog's colour and
  // invisible against it.
  const COLS = 24;
  const wallGeo = new THREE.PlaneGeometry(WALL_WIDE, WALL_HEIGHT, COLS, 6);
  const wallPos = wallGeo.getAttribute("position");
  const wallCol = new Float32Array(wallPos.count * 3);
  // One seeded ripple along the top, so the crown is a row of billows
  // rather than a ruled line. Baked into the geometry: the wall is far
  // enough away that it never has to animate.
  for (let i = 0; i < wallPos.count; i++) {
    const x = wallPos.getX(i);
    const y = wallPos.getY(i);
    const up = (y + WALL_HEIGHT / 2) / WALL_HEIGHT;
    if (up > 0.5) {
      const billow = Math.sin(x * 0.0068) * 0.5 + Math.sin(x * 0.019 + 1.7) * 0.3;
      wallPos.setY(i, y + billow * WALL_HEIGHT * 0.12);
    }
    const tone = BODY.clone().lerp(CROWN, up * up);
    wallCol[i * 3] = tone.r;
    wallCol[i * 3 + 1] = tone.g;
    wallCol[i * 3 + 2] = tone.b;
  }
  wallGeo.setAttribute("color", new THREE.BufferAttribute(wallCol, 3));
  wallGeo.computeVertexNormals();
  const wallMat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    fog: false,
    side: THREE.DoubleSide,
  });
  const wall = new THREE.Mesh(wallGeo, wallMat);
  wall.frustumCulled = false;
  wall.visible = false;
  wall.renderOrder = -1;

  let approachNow = 0;
  let lastX = 0;
  let lastY = 0;
  let lastZ = 0;
  let seeded = false;

  const set = (sand: number, approach: number): void => {
    approachNow = approach;
    // The grains fade in with the sand in the air. Held off the very
    // bottom of the range: a dozen grains in clear air is dirt on the
    // screen, not weather.
    grains.visible = sand > 0.04;
    grainMat.opacity = Math.min(0.85, sand * 1.1);
    // The wall stands through the whole APPROACH and then goes as the
    // front takes the camera: once you are inside it there is no wall to
    // see, only sand. That hand-over is the moment the storm arrives, and
    // it costs nothing to draw because both halves are already here.
    const face = Math.max(0, approach - sand * 1.6);
    wall.visible = face > 0.02;
    wallMat.opacity = Math.min(1, face * 1.25);
  };

  const update = (
    camX: number,
    camY: number,
    camZ: number,
    windX: number,
    windZ: number,
    dt: number,
  ): void => {
    if (!seeded) {
      lastX = camX;
      lastY = camY;
      lastZ = camZ;
      seeded = true;
    }
    // The wall stands UPWIND: the front is what is bringing the wind, so
    // the wind's own bearing is where it is coming from, and the player
    // reading the flags on the grid already knows which way to look.
    if (wall.visible) {
      const speed = Math.hypot(windX, windZ);
      const ux = speed > 0.01 ? -windX / speed : 0;
      const uz = speed > 0.01 ? -windZ / speed : 1;
      // It comes ON across the approach — far off at first, close enough
      // to fill the sky by the time it lands.
      const out = WALL_OUT * (WALL_START - (WALL_START - 1) * approachNow);
      wall.position.set(camX + ux * out, WALL_HEIGHT * 0.34, camZ + uz * out);
      wall.rotation.set(0, Math.atan2(ux, uz), 0);
    }
    if (!grains.visible) {
      lastX = camX;
      lastY = camY;
      lastZ = camZ;
      return;
    }
    const dx = Math.max(-CAMERA_MAX * dt, Math.min(CAMERA_MAX * dt, camX - lastX));
    const dy = Math.max(-CAMERA_MAX * dt, Math.min(CAMERA_MAX * dt, camY - lastY));
    const dz = Math.max(-CAMERA_MAX * dt, Math.min(CAMERA_MAX * dt, camZ - lastZ));
    lastX = camX;
    lastY = camY;
    lastZ = camZ;
    const arr = grainGeo.getAttribute("position") as THREE.BufferAttribute;
    const a = arr.array as Float32Array;
    // The velocity a grain is SEEN at: its own, minus the camera's. At
    // rally pace this is almost entirely the camera's, which is what turns
    // sand blowing gently across a plain into a sheet tearing past the
    // glass — and the one thing a sheet that rides along with the camera
    // can never show.
    const seenX = windX - dx / dt;
    const seenZ = windZ - dz / dt;
    for (let i = 0; i < POOL; i++) {
      const s = size[i];
      const fall = FALL.light + (FALL.heavy - FALL.light) * s;
      // Carried by the wind and dragged by the camera's own move, in the
      // box's local frame — the box is parented to nothing, so the camera's
      // motion is subtracted here.
      head[i * 3] += windX * dt - dx;
      head[i * 3 + 1] += -fall * dt - dy;
      head[i * 3 + 2] += windZ * dt - dz;
      // Wrap. A grain that has left one face comes back in the opposite
      // one, which is what makes a finite pool an endless sheet.
      let x = head[i * 3];
      let y = head[i * 3 + 1];
      let z = head[i * 3 + 2];
      if (x > BOX) x -= 2 * BOX;
      else if (x < -BOX) x += 2 * BOX;
      if (z > BOX) z -= 2 * BOX;
      else if (z < -BOX) z += 2 * BOX;
      if (y < -TOP * 0.35) y += TOP * 1.35;
      else if (y > TOP) y -= TOP * 1.35;
      head[i * 3] = x;
      head[i * 3 + 1] = y;
      head[i * 3 + 2] = z;
      const seenY = -fall - dy / dt;
      const seen = Math.hypot(seenX, seenY, seenZ);
      const streak = seen > 0.01 ? sandStreak(s, seen) / seen : 0;
      a[i * 6] = x;
      a[i * 6 + 1] = y;
      a[i * 6 + 2] = z;
      a[i * 6 + 3] = x - seenX * streak;
      a[i * 6 + 4] = y - seenY * streak;
      a[i * 6 + 5] = z - seenZ * streak;
    }
    arr.needsUpdate = true;
    grains.position.set(camX, camY, camZ);
  };

  return {
    grains,
    wall,
    set,
    update,
    dispose: () => {
      grainGeo.dispose();
      grainMat.dispose();
      wallGeo.dispose();
      wallMat.dispose();
    },
  };
}

/** The streak a grain of this size draws at the speed it is seen going, m.
 * The one number that decides whether the sheet reads as carried or as
 * falling. */
function sandStreak(size: number, relativeSpeed: number): number {
  const seconds = STREAK.light + (STREAK.heavy - STREAK.light) * size;
  return Math.min(STREAK_MAX, seconds * relativeSpeed);
}
