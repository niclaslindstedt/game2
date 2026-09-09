// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// SNOW FALLING — a pooled box of flakes that travels with the camera, the
// way the rain's box of streaks does (rain.ts), and for the same reason: the
// sheet is endless without ever allocating, and what a driver sees is the
// flake's own velocity MINUS the car's. A flake falls at a metre or two a
// second, which is nothing beside the car, so at rally pace the whole sky
// comes AT the windscreen in near-horizontal lines — a blizzard at 140 km/h
// is a hyperspace jump — and at a standstill it drifts, wanders, and lands.
//
// Where a drop is a streak, a flake is a CRYSTAL: too slow to stretch, and
// tumbling, so it wanders sideways on its way down (`FLUTTER`), turns as
// it goes, and no two fall the same way. Big ones fall a little faster and
// read brighter; the small ones hang and are mostly what a blizzard is
// made of.
//
// BOTH OF THOSE ARE THE TOP OF THE DETAIL ROW (`snow` in settings.ts), and
// they are one stop because they are one bill: a loop over the lamp
// register on every flake in the frame, and an atlas fetch and a bigger
// alpha-blended sprite on the near ones. Under it the sheet is what it has
// always been — a soft round dot in the sky's own light — and NEITHER
// shader is compiled at all rather than being multiplied by zero. The two
// programs are told apart by `customProgramCacheKey`, and moving between
// them is one recompile on a settings press.
//
// AND IT IS A CRYSTAL ONLY WHERE ONE CAN BE SEEN. Every flake carries a
// habit off `snowHabits` — a plate, a star, a dendrite, a rod — stamped
// from the atlas in snow-crystal.ts, turned on its own tumble. But a
// six-armed fern drawn across four pixels is not a snowflake, it is a
// smear of aliasing that shimmers as it falls, and a sheet of those reads
// as dirt on the lens. So the structure FADES IN with the sprite's size on
// screen (`CRYSTAL_AT`): near the glass a flake is the crystal it is, and
// everything further out is the soft dot it was always drawn as. The
// threshold is in PIXELS rather than metres, because what decides whether
// a shape can be read is how many pixels it lands on — which is why a
// bigger habit shows its structure further away than a small one, and why
// a sharper display shows more of both.
//
// Which of the two falls is the climate's call (climate.ts, `fallsAsSnow`,
// at the CAMERA's height): the environment cross-fades the rain's box and
// this one, so a stage that starts at the snowline rains in the valley.
//
// AND THE FLAKES ARE LIT. This is the whole reason snow at night is harder
// to drive through than rain at night, and it is not about the road: a
// drop is a lens that throws the beam onward, but a flake is a white BODY
// that scatters it straight back down the axis it came along. So a lit
// snowfall is a wall stood a few metres off the bumper — the light the
// driver needs on the road is spent on the air in front of it instead, and
// the harder the lamps are driven the whiter the wall gets. A driver's own
// answer is to dip, which this makes worth doing (`headShareAt` is a
// quarter on dipped) rather than merely legal.
//
// The lamps come off the register the dust clouds are already lit from
// (dust-light.ts): a car hangs one forward source and one back on it every
// frame, and `graftDust` is the cone-and-falloff that reads it. Nothing
// about a flake wants a second answer to "where are the lamps" — and the
// tail source is not a rounding error here either, because the flakes
// between the chase camera and the car are the nearest thing to the lens
// there is, and a red one is exactly what a rally car in snow tows.

import * as THREE from "three";
import { rollSnowHabit } from "@engine";

import { DUST_LAMP_GLSL, DUST_LAMP_UNIFORMS, dustLampSum } from "./dust-light.ts";
import { CRYSTAL_ATLAS, HABIT_SCALE, crystalAtlas } from "./snow-crystal.ts";

