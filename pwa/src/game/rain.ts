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
//
// AND IT IS TWO SHELLS, NOT ONE BOX, because rain is read at three ranges
// and one uniform box only ever answers the nearest of them:
//
//   NEAR — a tight box around the lens, and most of the pool. This is the
//   rain the driver is DRIVING THROUGH: long bright streaks coming at the
//   glass, dense enough to be weather rather than a scatter of scratches.
//
//   FAR — the rest of the pool spread over a box three times the reach,
//   dimmer and thinner. Individually these are barely there; together they
//   are the hatching that carries the rain out of the near field and into
//   the distance, which is the difference between "it is raining on the
//   car" and "it is raining on the country".
//
//   BEYOND — nothing here at all: it is the FOG, shortened live with the
//   squall (`precipReach`, weather.ts). Past thirty-odd metres a real drop
//   is smaller than a pixel and what a downpour actually does to the view
//   is take it away, so the distance is bought with the one thing that
//   already reaches to the horizon rather than with more geometry.
//
// A drop's own shell is fixed for its life and it wraps inside it, so the
// two densities hold however far the car travels — and each drop fades out
// over the last quarter of its own reach, so the sheet dissolves into that
// fog instead of ending on a wall.
//
// AND THE DROPS ARE LIT. A raindrop is a lens: most of a beam that finds
// one goes onward, but enough comes back that a headlamp at night hangs a
// cone of bright streaks a few metres off the bumper — the nearest thing
// in the frame, moving fastest, and the strongest cue there is that the
// air is full of water. The lamps come off the register the dust clouds
// and the snow are already lit from (dust-light.ts), at rain's own gain:
// well under snow's, because a drop returns a fraction of what a flake
// does, and a sheet of clipped white streaks is a cage rather than rain.

import * as THREE from "three";

import { DUST_LAMP_GLSL, DUST_LAMP_UNIFORMS, dustLampSum } from "./dust-light.ts";

const POOL = 2400;
/** Half-extent of the two shells around the camera, m — see the header.
 * The near one is deliberately tighter than the single box it replaces:
 * what matters is not how many drops there are but how many the FRAME has
 * in it, and the same pool in a smaller box is a heavier shower for the
 * same bill. */
const BOX = { near: 12, far: 38 };
/** How much of the pool lives in the near shell. The far one is worth
 * fewer drops than its volume asks for: it is read as hatching over a
 * fogged distance, not as individual streaks. */
const NEAR_SHARE = 0.6;
/** How far the box reaches under the camera and over it, m. Under is short
 * — the ground is a metre or two down and everything below it is occluded
 * — and over is where the pool would be wasted, since a drop twenty metres
 * up is a streak on the sky nobody reads. */
const UNDER = 6;
const OVER = 26;
/** …so this is the vertical span a drop wraps through, m. */
const TALL = UNDER + OVER;

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

/** …and what the FAR shell keeps of that. A drop thirty metres out has
 * thirty metres of rain-thickened air in front of it, and it is drawn
 * against fog rather than against the road: at the near shell's strength
 * the far one reads as a second, closer shower hanging in the middle
 * distance instead of as the same one going away. */
const FAR_TONE = 0.62;

/** Where a drop starts fading out, as a share of its own shell's reach.
 * Without it a drop simply stops existing at the box wall — a ring of
 * streaks blinking in and out at a fixed radius, which the eye finds
 * instantly on a sheet this fast. */
const FADE_FROM = 0.72;

/** WHAT A HEADLAMP IS WORTH TO A DROP, against the same register's dust
 * gain — and against snow's 8 (snowfall.ts), which is the comparison that
 * matters. A flake is a white body that throws the beam straight back; a
 * drop is a lens that bends most of it onward and returns a glint. So the
 * lit cone in rain is a scatter of bright streaks with dark air between
 * them, where in snow it is a wall — and that difference IS what tells the
 * two apart through a windscreen at night. Driven past this the streaks
 * clip to flat white and the cone closes up into snow. */
const LAMP_GAIN = 4.5;

/** …and how much more OPAQUE a lit drop is than an unlit one, at the top
 * of the gain. The sheet is drawn at well under half alpha so an unlit
 * shower is hatching rather than a curtain; a drop actually in a beam has
 * to be able to reach past that, or the lamps light drops the frame is
 * still mostly seeing through. */
