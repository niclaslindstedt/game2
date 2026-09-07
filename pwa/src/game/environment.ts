// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The atmosphere: the sky a run is driven under, built out of the colours
// `sky.ts` works out for its conditions AT THIS MOMENT. The target look is
// Sega Rally's chunky saturated world sitting inside Valheim's air — a sky
// whose horizon glows around the sun, colored distance fog, a sun (or moon)
// with a soft halo, stars, a horizon of ridge silhouettes, and the cars'
// lamps coming up through their two stops as the light goes.
//
// THE SUN MOVES. One minute of racing is one hour of sun (`sunHourAt`), so
// the preset is not applied once per stage but re-read a few times a
// second off the race clock, and everything hung on it — the lights, the
// dome, the ridges, the fog, the lamps' switch — follows. A stage started
// at sunset is driven down the ladder into the dark without a cut.
//
// Two skies, one switch (`SKY_LOOK`, the video options' SKY lever):
//
//   SIMPLE   the arcade sky — a vertex-coloured dome, a ring of cumulus
//            puffs (clouds.ts), a mesh ceiling under weather, a disc and a
//            halo billboarded in front.
//   LAYERED  the dome as a shader (sky-shader.ts): the cloud chart's
//            sheets at their real altitudes (cloud-field.ts), the sun
//            dimming as one crosses it, the mist in the valleys
//            (mist.ts, height-fog.ts) and the country's own shadow marched
//            off the heightfield (mountain-shadow.ts). FULL is the same at
//            more octaves, with the clouds' shadows on the ground.
//
// Neighbours own the parts that are their own craft: `sky.ts` decides what
// colour everything is, `horizon.ts` the ridges, `car-lamps.ts` the beams
// off the car, and `storm.ts` the lightning and the thunder behind it.
// Everything here is presentation: it reads GameState (env, wind, car, the
// clock) and never writes it.

import * as THREE from "three";
import {
  fallsAsSnow,
  rainsIn,
  sunHourAt,
  temperatureAt,
  type BiomeId,
  type GameState,
  type RaceEnv,
} from "@engine";

import { createCarLamps } from "./car-lamps.ts";
import { GLASS_SKY, SKYLINE } from "./car/glass-reflect.ts";
import type { LampSource } from "./car/lamps.ts";
import { createClouds } from "./clouds.ts";
import { dressSky, sunOcclusion, type SkyDressing } from "./cloud-field.ts";
import { horizonCrossing, litAt, sunAt, type LampStage } from "./daylight.ts";
import { lightDust as hangDustLamps } from "./dust-light.ts";
import {
  HEIGHT_FOG,
  SHADOW_CELLS,
  SHADOW_SPAN,
  installHeightFog,
  writeShadowMap,
} from "./height-fog.ts";
import { createHorizon } from "./horizon.ts";
import { DENSITY_PER_M, mistFor } from "./mist.ts";
import { createShadowMarch, type ShadowMarch } from "./mountain-shadow.ts";
import { createRain } from "./rain.ts";
import { createSnowfall } from "./snowfall.ts";
import { createSkyShell, litLayers } from "./sky-shader.ts";
import { SKY_ORDER, drawAsBackdrop } from "./sky-depth.ts";
import { createStorm } from "./storm.ts";
import {
  beamShareOf,
  carTintFor,
  dayLight,
  dustTintFor,
  DOME_RADIUS,
  highLightFor,
  rainTone,
  skyAt,
  snowTone,
  sunDir,
  sunHardness,
  type Preset,
} from "./sky.ts";
import { createSunShadows, type SunShadows } from "./car-shadow.ts";
import { fogRangeFor, SKY_LOOK, type VideoSettings } from "./settings.ts";
import { coverOf, squallOf, type Clap } from "./weather.ts";
import { glowTexture } from "./textures.ts";

// Before any material compiles: three resolves the fog chunk at compile
// time, and the ground's mist and shadows ride on the replaced one.
installHeightFog();

/** What a lightning flash lights the world with while it lasts — a cold
 * blue-white that owes nothing to the time of day, because a strike is the
 * same colour at dawn as it is at midnight. */
const FLASH_COLOR = 0xdfe9ff;

/** How far the sun has to move before the sky is re-read, hours: fifteen
 * seconds of sun, a quarter of a second of racing. The lights and the
 * shader's uniforms are cheap and the ridges are eighteen hundred vertices;
 * at this step the colours change by nothing an eye can see. */
const RELIGHT_EVERY = 1 / 240;

/** How far the sun has to move before the country's shadow is marched
 * again, radians — half a degree, two seconds of racing. */
const REMARCH_EVERY = 0.5 * (Math.PI / 180);

/** How fast the key light follows a cloud across the sun, 1/s. A cumulus
 * takes seconds to cross it; the light going with it in a frame would read
 * as a fault in the lamp. */
const OCCLUSION_RATE = 1.4;

/** The stage the sky stands over: where its road goes lowest and highest,
 * m over the sea (the mist pools at the floor; the deck hangs over the
 * road), and the country's heightfield for the shadow march. */
export type Ground = {
  floor: number;
  peak: number;
  heightAt: (x: number, z: number) => number;
};

