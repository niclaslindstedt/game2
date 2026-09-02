// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The atmosphere: the sky a run is driven under, built out of the colours
// `sky.ts` works out for its conditions. The target look is Sega Rally's
// chunky saturated world sitting inside Valheim's air — a gradient sky dome
// whose horizon glows around the sun, colored distance fog, a sun (or moon)
// with a soft halo, stars, a horizon of ridge silhouettes, and headlights
// when the light is gone.
//
// Three neighbours own the parts that are their own craft: `sky.ts` decides
// what colour everything is, `clouds.ts` draws what is in the sky (a
// cumulus ring, or an overcast deck with scud tearing along under it), and
// `storm.ts` owns the lightning and the thunder behind it. Everything here
// is presentation: it reads GameState (env, wind, car) and never writes it.

import * as THREE from "three";
import type { GameState, RaceEnv } from "@engine";

import { createClouds } from "./clouds.ts";
import { lightDust as hangDustLamps } from "./dust-light.ts";
import { createRain } from "./rain.ts";
import { createStorm } from "./storm.ts";
import {
  carTintFor,
  dayLight,
  dustTintFor,
  DOME_RADIUS,
  rainTone,
  skyFor,
  SUN_AZIMUTH,
  sunDir,
  sunShadeFor,
  type Preset,
  type SunShade,
} from "./sky.ts";
import { squallOf, type Clap } from "./weather.ts";
import { glowTexture } from "./textures.ts";

/** What a lightning flash lights the world with while it lasts — a cold
 * blue-white that owes nothing to the time of day, because a strike is the
 * same colour at dawn as it is at midnight. */
const FLASH_COLOR = 0xdfe9ff;

export type Environment = {
  /** Re-color the whole atmosphere for the run's conditions. */
  apply: (env: RaceEnv) => void;
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
   * stars, the sun's disc and halo, the clouds, the ridge rings.
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
  /** …and where that light throws the car's shadow, and how hard (sky.ts).
   * Nothing in the scene casts a real one, so the sheet under each car is
   * drawn from this. */
  sunShade: () => SunShade;
  /** …and the darker one hanging dust takes (sky.ts's `dustTintFor`): a
   * cloud in the dark is supposed to disappear where a car is not. */
  dustTint: () => THREE.Color;
  /** Whether the run's light is gone and the car has its lights on. */
  lampsLit: () => boolean;
  /** …and how much of a beam survives the daylight it is competing with,
   * 0..1. The environment drives the player's own lamps with it; anything
   * else that lights something off a car (the field's lamps on the dust)
   * reads it here rather than keeping a second answer. */
  lampPower: () => number;
  /** How hard this stage is raining, 0..1 — what anything the weather LANDS
   * on reads, the wipers on the car's glass first among them. */
  rainfall: () => number;
  /** How bright the sky is with lightning this instant, 0..1. */
  flash: () => number;
  /** …and which way the strike lighting it is coming from. */
  flashFrom: () => THREE.Vector3;
  /** The transient-FX budget, 0..1 — the video options' own scale. At
   * nothing the rain comes off entirely, which is what the low setting
   * promises. */
  setEffects: (scale: number) => void;
  /** What to do when a clap of thunder finally arrives. Set once; the
   * environment holds no opinion about sound beyond WHEN. */
  onThunder: (play: (clap: Clap) => void) => void;
  /** How filthy the car is, 0..1 — every beam fades under a caked lens. */
  setGrime: (level: number) => void;
  /** Which of the car's lamp pairs the crash has taken out. A beam with no
   * lamp behind it lights nothing: the road ahead goes dark with the
   * headlamps, the dust behind with the tail lamps. */
  setLampsBroken: (front: boolean, rear: boolean) => void;
  /** How far off the centerline the car's lamps sit, m — front and rear. */
  setLampSpread: (front: number, rear: number) => void;
  /** Hang the PLAYER's lamps on the register the dust clouds are lit from
   * (dust-light.ts), at whatever strength the daylight and the grime on the
   * lenses leave them. The register is emptied by its one owner, the
   * renderer, so this only ever adds. */
  lightDust: (car: { x: number; y: number; z: number; heading: number }) => void;
  update: (state: GameState, camera: THREE.Camera, dt: number) => void;
  dispose: () => void;
};