/** How many flakes the box holds. Several times the rain's pool (rain.ts),
 * because a drop and a flake are not read the same way: a drop is drawn as a streak metres long and a handful of them
 * are a downpour, where a flake is a dot and a handful of dots is a clear
 * night with something in the air. What the lamps make of this is the
 * reason it matters — a beam picks out the flakes IN it, so the wall in
 * front of the car is only ever as thick as the sheet is dense, and a
 * sparse sheet lights up as a scatter of sparks rather than as weather.
 *
 * How many of these the FRAME holds is not the pool but the pool against
 * the box's reach: the count inside a view frustum out to a shell's wall
 * works out proportional to `POOL * reach`, so shrinking the near box
 * concentrates the flakes and makes each one bigger WITHOUT putting one
 * more of them on screen. A denser blizzard is bought here and nowhere
 * else. */
const POOL = 6800;
/** Half-extent of the TWO SHELLS around the camera, m — the same near/far
 * split the rain is built on (rain.ts), and for the same reason, but the
 * three ranges snow is read at are further apart than rain's:
 *
 *   NEAR — most of the pool in a tight box, which is where a flake is
 *   drawn as the CRYSTAL it is (`CRYSTAL_AT`) and where the headlamps
 *   reach. This is the wall the driver is pushing through.
 *
 *   FAR — the rest spread over nearly three times the reach: fine flakes,
 *   dimmer, too small to hold a shape. Not weather on their own, and not
 *   meant to be — they are the SPECKS IN THE HAZE, the thing that says the
 *   white middle distance is moving.
 *
 *   BEYOND — the fog, closed right down by the snow itself
 *   (`precipReach`, weather.ts) and tinted to the flakes' own colour.
 *   Heavy snow is a WHITE-OUT: at some distance the individual flakes stop
 *   being flakes and become the air, and drawing sub-pixel sprites out
 *   there buys aliasing instead of weather.
 *
 * A flake keeps its shell for life and wraps inside it, so the near
 * density holds however far the car travels. */
const BOX = { near: 13, far: 36 };
/** How much of the pool lives in the near shell. Heavier toward the near
 * one than the rain's split: a flake is read as a body rather than as a
 * streak, so the near sheet has to be dense enough to hide the road
 * where the rain only has to hatch over it. */
const NEAR_SHARE = 0.7;
/** …and how far it reaches UNDER the camera and OVER it, m.
 *
 * Both are cut close, and the ceiling hardest, because the pool has to be
 * spent where the sheet is actually read. A flake thirty metres overhead
 * is a sub-pixel dot against the sky; a flake ten metres in front of the
 * bumper is the weather. And the two are in direct competition — the box
 * holds a fixed number of flakes however big it is, so every metre of
 * ceiling is density taken out of the air a headlamp can reach.
 *
 * `UNDER` is the one that cannot simply be shrunk to the camera's own
 * height: the camera stands about three metres over the road on the chase
 * rig and a good deal higher over a crest or mid-jump, and a sheet that
 * stops at the lens is a sheet with a hole under the car in exactly the
 * frames a jump is in. What lies below the ground is occluded and costs
 * only a discarded fragment. */
const UNDER = 7;
const OVER = 16;
/** …so this is the whole vertical span a flake wraps through, m. */
const TALL = UNDER + OVER;

/** Fall speed, m/s, for the smallest flake and the largest. Real snow runs
 * one to two metres a second; a game's flake is read against a world
 * going by at forty, so it can afford to be honest here, and is. */
const FALL = { light: 0.9, heavy: 1.9 };

/** How far a flake wanders sideways on its way down, m, and how fast it
 * changes its mind, rad/s — a flake tumbles. */
const FLUTTER = { swing: 0.35, rate: 2.1 };

/** How big a flake is drawn, m, small to large, BEFORE its habit's own
 * size (`HABIT_SCALE`) — so the real spread across the sheet is wider than
 * this pair, a fern against a plate being more than twice again.
 *
 * Far bigger than a real flake, which runs from a hair's width to about
 * 5 mm, and the exaggeration is deliberate and load-bearing: a sprite
 * under a pixel is not there at all, and the structure this sheet is drawn
 * with needs tens of pixels before it is a shape rather than a shimmer.
 * The ceiling below is what keeps that honest from the other end. */