export type Environment = {
  /** Re-color the whole atmosphere for the run's conditions, over the
   * country they are in (R40): the same storm is a downpour in one and a
   * wall of sand in the other. Once per stage; the clock does the rest. */
  apply: (env: RaceEnv, biome?: BiomeId) => void;
  /** The ground under the sky — for the mist, the deck and the shadow.
   * Null for a sky over nothing in particular (the harness pages). */
  setGround: (ground: Ground | null) => void;
  /** The video options' SKY lever. Applies at once. */
  setSkyLook: (level: VideoSettings["sky"]) => void;
  /** Scale how far the fog lets the player see, as a multiple of the
   * preset's own distances — the video options pull it in on a weak device. */
  setRange: (scale: number) => void;
  /** Where the air goes solid, m. Past it every fragment is pure fog
   * color, which is what makes the world's fog cull safe. */
  fogFar: () => number;
  /** Set the fog distances outright, in meters. The map view frames a whole
   * stage from kilometres away, where a multiple of the driving preset is
   * meaningless; what it needs is ground that dissolves just before the
   * built terrain runs out, instead of ending on a visible edge. */
  setFogRange: (near: number, far: number) => void;
  /** Draw one pass with the air pulled in — both fog distances scaled by
   * `by` for the duration of `draw`, and put back the moment it returns.
   *
   * The rear-view mirror is what needs this. It is a strip a few hundred
   * pixels wide showing a view the player never steers by, so it has no use
   * for the kilometre of clear air the forward view is given, and drawing
   * the whole of it a second time is what a mirror would otherwise cost.
   * Pulling the fog in rather than simply shortening the mirror camera's far
   * plane is what keeps the saving invisible: geometry leaves the frustum
   * where the air is already solid, instead of being cut off in mid-view.
   * The SKY takes no fog at all (`fog: false` on every shell), so the
   * mirror keeps its horizon, its ridges and its clouds. */
  withHaze: (by: number, draw: () => void) => void;
  /** Show or hide the SKY — the dome and everything pinned inside it: the
   * stars, the sun's disc and halo, the clouds, the ridge rings, and the
   * mist on the ground under it.
   *
   * Every one of them is a fixed-size shell a few hundred metres around a
   * camera at head height, which is the only place any of it makes sense.
   * Seen from the map view's satellite, kilometres up, the ridges lie across
   * the middle of the stage, the clouds sit under it, and the dome itself is
   * a ball hanging below the map with the camera outside it. Down there the
   * sky is the sky; up here it is `scene.background`, the same flat colour
   * the page's own cards sit on, and the stage reads as an island on it. */
  setSky: (show: boolean) => void;
  /** Current tint for the car's baked vertex lighting. */
  carTint: () => THREE.Color;
  /** …and the shadows that light throws (car-shadow.ts): the map hung off
   * the sun, which the environment aims and gates — the renderer only
   * hands it the machine it is drawn with and the video option it is
   * sized by. */
  shadows: SunShadows;
  /** …and the darker one hanging dust takes (sky.ts's `dustTintFor`): a
   * cloud in the dark is supposed to disappear where a car is not. */
  dustTint: () => THREE.Color;
  /** …and what a thing at airliner height is lit — the contrails, which
   * burn the sunset's orange after the valley has gone grey. */
  highTint: () => THREE.Color;
  /** How high the LID is overhead, m — the cloud base under this stage's
   * weather, or Infinity when there is no deck at all. What lives above the
   * weather rather than under it (ambient-life.ts's high traffic) reads it
   * to know whether the car can see any of it. */
  ceiling: () => number;
  /** Which stop of the light switch the car is actually running — off in
   * daylight, dipped through the long evening, main beam once the light has
   * gone (`Preset.lamps`), less whatever the dip switch takes off that for
   * a car close ahead. */
  lampStage: () => LampStage;
  /** How far off the nearest car the beams could land on, m (`Infinity` for
   * an empty road) — pushed per frame by the renderer, which is the only
   * thing that knows where the field is. */
  setCompany: (metres: number) => void;
  /** Call `cb` whenever THE LIGHT HAS CHANGED — the sky re-read on the sun's
   * clock, or the lamps moving a stop. Everything lit by the scene follows
   * on its own; this is for what does NOT, which is every surface carrying
   * its own baked colour: the cars' paint, their lenses, their cabins. Set
   * once. Without it a stage driven from the last of the daylight into the
   * night keeps the paint and the dark lamps it was BUILT with, however far
   * the sun has moved under it. */
  onRelight: (cb: () => void) => void;
  /** …and how much of a beam survives the daylight it is competing with,
   * 0..1. The environment drives the player's own lamps with it; anything
   * else that lights something off a car (the field's lamps on the dust)
   * reads it here rather than keeping a second answer. */
  lampPower: () => number;
  /** How hard this stage is raining, 0..1 — what anything the weather LANDS
   * on reads, the wipers on the car's glass first among them. Whatever
   * form it takes: see `snowing` for how much of it is flakes. */
  rainfall: () => number;
  /** How much of what is falling at the camera is SNOW rather than rain,
   * 0..1 (climate.ts) — what puts flakes on the glass instead of water. */
  snowing: () => number;
  /** How bright the sky is with lightning this instant, 0..1. */
  flash: () => number;
  /** …and which way the strike lighting it is coming from. */
  flashFrom: () => THREE.Vector3;
  /** The sun's clock as last read, hours 0..24 — for the overlay. */
  sunHour: () => number;
  /** The transient-FX budget, 0..1 — the video options' own scale. At
   * nothing the rain comes off entirely, which is what the low setting
   * promises. */
  setEffects: (scale: number) => void;
  /** What to do when a clap of thunder finally arrives. Set once; the
   * environment holds no opinion about sound beyond WHEN. */
  onThunder: (play: (clap: Clap) => void) => void;
  /** How filthy the car is, 0..1 — every beam fades under a caked lens. */
  setGrime: (level: number) => void;
  /** How much of each end's lighting is still on the car, 0..1 — a share,
   * not a switch, because the lamps break one at a time (`FRONT_LAMPS` /
   * `REAR_LAMPS`, engine-side). One headlamp gone is half the light down
   * the road, which is a fact about every night corner after it. */
  setLampsBroken: (front: number, rear: number) => void;
  /** WHICH LAMPS THIS CAR HAS, as the light sources its own body authored
   * (`car/lamps.ts`) — where each one sits, how strong it is and what shape
   * it throws. Pushed in when a car is built, because a beam belongs to a
   * lens: a quad-headlight face throws four, a car with a pod bar throws the
   * bar, and the LIGHTING row's cap is spent on the strongest of whatever it
   * turns out to be. */
  setLampPlan: (head: readonly LampSource[], tail: readonly LampSource[]) => void;
  /** The video options' LIGHTING row: how many beams each end of the car
   * throws (`LAMP_BEAMS`) and which shadow map the sun draws, if any. A
   * beam is paid for on every lit pixel in the frame, so this is the one
   * row that changes what the whole world costs rather than what is in it.
   * Applies at once — the lights are standing in the scene already. */
  setLighting: (level: VideoSettings["lighting"]) => void;
  /** Hang the PLAYER's lamps on the register the dust clouds are lit from
   * (dust-light.ts), at whatever strength the daylight and the grime on the
   * lenses leave them. The register is emptied by its one owner, the
   * renderer, so this only ever adds. */
  lightDust: (car: { x: number; y: number; z: number; heading: number; braking: boolean }) => void;
  update: (state: GameState, camera: THREE.Camera, dt: number) => void;
  dispose: () => void;
};