export function createEnvironment(scene: THREE.Scene): Environment {
  const group = new THREE.Group(); // everything that follows the camera
  scene.add(group);

  const fog = new THREE.Fog(0xbfe3ff, 160, 520);
  scene.fog = fog;
  const background = new THREE.Color(0x3fa9f5);
  scene.background = background;

  // ── Sky dome ─────────────────────────────────────────────────────────────
  // Vertex-colored gradient, recolored per preset: horizon → zenith with a
  // warm bleed around the sun's azimuth — the Valheim glow. Under an
  // overcast sky the deck covers most of it and what is left is the band
  // above the horizon, which is exactly where a storm's light gets in.
  const domeGeo = new THREE.SphereGeometry(DOME_RADIUS, 32, 18);
  const domeColors = new Float32Array(domeGeo.getAttribute("position").count * 3);
  domeGeo.setAttribute("color", new THREE.BufferAttribute(domeColors, 3));
  const domeMat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    side: THREE.BackSide,
    fog: false,
    depthWrite: false,
  });
  const dome = new THREE.Mesh(domeGeo, domeMat);
  dome.renderOrder = -3;
  group.add(dome);

  const paintDome = (p: Preset): void => {
    const pos = domeGeo.getAttribute("position");
    const zenith = new THREE.Color(p.zenith);
    const horizon = new THREE.Color(p.horizon);
    const glow = new THREE.Color(p.glow);
    const c = new THREE.Color();
    const az = new THREE.Vector2(Math.sin(SUN_AZIMUTH), Math.cos(SUN_AZIMUTH));
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
  const starMat = new THREE.PointsMaterial({
    color: 0xdfe8ff,
    size: 1.6,
    sizeAttenuation: false,
    transparent: true,
    opacity: 0,
    fog: false,
    depthWrite: false,
  });
  const stars = new THREE.Points(starGeo, starMat);
  stars.renderOrder = -2;
  group.add(stars);

  // ── Sun / moon: a hard disc inside a soft halo, billboarded ──────────────
  const glowMap = glowTexture();
  const haloMat = new THREE.MeshBasicMaterial({
    map: glowMap,
    transparent: true,
    fog: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), haloMat);
  halo.renderOrder = -2;
  const discMat = new THREE.MeshBasicMaterial({ fog: false, depthWrite: false, transparent: true });
  const disc = new THREE.Mesh(new THREE.CircleGeometry(1, 24), discMat);
  disc.renderOrder = -1;
  group.add(halo, disc);

  // ── Distant mountains: silhouette rings riding the horizon, camera-locked
  // like the dome (infinitely far) and tinted per preset so they read
  // through the atmosphere — hazier behind, moodier in front.
  //
  // Four rings, not one: a chain has to have something BEHIND it before
  // the eye can tell how far away any of it is, and depth on a horizon is
  // the only sense of scale a stage gets. Farthest carries snow, nearest
  // is a dark band of forest on the skyline.
  //
  // The profile is RIDGED rather than wavy. A sum of sines is a rolling
  // hill, and rolling hills at that distance read as a bank of cloud;
  // folding each octave back on itself puts a crease at every summit and a
  // flat floor in every col, which is what a mountain chain looks like
  // from the valley below it.
  /** One ring's profile: where each column's foot, snowline and summit
   * sit, plus how the atmosphere has eaten into its rock. `haze` is how
   * much of the sky the ring has dissolved into and `tone` darkens what is
   * left — the two halves of aerial perspective, because near rock is not
   * just less hazy, it is darker. `shade` is the per-vertex rock/snow
   * modulation the profile itself carries. */
  type Ridge = { haze: number; tone: number };
  const ridgeShade: number[] = [];
  const ridgeHaze: number[] = [];
  const ridgeTone: number[] = [];
  const ridgePos: number[] = [];
  const ridgeIndex: number[] = [];

  const addRidge = (
    ridge: Ridge,
    radius: number,
    lift: number,
    jag: number,
    /** World height above which the rock is under snow, or null for none. */
    snowY: number | null,
  ): void => {
    const STEPS = 150;
    const OCTAVES = 4;
    const phase = Array.from({ length: OCTAVES }, () => Math.random() * Math.PI * 2);
    const base = ridgePos.length / 3;
    for (let i = 0; i <= STEPS; i++) {
      const a = (i / STEPS) * Math.PI * 2;
      let shape = 0;
      let amp = 1;
      let freq = 3;
      for (let o = 0; o < OCTAVES; o++) {
        const n = 0.5 + 0.5 * Math.sin(a * freq + phase[o]);
        // The fold: 0 at either end of the octave, 1 through the middle.
        shape += amp * (1 - Math.abs(2 * n - 1));
        amp *= 0.52;
        freq *= 2.13;
      }
      // Sharpened, so the summits are summits and the cols are broad.
      shape = Math.pow(shape / 1.9, 1.5) * 2 - 0.55;
      // The ridge opens toward the sun's azimuth — a sea gap, so a low dawn
      // or dusk sun always has a horizon to sit on instead of a rock wall.
      const gap = 1 - 0.92 * Math.pow(Math.max(0, Math.cos(a - SUN_AZIMUTH)), 5);
      const h = Math.max(3, (lift + shape * jag) * gap);
      const x = Math.sin(a) * radius;
      const z = Math.cos(a) * radius;
      // Three vertices to a column — foot, snowline, summit — so the snow
      // caps the peaks that reach it instead of bleeding down the whole
      // flank. A peak short of the line collapses its top quad to nothing.
      const line = snowY === null ? h : Math.min(h, snowY);
      ridgePos.push(x, -6, z, x, line, z, x, h, z);
      const rock = 0.92 + 0.14 * Math.min(1, h / Math.max(1, lift + jag));
      const snow = snowY !== null && h > snowY ? 1.7 : rock;
      ridgeShade.push(rock, rock, snow);
      for (let k = 0; k < 3; k++) {
        ridgeHaze.push(ridge.haze);
        ridgeTone.push(ridge.tone);
      }
      if (i > 0) {
        const b = base + (i - 1) * 3;
        ridgeIndex.push(b, b + 1, b + 3, b + 1, b + 4, b + 3);
        ridgeIndex.push(b + 1, b + 2, b + 4, b + 2, b + 5, b + 4);
      }
    }
  };

  // Every ring stands between the CLOUD RING and the DOME, and there is no
  // slack in that: a ridge inside the clouds' orbit is an opaque wall drawn
  // through them; one outside the dome is not drawn at all. So the rings
  // are packed into the band between the two, and their apparent SIZE is
  // carried by their heights rather than by how far out they stand — they
  // ride the camera, so there is no parallax between them to lose. Four
  // rings, farthest first, because a chain needs something behind it before
  // the eye can tell how far away any of it is, and depth on a horizon is
  // the only sense of scale a stage gets. The nearest is a treeline: a low
  // serrated band of forest on the last rise before the country the stage
  // is actually in.
  addRidge({ haze: 0.24, tone: 1 }, 552, 87, 118, 130);
  addRidge({ haze: 0.4, tone: 0.94 }, 536, 64, 99, 103);
  addRidge({ haze: 0.58, tone: 0.82 }, 518, 41, 75, null);
  addRidge({ haze: 0.72, tone: 0.6 }, 500, 16, 20, null);

  // All four in ONE mesh. The atmosphere they are painted with changes with
  // the conditions, but only then — so the per-ring haze and tone are baked
  // into the vertex colors on `apply` rather than carried as four materials,
  // and the whole horizon costs the frame a single draw.
  const ridgeGeo = new THREE.BufferGeometry();
  ridgeGeo.setAttribute("position", new THREE.Float32BufferAttribute(ridgePos, 3));
  ridgeGeo.setAttribute("color", new THREE.Float32BufferAttribute(ridgeShade.length * 3, 3));
  ridgeGeo.setIndex(ridgeIndex);
  const ridgeMat = new THREE.MeshBasicMaterial({
    fog: false,
    side: THREE.DoubleSide,
    vertexColors: true,
  });
  const ridges = new THREE.Mesh(ridgeGeo, ridgeMat);
  ridges.renderOrder = -1;
  group.add(ridges);

  /** Repaint the horizon for the conditions: each ring dissolved into the
   * sky by its own haze, darkened by its own tone, and the snow picked back
   * out of whatever that leaves. */
  const paintRidges = (p: Preset): void => {
    const fogColor = new THREE.Color(p.fog);
    const zenith = new THREE.Color(p.zenith);
    const rock = new THREE.Color();
    const colors = ridgeGeo.getAttribute("color") as THREE.BufferAttribute;
    // The snow's lift is a vertex colour and nothing in the scene can dim
    // it, so the sky's own light has to: a snowfield under a black storm is
    // grey, and left at its clear-day value it is the brightest thing on
    // the screen.
    const lit = 0.35 + 0.65 * dayLight(p);
    for (let i = 0; i < ridgeShade.length; i++) {
      const shade = 1 + (ridgeShade[i] - 1) * lit;
      rock
        .copy(fogColor)
        .lerp(zenith, ridgeHaze[i])
        .multiplyScalar(ridgeTone[i] * shade);
      colors.setXYZ(i, rock.r, rock.g, rock.b);
    }
    colors.needsUpdate = true;
  };

  const clouds = createClouds();
  group.add(clouds.group);

  // The rain is weather like the deck above it, so it belongs here — but it
  // lives in the WORLD rather than on the camera-riding group: a drop is a
  // few metres from the lens, where the sky's fixed-size shells are
  // hundreds, and the sheet is drawn at the velocity the camera SEES it at.
  const rain = createRain();
  scene.add(rain.lines);
  let effects = 1;

  let playThunder: (clap: Clap) => void = () => {};
  const storm = createStorm((clap) => playThunder(clap));
  group.add(storm.group);

  // ── Lights ───────────────────────────────────────────────────────────────
  const hemi = new THREE.HemisphereLight(0xffffff, 0xb0a894, 0.95);
  const sunLight = new THREE.DirectionalLight(0xfff2d8, 1.5);
  sunLight.target.position.set(0, 0, 0);
  scene.add(hemi, sunLight, sunLight.target);

  // Lights come in PAIRS, because a car has two of each. One beam on the
  // centerline throws a single symmetric pool that never breaks up, and the
  // eye reads it as a searchlight bolted to the roof rather than as the car's
  // own lamps. Two beams, splayed so their cones cross a few metres out, give
  // the double-lobed pool a car actually lays down — and they sit where the
  // lenses are, so a wide car lights a wide road.
  const beam = (color: number, distance: number, angle: number): THREE.SpotLight => {
    const light = new THREE.SpotLight(color, 0, distance, angle, 0.6, 1.2);
    light.visible = false;
    scene.add(light, light.target);
    return light;
  };
  // Headlights: warm, long, and narrow enough that the pair reads as two.
  const headlights = [beam(0xffeecb, 70, 0.42), beam(0xffeecb, 70, 0.42)];
  // ...and the tail lamps' own wash on the ground behind. A tail light is a
  // MARKER, not a driving light — it exists to be seen, not to see by — so it
  // is a fraction of the beam ahead and reaches a few car lengths at most:
  // enough that the road behind a car at night is red, never enough to light
  // the way out of a corner backwards. It comes on with the headlights,
  // because that is the switch it is wired to.
  const taillights = [beam(0xff2814, 18, 0.8), beam(0xff2814, 18, 0.8)];
  const lamps = [...headlights, ...taillights];

  /** How far off the centerline each lamp sits, m — pushed in by the renderer
   * when a car is built, because a car is as wide as it is and its beams
   * belong to its own lenses (car-body.ts owns the anchors). */
  let headSpread = 0.6;
  let tailSpread = 0.55;
  const setLampSpread = (front: number, rear: number): void => {
    headSpread = front;
    tailSpread = rear;
  };

  /** Point one pair. Each beam sits `spread` off the centerline `from` metres
   * along the car's own axis (negative is behind it) and `up` above the
   * contact patch, aiming `to` metres out and `down` below it — plus `splay`
   * further out to the side, which is the whole reason there are two. */
  type Aim = {
    intensity: number;
    spread: number;
    from: number;
    up: number;
    to: number;
    down: number;
    splay: number;
  };
  const aimLamps = (
    pair: THREE.SpotLight[],
    car: { x: number; y: number; z: number },
    fwd: { x: number; z: number },
    right: { x: number; z: number },
    aim: Aim,
  ): void => {
    for (let i = 0; i < pair.length; i++) {
      const side = i === 0 ? -1 : 1;
      const light = pair[i];
      light.intensity = aim.intensity;
      light.position.set(
        car.x + fwd.x * aim.from + right.x * side * aim.spread,
        car.y + aim.up,
        car.z + fwd.z * aim.from + right.z * side * aim.spread,
      );
      light.target.position.set(
        car.x + fwd.x * aim.to + right.x * side * aim.splay,
        car.y + aim.down,
        car.z + fwd.z * aim.to + right.z * side * aim.splay,
      );
    }
  };

  /** How filthy the car is, 0..1 — pushed in by the renderer, which is where
   * the dirt is accumulated. The lenses are under the same coat as the
   * paint, so both beams fade as the stage goes on. */
  let grime = 0;
  /** What a fully caked lens costs each beam, 0..1. The tail lamp loses more
   * of what little it has: the front is a deep reflector behind glass, the
   * rear a flat lens right above the wheel that throws the gravel. */
  const HEAD_GRIME = 0.45;
  const TAIL_GRIME = 0.6;
  /** How much of a beam survives the daylight it is competing with. A car
   * running lights under a black storm at noon still has daylight on the
   * road, and a full-strength pool under it reads as night. */
  const lampPower = (): number => 1 - 0.75 * dayLight(preset);
  const setGrime = (level: number): void => {
    grime = level < 0 ? 0 : level > 1 ? 1 : level;
  };
  /** What is left of each pair once the crash has had them: 1 or 0. */
  let headLamps = 1;
  let tailLamps = 1;
  const setLampsBroken = (front: boolean, rear: boolean): void => {
    headLamps = front ? 0 : 1;
    tailLamps = rear ? 0 : 1;
  };

  let preset: Preset = skyFor({
    timeOfDay: "day",
    weather: "clear",
    season: "summer",
    windDir: 0,
    windSpeed: 0,
    gustPhase: 0,
  });
  /** The stage's mean wind, m/s — what the live gust is read against to
   * find the squall (see `squallOf`). */
  let meanWind = 0;
  /** How hard it is coming down this instant, 0..1. */
  let rainNow = 0;
  /** True while a lightning flash owns the key light, so the preset's own
   * sun is put back exactly once when the flash is over. */
  let struck = false;
  let rangeScale = 1;
  /** Set while a view drives the fog in meters instead of by preset. */
  let absolute: { near: number; far: number } | null = null;

  const applyRange = (): void => {
    fog.near = absolute ? absolute.near : preset.fogNear * rangeScale;
    fog.far = absolute ? absolute.far : preset.fogFar * rangeScale;
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
    dome.visible = show;
    stars.visible = show;
    clouds.setVisible(show);
    storm.setVisible(show);
    ridges.visible = show;
    disc.visible = show && preset.discSize > 0;
    halo.visible = show && preset.haloOpacity > 0.01;
  };

  /** Put the preset's own key light back on the scene. */
  const restLight = (): void => {
    hemi.color.set(preset.hemiSky);
    hemi.intensity = preset.hemiIntensity;
    sunLight.color.set(preset.sun);
    sunLight.intensity = preset.sunIntensity;
    sunLight.position.copy(sunDir(preset.sunElevation)).multiplyScalar(300);
  };

  const apply = (env: RaceEnv): void => {
    preset = skyFor(env);
    meanWind = env.windSpeed;
    rainNow = preset.rain;
    paintDome(preset);
    background.set(preset.zenith);
    fog.color.set(preset.fog);
    applyRange();
    hemi.groundColor.set(preset.hemiGround);
    struck = false;
    restLight();
    starMat.opacity = preset.stars;
    rain.setTone(rainTone(preset));
    paintRidges(preset);
    clouds.apply(preset);
    storm.apply(preset);
    // The disc and halo park where the light comes from.
    const sky = sunDir(preset.sunElevation).multiplyScalar(DOME_RADIUS * 0.86);
    disc.position.copy(sky);
    disc.scale.setScalar(preset.discSize || 0.001);
    disc.visible = preset.discSize > 0;
    discMat.color.set(preset.disc);
    halo.position.copy(sky);
    halo.scale.setScalar(preset.haloSize);
    haloMat.color.set(preset.halo);
    haloMat.opacity = preset.haloOpacity;
    halo.visible = preset.haloOpacity > 0.01;
    for (const lamp of lamps) lamp.visible = preset.headlights;
  };

  const update = (state: GameState, camera: THREE.Camera, dt: number): void => {
    const cam = camera.position;
    group.position.set(cam.x, 0, cam.z);
    disc.lookAt(cam);
    halo.lookAt(cam);

    // The weather breathes with the gust that carries it: the squall is the
    // downdraught, so the sheet thickens exactly as the car is shoved.
    const squall = squallOf(state.wind, meanWind);
    rainNow = preset.rain * (0.65 + 0.5 * squall);

    // Clouds ride the wind, each at its own pace — the sky drifts as a
    // population, never as one rigid ring. Under the map view the sky is
    // off, and placing puffs nobody draws is the one part worth skipping.
    const windSpeed = Math.hypot(state.wind.x, state.wind.z);
    if (clouds.group.visible) clouds.update(windSpeed, dt, camera, group.position);

    // Headlights track the nose, tail lamps the tail. Each lamp of a pair
    // carries half the intensity the pair is worth, so the road ahead is lit
    // by two beams rather than by twice as much light.
    if (preset.headlights) {
      const car = state.car;
      const fwd = { x: Math.sin(car.heading), z: Math.cos(car.heading) };
      const right = { x: fwd.z, z: -fwd.x };
      aimLamps(headlights, car, fwd, right, {
        intensity: 150 * lampPower() * (1 - HEAD_GRIME * grime) * headLamps,
        spread: headSpread,
        from: 1.4,
        up: 0.8,
        to: 32,
        down: -1.5,
        splay: 5,
      });
      aimLamps(taillights, car, fwd, right, {
        intensity: 20 * lampPower() * (1 - TAIL_GRIME * grime) * tailLamps,
        spread: tailSpread,
        from: -1.6,
        up: 0.55,
        to: -8,
        down: -1,
        splay: 2.2,
      });
    }

    // The storm strikes on its own clock; what it hands back is how much
    // light is on the world this instant.
    storm.update(dt, camera);
    const surge = storm.surge();
    clouds.setFlash(surge);
    // The sheet rides the squall, and a strike lights it before it lights
    // anything else — the rain is the nearest thing to the lens there is.
    rain.setIntensity(effects > 0 ? rainNow : 0);
    rain.setFlash(surge);
    rain.update(cam.x, cam.y, cam.z, state.wind.x, state.wind.z, dt);
    if (surge > 0) {
      // A strike is a light SOMEWHERE, not a lift of the one that is
      // already there: the key swings round to the bolt for as long as it
      // burns, which is what puts the far side of a tree in shadow and
      // sells the flash as a place rather than as a screen wash.
      struck = true;
      hemi.color.set(FLASH_COLOR);
      hemi.intensity = preset.hemiIntensity + 2.2 * surge;
      sunLight.color.set(FLASH_COLOR);
      sunLight.intensity = preset.sunIntensity + 1.8 * surge;
      sunLight.position.copy(storm.from()).multiplyScalar(300);
    } else if (struck) {
      struck = false;
      restLight();
    }
  };

  const dispose = (): void => {
    ridgeGeo.dispose();
    ridgeMat.dispose();
    domeGeo.dispose();
    domeMat.dispose();
    starGeo.dispose();
    starMat.dispose();
    haloMat.dispose();
    disc.geometry.dispose();
    discMat.dispose();
    halo.geometry.dispose();
    clouds.dispose();
    storm.dispose();
    rain.dispose();
    for (const lamp of lamps) lamp.dispose();
    sunLight.dispose();
    hemi.dispose();
  };

  apply({
    timeOfDay: "day",
    weather: "clear",
    season: "summer",
    windDir: 0,
    windSpeed: 0,
    gustPhase: 0,
  });
  return {
    apply,
    setRange,
    fogFar: () => fog.far,
    setFogRange,
    withHaze,
    setSky,
    carTint: () => carTintFor(preset),
    sunShade: () => sunShadeFor(preset),
    dustTint: () => dustTintFor(preset),
    lampsLit: () => preset.headlights,
    lampPower,
    rainfall: () => preset.rain,
    flash: () => storm.surge(),
    flashFrom: () => storm.from(),
    setEffects: (scale) => {
      effects = scale;
    },
    onThunder: (play) => {
      playThunder = play;
    },
    setGrime,
    setLampsBroken,
    setLampSpread,
    lightDust: (car) => {
      // The same two switches the beams are on — the lamps are lit or they
      // are not, and what daylight and a caked lens leave of them is the
      // same arithmetic the spotlights use. One pair rather than the four
      // real beams: see dust-light.ts.
      if (!preset.headlights) return;
      const power = lampPower();
      hangDustLamps(
        car,
        power * (1 - HEAD_GRIME * grime) * headLamps,
        power * (1 - TAIL_GRIME * grime) * tailLamps,
      );
    },
    update,
    dispose,
  };
}