const SIZE = { light: 0.09, heavy: 0.26 };

/** …and the slice of that range the FAR shell is cut from. Its flakes are
 * the fine ones: a big habit thirty metres out is a soft blob the size of
 * a near one, which reads as a second snowfall hanging in the middle
 * distance rather than as the same one going away. */
const FAR_SIZE = 0.4;

/** What the far shell keeps of a flake's brightness. There is a great deal
 * of snow-thickened air between it and the lens, and it is drawn against
 * the white-out rather than against the road. */
const FAR_TONE = 0.7;

/** Where a flake starts fading out, as a share of its own shell's reach —
 * so the near sheet hands over to the far one and the far one dissolves
 * into the fog, instead of either ending on a ring of flakes blinking in
 * and out at a fixed radius. */
const FADE_FROM = 0.7;

/** …and the biggest a flake may ever be drawn on screen, as a share of
 * half the frame's height. Without it the exaggeration above walks right
 * up to the lens: a flake at arm's length is metres across in world terms,
 * and one sprite swallowing a third of the windscreen is a bug however
 * pretty the crystal on it is. */
const SIZE_CAP = 0.085;

/** Where a flake's STRUCTURE fades in, as the sprite's size on screen in
 * device pixels: a soft dot at and under the first, the crystal itself at
 * and over the second. Judged by eye against the atlas — under about a
 * eight pixels a dendrite's arms are thinner than a pixel and alias into
 * a flicker, and by twenty the six arms are unmistakable.
 *
 * Where that lands is a HABIT's own business, which is the point of
 * measuring it in pixels rather than in metres: a fern is more than
 * twice a plate's size, so it holds its shape more than twice as far
 * out, and the crystals a driver gets to look at are the big ones. */
const CRYSTAL_AT = { dot: 8, full: 20 };

/** How fast a flake turns as it tumbles, rad/s, the slowest to the
 * fastest. A crystal is a plate falling through air: it rocks and turns
 * rather than spinning, and a sheet where every flake turns at one rate
 * reads as a rotating texture instead of as weather. */
const TUMBLE = { slow: 0.25, fast: 1.1 };

/** How fast the camera is ever believed to be going, m/s (see rain.ts). */
const CAMERA_MAX = 90;

/** How bright a flake is at the two ends of the size range. */
const TONE = { light: 0.7, heavy: 1 };

/** WHAT A HEADLAMP IS WORTH TO A FLAKE, against what the same lamp is worth
 * to a puff of dust (dust-light.ts drives the register at the strength a
 * gravel cloud wants). Snow is the brighter of the two substances by a
 * long way — fresh snow returns most of the light that lands on it, where
 * road dust returns a fraction — and a flake is a whole body in the beam
 * rather than a wisp of it, so it reads as a hard white spark instead of a
 * lit smudge.
 *
 * Bounded from both sides, and the ceiling is the one that bites. Under it
 * the sheet is grey dots in a lit beam, which is rain with the streaks
 * filed off; over it every flake inside the cone clips to flat white, and a
 * wall of clipped white is one shape rather than a thousand flakes — the
 * depth goes out of it and the sheet stops moving. This is the strength at
 * which the near flakes burn and the ones further down the beam still fall
 * away into the dark. */
const LAMP_GAIN = 8;

/** THE HAND-OVER, in one line both programs paste: a flake dissolves over
 * the outer stretch of its OWN shell's reach (`aReach`), so the near sheet
 * gives way to the far specks and the far specks give way to the white-out
 * without either ending on a ring of flakes blinking at a fixed radius.
 *
 * Horizontal only. A flake directly overhead is inside the sheet however
 * high the box reaches, and fading it by the full distance would thin the
 * snow out of the top of every frame. */