const STILL_AIR: RaceEnv = {
  hour: 12,
  weather: "clear",
  season: "summer",
  temperature: 18,
  windDir: 0,
  windSpeed: 0,
  gustPhase: 0,
};

export function createEnvironment(scene: THREE.Scene): Environment {
  const group = new THREE.Group(); // everything that follows the camera
  scene.add(group);

  const fog = new THREE.Fog(0xbfe3ff, 160, 520);
  scene.fog = fog;
  const background = new THREE.Color(0x3fa9f5);
  scene.background = background;

  // ── The simple sky's dome ────────────────────────────────────────────────
  // Vertex-colored gradient, recolored per preset: horizon → zenith with a
  // warm bleed around the sun's bearing — the Valheim glow. Under an
  // overcast sky the deck covers most of it and what is left is the band
  // above the horizon, which is exactly where a storm's light gets in.
  const domeGeo = new THREE.SphereGeometry(DOME_RADIUS, 32, 18);
  const domeColors = new Float32Array(domeGeo.getAttribute("position").count * 3);
  domeGeo.setAttribute("color", new THREE.BufferAttribute(domeColors, 3));
  const domeMat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    side: THREE.BackSide,
    fog: false,
  });
  drawAsBackdrop(domeMat);
  const dome = new THREE.Mesh(domeGeo, domeMat);
  dome.renderOrder = SKY_ORDER - 3;
  // THE EYE'S OWN SKY. Everything at infinity — the domes, the stars, the
  // sun and its halo — is centred on the camera in all three axes, where
  // the ridges and the clouds stand on the country's ground plane (the
  // group at the camera's x and z only). Centred at ground height, the sky
  // moves with the camera's HEIGHT: from a road four hundred metres up a
  // massif the dome's horizon band is that far below the eye and the sun
  // parked at `DOME_RADIUS` sits seven metres over it and 280 m out — on
  // the eye's horizon, low and orange in the middle of a summer day, and
  // shining through every slope further off than that.
  const eye = new THREE.Group();
  scene.add(eye);
  eye.add(dome);

  // ── The layered sky's dome ───────────────────────────────────────────────
  const shell = createSkyShell();
  eye.add(shell.mesh);

  const paintDome = (p: Preset): void => {
    const pos = domeGeo.getAttribute("position");
    const zenith = new THREE.Color(p.zenith);
    const horizon = new THREE.Color(p.horizon);
    const glow = new THREE.Color(p.glow);
    const c = new THREE.Color();
    const az = new THREE.Vector2(Math.sin(p.sunBearing), Math.cos(p.sunBearing));
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const t = Math.max(0, y / DOME_RADIUS);
      c.copy(horizon).lerp(zenith, Math.pow(t, 0.62));
      const len = Math.hypot(x, z) || 1;
      const toward = Math.max(0, (x / len) * az.x + (z / len) * az.y);
      const w = Math.pow(toward, 3) * Math.pow(1 - t, 2.2) * p.glowStrength;
      c.lerp(glow, Math.min(1, w));
      if (y < 0) c.multiplyScalar(0.92);
      domeColors[i * 3] = c.r;
      domeColors[i * 3 + 1] = c.g;
      domeColors[i * 3 + 2] = c.b;
    }
    domeGeo.getAttribute("color").needsUpdate = true;
  };

  // ── Stars ────────────────────────────────────────────────────────────────
  const starCount = 420;
  const starPos = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    // Uniform over the upper dome, biased away from the horizon band.
    const a = Math.random() * Math.PI * 2;
    const e = 0.12 + Math.random() * (Math.PI / 2 - 0.12);
    const r = DOME_RADIUS * 0.96;
    starPos[i * 3] = Math.sin(a) * Math.cos(e) * r;
    starPos[i * 3 + 1] = Math.sin(e) * r;
    starPos[i * 3 + 2] = Math.cos(a) * Math.cos(e) * r;
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
  // BACKDROP, all of it: the stars, the sun and its halo ride the stack
  // sky-depth.ts owns — last in the opaque pass, depth-tested at the far
  // plane — so a mountain occludes the sun however far off it stands, and
  // none of the three is shaded on a pixel the country already covers.
  // They stay OUT of the transparent pass: marked `transparent` they would
  // be depth-tested at their own distance instead, which is `DOME_RADIUS`
  // and a bit, under 500 m — and a ridge further off than that would have
  // the sun shining through it. The blend modes are additive because a
  // material that is not `transparent` gets NO blending under normal mode,
  // and the stars and the halo fade by opacity.
  const starMat = new THREE.PointsMaterial({
    color: 0xdfe8ff,
    size: 1.6,
    sizeAttenuation: false,
    opacity: 0,
    fog: false,
    blending: THREE.AdditiveBlending,
  });
  drawAsBackdrop(starMat);
  const stars = new THREE.Points(starGeo, starMat);
  stars.renderOrder = SKY_ORDER - 2;
  eye.add(stars);

  // ── Sun / moon: a hard disc inside a soft halo, billboarded ──────────────
  const glowMap = glowTexture();
  const haloMat = new THREE.MeshBasicMaterial({
    map: glowMap,
    fog: false,
    blending: THREE.AdditiveBlending,
  });
  drawAsBackdrop(haloMat);
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), haloMat);
  halo.renderOrder = SKY_ORDER - 2;
  const discMat = new THREE.MeshBasicMaterial({ fog: false });
  drawAsBackdrop(discMat);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(1, 24), discMat);
  disc.renderOrder = SKY_ORDER - 1;
  eye.add(halo, disc);

  // ── The horizon, the clouds, the weather ────────────────────────────────
  const horizon = createHorizon();
  group.add(horizon.mesh);

  const clouds = createClouds();
  group.add(clouds.group);

  // The rain is weather like the deck above it, so it belongs here — but it
  // lives in the WORLD rather than on the camera-riding group: a drop is a
  // few metres from the lens, where the sky's fixed-size shells are
  // hundreds, and the sheet is drawn at the velocity the camera SEES it at.
  const rain = createRain();
  scene.add(rain.lines);
  // ...and the same precipitation as FLAKES, where the air at the camera's
  // height is under freezing (climate.ts). The two boxes are cross-faded
  // rather than switched: a stage that starts beside the snow rains in
  // the valley it comes down into, and the change-over is a hundred metres
  // of sleet, not a frame.
  const snow = createSnowfall();
  scene.add(snow.points);
  let flakes = 0;
  let effects = 1;

  let playThunder: (clap: Clap) => void = () => {};
  const storm = createStorm((clap) => playThunder(clap));
  group.add(storm.group);

  // ── Lights ───────────────────────────────────────────────────────────────
  const hemi = new THREE.HemisphereLight(0xffffff, 0xb0a894, 0.95);
  const sunLight = new THREE.DirectionalLight(0xfff2d8, 1.5);
  sunLight.target.position.set(0, 0, 0);
  // The shadows hang off the sun. The light is always placed RELATIVE to
  // its target from here on — the shadows move the target to whichever car
  // the frame is about, and a light set from the origin would then point
  // somewhere else for a frame.
  const shadows = createSunShadows(sunLight);
  scene.add(hemi, sunLight, sunLight.target);

  const lamps = createCarLamps(scene);

  // ── What the sky is standing over, and how it is drawn ──────────────────
  let env: RaceEnv = STILL_AIR;
  let biome: BiomeId = "taiga";
  let ground: Ground | null = null;
  let look = SKY_LOOK.layered;
  let skyShown = true;
  let preset: Preset = skyAt(env, biome, env.hour);
  let dressing: SkyDressing = { layers: [] };
  /** The sun's clock at the last re-light, hours. */
  let litHour = env.hour;
  /** Where the camera stood last frame — the deck's altitude and the
   * contrails' light are read against it. */
  let eyeY = 0;
  /** The real sun and the key light, as directions. */
  const sunV = new THREE.Vector3(0, 1, 0);
  const keyV = new THREE.Vector3(0, 1, 0);
  /** How much cloud is over the sun, smoothed, 0..1 — and how much of the
   * sun the ridge lets through. */
  let occlusion = 0;
  let ridgeThrough = 1;
  /** The stage's mean wind, m/s — what the live gust is read against to
   * find the squall (see `squallOf`). */
  let meanWind = 0;
  /** How hard it is coming down this instant, 0..1. */
  let rainNow = 0;
  let rangeScale = 1;
  /** Set while a view drives the fog in meters instead of by preset. */
  let absolute: { near: number; far: number } | null = null;
  /** The country's shadow, marched off the heightfield — for a sky that
   * draws it, over a stage that has one. */
  let march: ShadowMarch | null = null;
  const marchedSun = new THREE.Vector3(0, -1, 0);

  const applyRange = (): void => {
    if (absolute) {
      fog.near = absolute.near;
      fog.far = absolute.far;
      return;
    }
    // The preset handed in here has ALREADY taken the sky's own fraction
    // (sky.ts), and the player's DISTANCE row is a multiplier on top of it —
    // so the two compound, and what the row may take is decided next to the
    // ladder itself rather than here (`fogRangeFor`).
    const range = fogRangeFor(preset.fogNear, preset.fogFar, rangeScale);
    fog.near = range.near;
    fog.far = range.far;
  };

  /** Which sky is up: the shader dome or the simple one, and only while
   * the sky is shown at all. */
  const applyVisibility = (): void => {
    const shader = look.shader && skyShown;
    const simple = !look.shader && skyShown;
    shell.mesh.visible = shader;
    dome.visible = simple;
    stars.visible = simple;
    clouds.setVisible(simple);
    disc.visible = simple && preset.discSize > 0;
    halo.visible = simple && preset.haloOpacity > 0.01;
    storm.setVisible(skyShown);
    horizon.mesh.visible = skyShown;
  };

  /** How much of the key's beam is on the world this frame, 0..1: what the
   * ridge lets through of the sun, and what the cloud over it leaves. The
   * moon's key is never dimmed — the night is dark enough already. */
  const beamNow = (): number => {
    const sunIsKey = preset.sunUp > -0.06;
    return sunIsKey ? ridgeThrough * (1 - 0.75 * occlusion) : 1;
  };

  /** Put the preset's own key light back on the scene. */
  const restLight = (): void => {
    hemi.color.set(preset.hemiSky);
    hemi.intensity = preset.hemiIntensity;
    sunLight.color.set(preset.sun);
    sunLight.intensity = preset.sunIntensity * beamNow();
    sunLight.position.copy(sunLight.target.position).addScaledVector(keyV, 300);
    shadows.setHardness(sunHardness(preset) * beamNow());
  };

  /** Where the deck hangs, m over the sea: the preset's base over the
   * road's floor, and never under the eye — a camera that climbs above the
   * ceiling would see the weather from above, which is a different stage. */
  const deckAltitude = (): number | null => {
    if (!preset.deck) return null;
    return Math.max((ground?.floor ?? 0) + preset.deck.base, eyeY + 70);
  };

  /** THE MIST, into the fog's uniforms — lying in the valleys at dawn, or
   * not at all. */
  const applyMist = (): void => {
    const sun = sunAt(litHour, env.season, biome);
    const drawn = look.mist && skyShown && ground !== null;
    const mist = mistFor({
      sunUp: sun.elevation,
      rising: sun.rising,
      season: env.season,
      biome,
      weather: env.weather,
      wet: rainsIn(biome, env.season),
      floor: ground?.floor ?? 0,
      peak: ground?.peak ?? 0,
    });
    HEIGHT_FOG.mist.x = mist.top;
    HEIGHT_FOG.mist.y = 1 / Math.max(1, mist.depth);
    HEIGHT_FOG.mist.z = drawn ? mist.density * DENSITY_PER_M : 0;
    // How much of the mist is the lit tone: what the sun reaches at the
    // sheet's own height.
    HEIGHT_FOG.mist.w = litAt(mist.top, preset.sunUp) * beamNow();
    const lit = new THREE.Color(preset.cloud).lerp(new THREE.Color(preset.fog), 0.35);
    const shade = new THREE.Color(preset.cloudShade).lerp(new THREE.Color(preset.fog), 0.5);
    Object.assign(HEIGHT_FOG.mistLit, { x: lit.r, y: lit.g, z: lit.b });
    Object.assign(HEIGHT_FOG.mistShade, { x: shade.r, y: shade.g, z: shade.b });
    const sunColor = new THREE.Color(preset.sun);
    Object.assign(HEIGHT_FOG.sunColor, { x: sunColor.r, y: sunColor.g, z: sunColor.b });
  };

  /** RE-READ THE SKY for the sun at `hour`, and hang everything on it. */
  const relight = (hour: number): void => {
    litHour = hour;
    preset = skyAt(env, biome, hour);
    sunV.copy(sunDir(preset.sunUp, preset.sunBearing));
    keyV.copy(sunDir(preset.sunElevation, preset.sunAzimuth));
    dressing = dressSky(env, biome, coverOf(env), deckAltitude());
    rainNow = preset.rain;
    background.set(preset.zenith);
    fog.color.set(preset.fog);
    applyRange();
    hemi.groundColor.set(preset.hemiGround);
    restLight();
    rain.setTone(rainTone(preset));
    snow.setTone(snowTone(preset));
    horizon.paint(preset);
    storm.apply(preset);
    lamps.setStage(preset.lamps);
    if (look.shader) {
      shell.apply(preset, dressing, look);
      litLayers(shell, (layer) => (layer.deck ? 1 : litAt(layer.altitude, preset.sunUp)));
    } else {
      paintDome(preset);
      clouds.apply(preset, dressing);
      starMat.opacity = preset.stars;
      // The disc and halo park where the light comes from.
      const at = keyV.clone().multiplyScalar(DOME_RADIUS * 0.86);
      disc.position.copy(at);
      disc.scale.setScalar(preset.discSize || 0.001);
      discMat.color.set(preset.disc);
      halo.position.copy(at);
      halo.scale.setScalar(preset.haloSize);
      haloMat.color.set(preset.halo);
      haloMat.opacity = preset.haloOpacity;
    }
    applyMist();
    applyVisibility();
    // ...and the surfaces the scene's own lights cannot reach: the cars are
    // fullbright and carry their light as a tint, so the only thing that
    // moves their paint down with the sun is being told.
    relit();
  };

  const apply = (next: RaceEnv, country: BiomeId = "taiga"): void => {
    env = next;
    biome = country;
    meanWind = env.windSpeed;
    horizon.setCountry(biome);
    // The sea gap in the horizon faces wherever this run's sun meets it —
    // the sunset for a stage started after noon, the sunrise for one
    // started before — so the low sun the run is driven into has a horizon
    // to sit on rather than a wall of rock.
    horizon.turnTo(horizonCrossing(env.hour, env.season, biome));
    occlusion = 0;
    relight(env.hour);
  };

  const setGround = (next: Ground | null): void => {
    ground = next;
    march = next ? createShadowMarch(next.heightAt, SHADOW_CELLS, SHADOW_SPAN) : null;
    marchedSun.set(0, -1, 0);
    relight(litHour);
  };

  const setSkyLook = (level: VideoSettings["sky"]): void => {
    look = SKY_LOOK[level];
    relight(litHour);
  };

  const setRange = (scale: number): void => {
    rangeScale = scale;
    absolute = null;
    applyRange();
  };

  const setFogRange = (near: number, far: number): void => {
    absolute = { near, far };
    applyRange();
  };

  const withHaze = (by: number, draw: () => void): void => {
    const near = fog.near;
    const far = fog.far;
    fog.near = near * by;
    fog.far = far * by;
    try {
      draw();
    } finally {
      fog.near = near;
      fog.far = far;
    }
  };

  const setSky = (show: boolean): void => {
    skyShown = show;
    applyVisibility();
    applyMist();
    if (!show) HEIGHT_FOG.shadowFrame.w = 0;
  };

  const setLighting = (level: VideoSettings["lighting"]): void => {
    lamps.setLighting(level);
    shadows.setQuality(level);
  };

  /** How much of a beam survives the daylight it is competing with. A car
   * running lights under a black storm at noon still has daylight on the
   * road, and a full-strength pool under it reads as night. */
  const lampPower = (): number => 1 - 0.75 * dayLight(preset);

  /** What to tell when the light has moved — see `onRelight`. */
  let relit: () => void = () => {};

  /** THE COUNTRY'S SHADOW: re-sample the heights when the camera has
   * walked far enough, re-march when the sun has moved far enough, and
   * hand the fog the map's frame. */
  const marchShadow = (cam: THREE.Vector3): void => {
    if (!march || !look.mountainShadow || !skyShown) {
      HEIGHT_FOG.shadowFrame.w = 0;
      return;
    }
    const moved = march.focus(cam.x, cam.z);
    if (moved || marchedSun.angleTo(sunV) > REMARCH_EVERY) {
      if (!moved) march.march(sunV);
      marchedSun.copy(sunV);
      writeShadowMap(march.data);
    }
    HEIGHT_FOG.shadowFrame.x = march.originX;
    HEIGHT_FOG.shadowFrame.y = march.originZ;
    HEIGHT_FOG.shadowFrame.z = 1 / march.span;
    // What a shadow takes off the ground: the beam's share of its light.
    HEIGHT_FOG.shadowFrame.w = beamShareOf(preset) * beamNow();
    HEIGHT_FOG.shadowRange.x = march.lo;
    HEIGHT_FOG.shadowRange.y = march.hi - march.lo;
  };

  /** THE SKY IN THE CARS' WINDOWS (car/glass-reflect.ts), on the same terms
   * the mist and the cloud shadows are written on: one block of numbers,
   * shared by reference with every pane on the road.
   *
   * All of it is the sky the dome is already drawing — its two colours this
   * hour, the cloud tone, the lid's underside where there is one, and the
   * lowest sheet's own coverage and drift — so a window shows the weather
   * that is actually overhead rather than a picture of some other one. The
   * SUN is not written here: the glass reads `HEIGHT_FOG.sun` by reference,
   * which the frame below sets once for everything that needs it. */
  const glassSky = (cam: THREE.Vector3): void => {
    // Under a deck the sky IS the lid: its underside overhead, and the light
    // that gets in under its rim at the horizon.
    const zenith = new THREE.Color(preset.deck ? preset.deck.overhead : preset.zenith);
    const horizon = new THREE.Color(preset.deck ? preset.deck.rim : preset.horizon);
    Object.assign(GLASS_SKY.zenith, { x: zenith.r, y: zenith.g, z: zenith.b });
    Object.assign(GLASS_SKY.horizon, { x: horizon.r, y: horizon.g, z: horizon.b });
    const cloud = new THREE.Color(preset.cloud);
    Object.assign(GLASS_SKY.cloud, { x: cloud.r, y: cloud.g, z: cloud.b });
    // The land, at the distance a reflected horizon is always at: the
    // hemisphere's own ground colour, washed most of the way into the fog —
    // and the trees on it as the same tone with the light taken out of it.
    const fogTone = new THREE.Color(preset.fog);
    const ground = new THREE.Color(preset.hemiGround).lerp(fogTone, 0.45);
    Object.assign(GLASS_SKY.ground, { x: ground.r, y: ground.g, z: ground.b });
    const trees = new THREE.Color(preset.hemiGround).multiplyScalar(0.4).lerp(fogTone, 0.3);
    Object.assign(GLASS_SKY.trees, { x: trees.r, y: trees.g, z: trees.b });
    GLASS_SKY.look.y = SKYLINE[biome];
    // The sheet a window can actually see through: the lowest one over the
    // eye, at the coverage and the offsets the dome is drawing it at. A lid
    // is not one — it is the sky itself up there, and the pane has it in the
    // two colours above — so what it contributes is the ragged relief of its
    // own underside.
    const over = shell.layers().find(({ layer }) => !layer.deck && layer.altitude > cam.y);
    if (!skyShown) GLASS_SKY.look.x = 0;
    else if (preset.deck) GLASS_SKY.look.x = 0.3 * preset.deck.relief;
    else GLASS_SKY.look.x = over ? over.layer.coverage : 0;
    // The drift, off the layer's own offset and its own cell size, so what
    // slides through a window keeps pace with what is overhead.
    const pitch = over ? 1 / over.layer.scale : 0;
    GLASS_SKY.look.z = over ? over.offsetX * pitch : 0;
    GLASS_SKY.look.w = over ? over.offsetZ * pitch : 0;
  };

  /** THE CLOUDS' SHADOW on the ground: the lowest sheet over the eye,
   * read by the fog chunk at the same offsets the dome draws it at. */
  const shadeByClouds = (cam: THREE.Vector3): void => {
    const drawn = shell.layers();
    const over = drawn.find(({ layer }) => !layer.deck && layer.altitude > cam.y);
    if (!over || !look.cloudShadow || !skyShown) {
      HEIGHT_FOG.cloudB.w = 0;
      return;
    }
    const wind = shell.wind();
    const { layer } = over;
    Object.assign(HEIGHT_FOG.cloudA, {
      x: layer.altitude,
      y: 1 / layer.scale,
      z: over.offsetX,
      w: over.offsetZ,
    });
    Object.assign(HEIGHT_FOG.cloudB, {
      x: layer.coverage,
      y: layer.sharpness,
      w: beamShareOf(preset) * beamNow() * Math.min(1, layer.body + 0.3),
    });
    Object.assign(HEIGHT_FOG.cloudC, {
      x: wind.x,
      y: wind.z,
      z: layer.streak,
      w: layer.seed * 13.7,
    });
  };

  const update = (state: GameState, camera: THREE.Camera, dt: number): void => {
    const cam = camera.position;
    eyeY = cam.y;
    group.position.set(cam.x, 0, cam.z);
    eye.position.copy(cam);
    disc.lookAt(cam);
    halo.lookAt(cam);

    // THE SUN'S CLOCK: re-read the sky when it has moved far enough.
    const hour = sunHourAt(state.env, state.t);
    const moved = Math.abs(hour - litHour);
    if (Math.min(moved, 24 - moved) >= RELIGHT_EVERY) relight(hour);

    // The weather breathes with the gust that carries it: the squall is the
    // downdraught, so the sheet thickens exactly as the car is shoved.
    const squall = squallOf(state.wind, meanWind);
    rainNow = preset.rain * (0.65 + 0.5 * squall);

    // Clouds ride the wind, each at its own pace — the sky drifts as a
    // population, never as one rigid ring. Under the map view the sky is
    // off, and placing puffs nobody draws is the one part worth skipping.
    const windSpeed = Math.hypot(state.wind.x, state.wind.z);
    if (clouds.group.visible) clouds.update(windSpeed, dt, camera, group.position);
    if (shell.mesh.visible) shell.tick(state.wind.x, state.wind.z, dt);

    // THE SUN BEHIND THINGS. The ridge on its bearing, first: past it the
    // disc is gone and so is the beam, which is what a valley losing the
    // sun looks like. Then the cloud over it, read off the same field the
    // dome draws, and followed at a cloud's own pace.
    const ridge = horizon.elevationAt(preset.sunBearing, cam.y);
    ridgeThrough = smooth((preset.sunUp - ridge) / 0.02 + 0.5);
    let covered = 0;
    if (look.shader) {
      const wind = shell.wind();
      for (const { layer, offsetX, offsetZ } of shell.layers()) {
        if (layer.deck) continue;
        covered = Math.max(
          covered,
          sunOcclusion(
            layer,
            cam.x,
            cam.y,
            cam.z,
            sunV,
            offsetX,
            offsetZ,
            wind.x,
            wind.z,
            look.octaves,
          ),
        );
      }
    }
    occlusion += (covered - occlusion) * Math.min(1, dt * OCCLUSION_RATE);
    const sunIsKey = preset.sunUp > -0.06;
    shell.setSun(sunV, keyV, sunIsKey ? ridgeThrough * (1 - 0.9 * occlusion) : 1);
    HEIGHT_FOG.sun.x = sunV.x;
    HEIGHT_FOG.sun.y = sunV.y;
    HEIGHT_FOG.sun.z = sunV.z;
    HEIGHT_FOG.sun.w =
      preset.beam * beamNow() * Math.max(0, Math.min(1, preset.sunUp / 0.15 + 0.4));

    // The player's lamps, on the nose and the tail.
    lamps.aim(state.car, lampPower());

    // The storm strikes on its own clock; what it hands back is how much
    // light is on the world this instant.
    storm.update(dt, camera);
    const surge = storm.surge();
    clouds.setFlash(surge);
    shell.setFlash(surge);
    // The sheet rides the squall, and a strike lights it before it lights
    // anything else — the rain is the nearest thing to the lens there is.
    const freezing = fallsAsSnow(temperatureAt(state.track.climate, cam.y)) ? 1 : 0;
    flakes += (freezing - flakes) * Math.min(1, dt * 1.5);
    rain.setIntensity(effects > 0 ? rainNow * (1 - flakes) : 0);
    rain.setFlash(surge);
    rain.update(cam.x, cam.y, cam.z, state.wind.x, state.wind.z, dt);
    snow.setIntensity(effects > 0 ? rainNow * flakes : 0);
    snow.setFlash(surge);
    snow.update(cam.x, cam.y, cam.z, state.wind.x, state.wind.z, dt);
    if (surge > 0) {
      // A strike is a light SOMEWHERE, not a lift of the one that is
      // already there: the key swings round to the bolt for as long as it
      // burns, which is what puts the far side of a tree in shadow and
      // sells the flash as a place rather than as a screen wash.
      hemi.color.set(FLASH_COLOR);
      hemi.intensity = preset.hemiIntensity + 2.2 * surge;
      sunLight.color.set(FLASH_COLOR);
      sunLight.intensity = preset.sunIntensity + 1.8 * surge;
      sunLight.position.copy(sunLight.target.position).addScaledVector(storm.from(), 300);
    } else {
      // Every frame rather than once: the beam follows the cloud over the
      // sun and the sun over the ridge, and the preset's own key comes
      // back the frame a flash is over.
      restLight();
    }
    marchShadow(cam);
    shadeByClouds(cam);
    glassSky(cam);
    // Last, so the map is built around wherever the light ended up.
    shadows.follow(state.car, camera);
  };

  const dispose = (): void => {
    horizon.dispose();
    domeGeo.dispose();
    domeMat.dispose();
    shell.dispose();
    starGeo.dispose();
    starMat.dispose();
    haloMat.dispose();
    disc.geometry.dispose();
    discMat.dispose();
    halo.geometry.dispose();
    clouds.dispose();
    storm.dispose();
    rain.dispose();
    snow.dispose();
    lamps.dispose();
    sunLight.dispose();
    hemi.dispose();
  };

  apply(STILL_AIR);
  return {
    apply,
    setGround,
    setSkyLook,
    setRange,
    fogFar: () => fog.far,
    setFogRange,
    withHaze,
    setSky,
    carTint: () => carTintFor(preset),
    shadows,
    dustTint: () => dustTintFor(preset),
    highTint: () => highLightFor(preset, eyeY + 400),
    ceiling: () => preset.deck?.base ?? Infinity,
    lampStage: () => lamps.stage(),
    setCompany: (metres) => {
      // A stop moved is a car repainted: the beams are the lamps' own to
      // re-dress, the lenses and the blooms are the renderer's.
      if (lamps.setCompany(metres)) relit();
    },
    onRelight: (cb) => {
      relit = cb;
    },
    lampPower,
    rainfall: () => preset.rain,
    snowing: () => flakes,
    flash: () => storm.surge(),
    flashFrom: () => storm.from(),
    sunHour: () => litHour,
    setEffects: (scale) => {
      effects = scale;
    },
    onThunder: (play) => {
      playThunder = play;
    },
    setGrime: lamps.setGrime,
    setLampsBroken: lamps.setBroken,
    setLampPlan: lamps.setPlan,
    setLighting,
    lightDust: (car) => {
      // The same switches the beams are on — the lamps are lit or they are
      // not, and what daylight, a caked lens and the crash leave of them is
      // the same arithmetic the spotlights use. One pair rather than every
      // real beam: see dust-light.ts. The brakes count here too, and they
      // are the reason a rival's cloud goes hard red the instant they lift
      // for a corner ahead of you.
      if (lamps.stage() === "off") return;
      const { front, rear } = lamps.shares(lampPower(), car.braking);
      hangDustLamps(car, front, rear);
    },
    update,
    dispose,
  };
}

function smooth(t: number): number {
  const x = t < 0 ? 0 : t > 1 ? 1 : t;
  return x * x * (3 - 2 * x);
}