const LAMP_SOLID = 1.6;

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
  /** …and which shell it lives in, as the half-extent it wraps inside, m.
   * Per VERTEX rather than per drop, because the shader fades a drop out
   * against its own reach and a line's two ends are two vertices. */
  const reach = new Float32Array(POOL * 2);
  const base = new THREE.Color(0xc8d8ea);
  const tone = new THREE.Color(1, 1, 1);
  for (let i = 0; i < POOL; i++) {
    // Interleaved rather than split front-and-back: `setIntensity` submits
    // a PREFIX of the pool, so a shell parked at the end of it would be
    // the first thing light rain lost — and light rain over an open
    // country is exactly when the far hatching is doing the most work.
    const far = i % 10 >= Math.round(NEAR_SHARE * 10);
    const half = far ? BOX.far : BOX.near;
    drops[i * 3] = (Math.random() * 2 - 1) * half;
    drops[i * 3 + 1] = Math.random() * TALL;
    drops[i * 3 + 2] = (Math.random() * 2 - 1) * half;
    size[i] = Math.random();
    const bright = (TONE.light + (TONE.heavy - TONE.light) * size[i]) * (far ? FAR_TONE : 1);
    for (let v = 0; v < 2; v++) {
      reach[i * 2 + v] = half;
      colors[i * 6 + v * 3] = base.r * bright;
      colors[i * 6 + v * 3 + 1] = base.g * bright;
      colors[i * 6 + v * 3 + 2] = base.b * bright;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geo.setAttribute("aReach", new THREE.BufferAttribute(reach, 1));
  const mat = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.46,
    depthWrite: false,
  });
  graftDrops(mat);
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
    // The tail of the pool is simply not submitted — the drops past
    // `active` are parked out of the frustum below, but a line nobody
    // draws is also a line nobody transforms.
    geo.setDrawRange(0, active * 2);
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
    const travel = Math.hypot(vx, vz);
    for (let i = 0; i < active; i++) {
      const fat = size[i];
      const fall = FALL.light + (FALL.heavy - FALL.light) * fat;
      const half = reach[i * 2];
      let x = drops[i * 3] + vx * dt;
      let y = drops[i * 3 + 1] - fall * dt;
      let z = drops[i * 3 + 2] + vz * dt;
      if (y < 0) {
        y += TALL;
        x = (Math.random() * 2 - 1) * half;
        z = (Math.random() * 2 - 1) * half;
      }
      if (x < -half) x += half * 2;
      else if (x > half) x -= half * 2;
      if (z < -half) z += half * 2;
      else if (z > half) z -= half * 2;
      drops[i * 3] = x;
      drops[i * 3 + 1] = y;
      drops[i * 3 + 2] = z;
      // The streak is the drop's path over a slice of time, capped in
      // LENGTH rather than in time so a fast car gets long streaks and
      // never gets a cage of lines.
      let tail = STREAK.light + (STREAK.heavy - STREAK.light) * fat;
      const pathed = Math.hypot(travel, fall);
      if (pathed * tail > STREAK_MAX) tail = STREAK_MAX / pathed;
      const wx = camX + x;
      const wy = camY + y - UNDER;
      const wz = camZ + z;
      positions[i * 6] = wx;
      positions[i * 6 + 1] = wy;
      positions[i * 6 + 2] = wz;
      positions[i * 6 + 3] = wx + vx * tail;
      positions[i * 6 + 4] = wy - fall * tail;
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

/**
 * THE DROP SHADER, grafted onto three's own line material so the fog, the
 * tint and the clipping planes keep working exactly as they do for
 * everything else in the scene.
 *
 * Two things the stock material cannot say:
 *
 *   THE FADE at the rim of a drop's own shell, so the near sheet hands
 *   over to the far one and the far one hands over to the fog, instead of
 *   either ending on a ring of blinking streaks at a fixed radius.
 *
 *   THE LAMPS, summed off the register the dust clouds and the snow share
 *   (dust-light.ts) at rain's own gain — and added AFTER the material's
 *   own tint rather than into the vertex colour, because the tint is what
 *   makes a daylight drop darker than the sky behind it (`rainTone`,
 *   sky.ts) and a headlamp is not dimmed by the sky being bright.
 *
 * Both are cheap enough not to need a stop on the DETAIL row: the sheet is
 * a few thousand vertices of untextured line, so the register loop is
 * paid on a fraction of the vertices the snow pays it on and the fill is
 * a hairline where snow's is a sprite.
 */
function graftDrops(mat: THREE.LineBasicMaterial): void {
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, DUST_LAMP_UNIFORMS);
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
        ${DUST_LAMP_GLSL}
        attribute float aReach;
        varying vec3 vRainLamp;
        varying float vRainFade;`,
      )
      .replace(
        "#include <fog_vertex>",
        `#include <fog_vertex>
        vec3 dropAt = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;
        // Horizontal only: a drop directly overhead is inside the sheet
        // however high the box reaches, and fading by the full distance
        // would thin the rain out of the top of the frame.
        float outFrom = length( dropAt.xz - cameraPosition.xz );
        vRainFade = 1.0 - smoothstep( aReach * ${FADE_FROM.toFixed(2)}, aReach, outFrom );${dustLampSum(
          "dropAt",
          "vRainLamp",
          LAMP_GAIN,
        )}`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        varying vec3 vRainLamp;
        varying float vRainFade;`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        diffuseColor.rgb += vRainLamp;
        // A drop the beam has found is a brighter drop AND a more solid
        // one: the sheet's own alpha is set for hatching, and a lit
        // streak the frame still sees through is a lit streak nobody
        // notices.
        diffuseColor.a *= vRainFade * ( 1.0 + ${LAMP_SOLID.toFixed(
          2,
        )} * min( 1.0, dot( vRainLamp, vec3( 0.33 ) ) ) );`,
      );
  };
  // Its own key: three caches line programs by parameters that cannot tell
  // a grafted material from a plain one.
  mat.customProgramCacheKey = () => "rainfall-lit";
}