const RIM_FADE_GLSL = `vec3 flakeWorld = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;
        vRim = 1.0 - smoothstep(
          aReach * ${FADE_FROM.toFixed(2)},
          aReach,
          length( flakeWorld.xz - cameraPosition.xz )
        );`;

export type Snowfall = {
  points: THREE.Points;
  /** Flakes per box, 0..1 (0 parks the whole system). */
  setIntensity: (intensity: number) => void;
  /** Light the flakes up for a lightning flash, 0..1. */
  setFlash: (surge: number) => void;
  /** What colour the flakes read as — white, in the sky's own light.
   * `snowTone` is asked whether the flakes are LIT, because a sheet with no
   * lamps on it needs the old floor of sky light to be visible at all. */
  setTone: (tone: THREE.Color) => void;
  /** THE DETAIL ROW's `snow` stop: whether the flakes are lit by the car
   * lamps and drawn as crystals up close, or are plain dots. Recompiles the
   * sheet's shader, so it is called when the setting moves and not per
   * frame. */
  setCrystals: (on: boolean) => void;
  /** WHICH CRYSTALS ARE FALLING, from the air's own temperature at the
   * camera, °C (`snowHabits`, engine-side). Every flake that wraps back to
   * the top of the box is re-rolled against it, so a car climbing out of a
   * valley drives from one snow into another over a few seconds rather
   * than swapping the sheet on one frame. */
  setHabit: (temperature: number) => void;
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

export function createSnowfall(): Snowfall {
  const positions = new Float32Array(POOL * 3);
  const colors = new Float32Array(POOL * 3);
  const flakes = new Float32Array(POOL * 3);
  /** Each flake's size, 0 (fine) to 1 (fat), and the phase its flutter runs
   * on — both fixed for its life, so the sheet keeps a mix. */
  const size = new Float32Array(POOL);
  const phase = new Float32Array(POOL);
  /** …and the three the shader needs per flake: which crystal it is, how
   * big that makes it, and where its tumble has turned it to. The first
   * two are re-rolled together whenever a flake wraps, because a habit and
   * its size are one fact (`HABIT_SCALE`). */
  const cell = new Float32Array(POOL);
  const scale = new Float32Array(POOL);
  const spin = new Float32Array(POOL);
  const tumble = new Float32Array(POOL);
  /** Which shell a flake lives in, as the half-extent it wraps inside, m.
   * The shader reads it too — a flake fades against its OWN reach, not
   * against a shared one, which is what lets the two shells hand over. */
  const reach = new Float32Array(POOL);
  const base = new THREE.Color(0xf4f8ff);
  const tone = new THREE.Color(1, 1, 1);
  /** The air at the camera, °C — what `setHabit` is told and what every
   * re-roll is drawn against, and whether anybody has said yet. The pool
   * is cut once at construction against a placeholder, so the FIRST answer
   * has to re-cut the whole sheet: a flake takes the better part of a
   * minute to fall the length of the box, and a stage that opens on the
   * wrong crystals would still be showing them at the first split. Every
   * answer after that bleeds through as flakes wrap. */
  let temperature = -15;
  let told = false;

  /** Give flake `i` a crystal, and the size that crystal comes in. */
  const roll = (i: number): void => {
    const habit = rollSnowHabit(temperature, Math.random());
    cell[i] = habit;
    scale[i] = (SIZE.light + (SIZE.heavy - SIZE.light) * size[i]) * HABIT_SCALE[habit];
  };

  for (let i = 0; i < POOL; i++) {
    // Interleaved rather than split front-and-back: `setIntensity` submits
    // a PREFIX of the pool, so a shell parked at its end would be the
    // first thing light snow lost — and light snow is exactly when the far
    // specks are all there is to say it is snowing at all.
    const far = i % 10 >= Math.round(NEAR_SHARE * 10);
    const half = far ? BOX.far : BOX.near;
    reach[i] = half;
    flakes[i * 3] = (Math.random() * 2 - 1) * half;
    flakes[i * 3 + 1] = Math.random() * TALL;
    flakes[i * 3 + 2] = (Math.random() * 2 - 1) * half;
    size[i] = far ? Math.random() * FAR_SIZE : Math.random();
    phase[i] = Math.random() * Math.PI * 2;
    spin[i] = Math.random() * Math.PI * 2;
    // Signed, so half the sheet turns each way.
    tumble[i] =
      (TUMBLE.slow + (TUMBLE.fast - TUMBLE.slow) * Math.random()) * (Math.random() < 0.5 ? -1 : 1);
    roll(i);
    const bright = (TONE.light + (TONE.heavy - TONE.light) * size[i]) * (far ? FAR_TONE : 1);
    colors[i * 3] = base.r * bright;
    colors[i * 3 + 1] = base.g * bright;
    colors[i * 3 + 2] = base.b * bright;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geo.setAttribute("aCell", new THREE.BufferAttribute(cell, 1));
  geo.setAttribute("aScale", new THREE.BufferAttribute(scale, 1));
  geo.setAttribute("aSpin", new THREE.BufferAttribute(spin, 1));
  geo.setAttribute("aTumble", new THREE.BufferAttribute(tumble, 1));
  geo.setAttribute("aReach", new THREE.BufferAttribute(reach, 1));

  /** Built on the first frame the top stop is asked for, and never on a
   * machine that stays under it — half a megabyte of canvas nobody would
   * sample. */
  let atlas: THREE.Texture | null = null;
  let crystals = false;
  const mat = new THREE.PointsMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    // One metre, so a flake's real size is entirely `aScale` — the pool
    // carries a spread of sizes rather than one, and the habit is half of
    // what decides it.
    size: 1,
    sizeAttenuation: true,
  });

  /** The tumble's clock, shared with the shader: the turn is worked out
   * per flake in the vertex shader off one uniform rather than written
   * into a buffer every frame, which is a few thousand floats not
   * uploaded. */
  const clockUniform = { value: 0 };
  graftFlakes(mat, clockUniform, () => crystals);

  const setCrystals = (on: boolean): void => {
    if (on === crystals) return;
    crystals = on;
    if (on && !atlas) atlas = crystalAtlas();
    // The map is what defines USE_MAP, so it is half of what the two
    // programs differ by; the other half is the graft reading `crystals`
    // when three asks it to compile again.
    mat.map = on ? atlas : null;
    mat.needsUpdate = true;
  };

  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.visible = false;
  let active = 0;
  let wasX = 0;
  let wasZ = 0;
  let seen = false;
  let clock = 0;
  /** Whether any flake has been re-rolled since the last upload. */
  let recut = false;

  const setIntensity = (intensity: number): void => {
    active = Math.round(POOL * Math.max(0, Math.min(1, intensity)));
    points.visible = active > 0;
    // The pool is ordered — a flake is in the sheet exactly while its index
    // is under `active` — so the tail is simply not submitted. Worth the
    // line at this pool size: every point drawn pays the lamp loop in the
    // vertex shader and a blended sprite in the fragment one, and light
    // snow over a warm valley is most of the pool.
    geo.setDrawRange(0, active);
  };

  const setHabit = (air: number): void => {
    temperature = air;
    if (told) return;
    told = true;
    for (let i = 0; i < POOL; i++) roll(i);
    // Flagged here rather than through `recut`: three clears the flag when
    // it uploads, so this stands until the buffers actually go up even if
    // no frame is stepped in between.
    geo.attributes.aCell.needsUpdate = true;
    geo.attributes.aScale.needsUpdate = true;
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
    clockUniform.value = clock;
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
    // Only the sheet itself is walked: past `active` a flake is outside the
    // draw range, so moving it is arithmetic nobody looks at.
    for (let i = 0; i < active; i++) {
      const fat = size[i];
      const fall = FALL.light + (FALL.heavy - FALL.light) * fat;
      const half = reach[i];
      let x = flakes[i * 3];
      let y = flakes[i * 3 + 1];
      let z = flakes[i * 3 + 2];
      const t = clock * FLUTTER.rate + phase[i];
      x += (vx + Math.sin(t) * FLUTTER.swing) * dt;
      y -= fall * dt;
      z += (vz + Math.cos(t * 0.77) * FLUTTER.swing) * dt;
      if (y < 0) {
        y += TALL;
        x = (Math.random() * 2 - 1) * half;
        z = (Math.random() * 2 - 1) * half;
        // A flake that reaches the top of the box is a NEW flake, and the
        // air it grew in may have changed since the last one: this is the
        // only place the sheet's crystals turn over.
        roll(i);
        recut = true;
      }
      if (x < -half) x += half * 2;
      else if (x > half) x -= half * 2;
      if (z < -half) z += half * 2;
      else if (z > half) z -= half * 2;
      flakes[i * 3] = x;
      flakes[i * 3 + 1] = y;
      flakes[i * 3 + 2] = z;
      positions[i * 3] = camX + x;
      positions[i * 3 + 1] = camY + y - UNDER;
      positions[i * 3 + 2] = camZ + z;
    }
    geo.attributes.position.needsUpdate = true;
    if (recut) {
      // The cell is only read by the crystal program; the size is read by
      // both, so on the plain stop only half of this goes up the bus.
      if (crystals) geo.attributes.aCell.needsUpdate = true;
      geo.attributes.aScale.needsUpdate = true;
      recut = false;
    }
  };

  const dispose = (): void => {
    geo.dispose();
    atlas?.dispose();
    mat.dispose();
  };

  return { points, setIntensity, setFlash, setTone, setCrystals, setHabit, update, dispose };
}

/**
 * THE FLAKE SHADER, grafted onto three's own points material so the size
 * attenuation, the fog, the tint and the clipping planes keep working
 * exactly as they do for everything else in the scene.
 *
 * Four things the stock material cannot say, and each is why a flake is
 * not a dust puff (`graftDust`, dust.ts, which says three of its own):
 *
 *   SIZE, per flake, because a habit's size is half of what tells one
 *   crystal from another — and capped, because the exaggeration that makes
 *   a crystal readable at a metre would otherwise fill the windscreen at
 *   arm's length.
 *
 *   THE CRYSTAL, stamped out of the atlas: which cell is a per-flake
 *   attribute, and the sprite is turned about its own middle by the
 *   tumble, so a falling flake rotates rather than sliding down the frame
 *   like a decal.
 *
 *   THE FADE from that crystal to a plain round dot as the sprite gets
 *   small, which is the only thing that keeps a sheet of six-armed
 *   structures from turning into a field of aliasing. It is measured off
 *   `gl_PointSize` — the sprite's real size in device pixels, after the
 *   attenuation and the cap — because "can this shape be read" is a
 *   question about pixels and nothing else.
 *
 *   THE LAMPS, summed off the register the dust clouds share
 *   (dust-light.ts) at snow's own gain.
 */
function graftFlakes(
  mat: THREE.PointsMaterial,
  clock: { value: number },
  crystals: () => boolean,
): void {
  const { cols, rows, cell } = CRYSTAL_ATLAS;
  const grid = `vec2( ${cols.toFixed(1)}, ${rows.toFixed(1)} )`;
  /** Half a texel, in one cell's own 0..1 space: what a rotated sample is
   * held inside so it can never reach across into the next crystal. */
  const lo = (0.5 / cell).toFixed(5);
  const hi = (1 - 0.5 / cell).toFixed(5);
  mat.onBeforeCompile = (shader) => {
    // Read at COMPILE time, not per frame: `setCrystals` flips the flag and
    // asks three for a new program, and these two sources are what it gets.
    const rich = crystals();
    if (!rich) {
      // The plain sheet: a round dot in the sky's own light, and not one
      // instruction more. No attributes, no register, no atlas — the size
      // still comes off `aScale`, because a sheet of one size is a sheet of
      // stamps whatever else is switched off.
      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          `#include <common>
        attribute float aScale;
        attribute float aReach;
        varying float vRim;`,
        )
        .replace("gl_PointSize = size;", "gl_PointSize = size * aScale;")
        .replace(
          "#include <fog_vertex>",
          `#include <fog_vertex>
        gl_PointSize = min( gl_PointSize, scale * ${SIZE_CAP.toFixed(4)} );
        ${RIM_FADE_GLSL}`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", "#include <common>\n        varying float vRim;")
        .replace(
          "#include <map_particle_fragment>",
          "diffuseColor.a *= vRim * smoothstep( 0.5, 0.12, length( gl_PointCoord - 0.5 ) );",
        );
      return;
    }
    Object.assign(shader.uniforms, DUST_LAMP_UNIFORMS);
    shader.uniforms.uSnowClock = clock;
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
        ${DUST_LAMP_GLSL}
        uniform float uSnowClock;
        attribute float aCell;
        attribute float aScale;
        attribute float aSpin;
        attribute float aTumble;
        attribute float aReach;
        varying vec3 vLamp;
        varying float vSpin;
        varying float vNear;
        varying float vRim;
        varying vec2 vCell;`,
      )
      .replace(
        "gl_PointSize = size;",
        `gl_PointSize = size * aScale;
        vSpin = aSpin + aTumble * uSnowClock;
        vCell = vec2( mod( aCell, ${cols.toFixed(1)} ), floor( aCell / ${cols.toFixed(1)} ) ) / ${grid};
        vec3 flakeAt = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;${dustLampSum(
          "flakeAt",
          "vLamp",
          LAMP_GAIN,
        )}`,
      )
      .replace(
        "#include <fog_vertex>",
        `#include <fog_vertex>
        gl_PointSize = min( gl_PointSize, scale * ${SIZE_CAP.toFixed(4)} );
        vNear = smoothstep( ${CRYSTAL_AT.dot.toFixed(1)}, ${CRYSTAL_AT.full.toFixed(
          1,
        )}, gl_PointSize );
        ${RIM_FADE_GLSL}`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        varying vec3 vLamp;
        varying float vSpin;
        varying float vNear;
        varying float vRim;
        varying vec2 vCell;`,
      )
      .replace(
        "vec4 diffuseColor = vec4( diffuse, opacity );",
        "vec4 diffuseColor = vec4( diffuse + vLamp, opacity * vRim );",
      )
      // The stock chunk samples the map straight, unrotated and with three's
      // own flip; all three are wrong for an atlas of turning crystals, so
      // the mask is built here instead.
      .replace(
        "#include <map_particle_fragment>",
        `vec2 flakeUv = gl_PointCoord - 0.5;
        // The DOT: what every flake too small to read a shape on is, and
        // what the crystal is mixed out of. Procedural, so the atlas never
        // has to carry a cell for it.
        float flakeMask = smoothstep( 0.5, 0.12, length( flakeUv ) );
        float turn = vSpin;
        vec2 spun = vec2(
          cos( turn ) * flakeUv.x - sin( turn ) * flakeUv.y,
          sin( turn ) * flakeUv.x + cos( turn ) * flakeUv.y
        ) + 0.5;
        // Sampled unconditionally rather than under the fade: a texture
        // fetch inside non-uniform control flow is the one thing a points
        // shader should not do, and one fetch is cheaper than the branch.
        vec2 inCell = clamp( spun, ${lo}, ${hi} ) / ${grid};
        float crystal = texture2D( map, vCell + inCell ).a;
        diffuseColor.a *= mix( flakeMask, crystal, vNear );`,
      );
  };
  // Its own key, and the two stops of the DETAIL row are two programs under
  // it: three caches PointsMaterial programs by parameters that cannot tell
  // either pair apart on their own.
  mat.customProgramCacheKey = () => (crystals() ? "snowfall-crystal" : "snowfall-plain");
}
