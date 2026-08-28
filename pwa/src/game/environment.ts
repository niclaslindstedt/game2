// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The atmosphere: time of day and weather turned into light and sky. The
// target look is Sega Rally's chunky saturated world sitting inside
// Valheim's air — a gradient sky dome whose horizon glows around the sun,
// colored distance fog, a sun (or moon) with a soft halo, stars, wind-blown
// clouds, hemisphere + directional lighting over the Lambert world, storm
// lightning, and headlights when the light is gone. Everything here is
// presentation: it reads GameState (env, wind, car) and never writes it.

import * as THREE from "three";
import type { GameState, RaceEnv, Season, TimeOfDay, Weather } from "@engine";

import { glowTexture } from "./textures.ts";

/** Where the sun/moon sits on the compass, radians — fixed for every stage
 * so dawn and dusk always have a lit side; stages bend enough that every
 * run crosses the light at some point. */
const SUN_AZIMUTH = 0.9;
const DOME_RADIUS = 560;

type Preset = {
  zenith: number;
  horizon: number;
  /** Horizon glow color around the sun's azimuth, and how far it spreads. */
  glow: number;
  glowStrength: number;
  /** The directional "sun" (the moon at night). */
  sun: number;
  sunIntensity: number;
  /** Radians above the horizon. */
  sunElevation: number;
  hemiSky: number;
  hemiGround: number;
  hemiIntensity: number;
  fog: number;
  fogNear: number;
  fogFar: number;
  /** The visible disc and its halo. */
  disc: number;
  discSize: number;
  halo: number;
  haloSize: number;
  haloOpacity: number;
  /** 0–1 star opacity. */
  stars: number;
  cloud: number;
  cloudOpacity: number;
  headlights: boolean;
};

// The four times of day, authored for clear weather. Dawn is Valheim's
// misty peach morning; day is the bright arcade baseline; dusk is the Sega
// Rally mountain sunset (magenta clouds over a purple sky); night is a
// moonlit blue that stays readable.
const PRESETS: Record<TimeOfDay, Preset> = {
  dawn: {
    zenith: 0x5f7fc0,
    horizon: 0xffc9a0,
    glow: 0xff9a58,
    glowStrength: 1.1,
    sun: 0xffc08a,
    sunIntensity: 1.3,
    sunElevation: 0.14,
    hemiSky: 0xd8dcff,
    hemiGround: 0x8a7a66,
    hemiIntensity: 0.72,
    fog: 0xf0c8a6,
    fogNear: 70,
    fogFar: 400,
    disc: 0xffe0b8,
    discSize: 26,
    halo: 0xffa060,
    haloSize: 170,
    haloOpacity: 0.55,
    stars: 0,
    cloud: 0xffd9c0,
    cloudOpacity: 1,
    headlights: false,
  },
  day: {
    zenith: 0x1f7fe0,
    horizon: 0xbfe3ff,
    glow: 0xfff3c8,
    glowStrength: 0.35,
    sun: 0xfff2d8,
    sunIntensity: 1.5,
    sunElevation: 0.95,
    hemiSky: 0xffffff,
    hemiGround: 0xb0a894,
    hemiIntensity: 0.95,
    fog: 0xbfe3ff,
    fogNear: 160,
    fogFar: 520,
    disc: 0xfff8dc,
    discSize: 18,
    halo: 0xfff3c8,
    haloSize: 110,
    haloOpacity: 0.35,
    stars: 0,
    cloud: 0xffffff,
    cloudOpacity: 1,
    headlights: false,
  },
  dusk: {
    zenith: 0x3a2f6e,
    horizon: 0xff6a3d,
    glow: 0xff4f5a,
    glowStrength: 1.25,
    sun: 0xff9663,
    sunIntensity: 1.15,
    sunElevation: 0.09,
    hemiSky: 0xc9a0c8,
    hemiGround: 0x6e5a4a,
    hemiIntensity: 0.62,
    fog: 0xe08a6a,
    fogNear: 90,
    fogFar: 430,
    disc: 0xffb36a,
    discSize: 30,
    halo: 0xff5f46,
    haloSize: 210,
    haloOpacity: 0.6,
    stars: 0.15,
    cloud: 0xd86a8a,
    cloudOpacity: 1,
    headlights: true,
  },
  night: {
    zenith: 0x0a1230,
    horizon: 0x1d2d55,
    glow: 0x9fb6ff,
    glowStrength: 0.5,
    sun: 0xb8ccff,
    sunIntensity: 0.55,
    sunElevation: 0.65,
    hemiSky: 0x3a5580,
    hemiGround: 0x1e2840,
    hemiIntensity: 0.55,
    fog: 0x101c38,
    fogNear: 80,
    fogFar: 380,
    disc: 0xeef2ff,
    discSize: 14,
    halo: 0xb8ccff,
    haloSize: 95,
    haloOpacity: 0.4,
    stars: 1,
    cloud: 0x2b3a5a,
    cloudOpacity: 0.85,
    headlights: true,
  },
};

/** Weather sits on top of the time of day: rain greys and closes the air,
 * a storm nearly shuts it — sun hidden, fog tight, everything cold. */
function weathered(time: TimeOfDay, weather: Weather): Preset {
  const p = { ...PRESETS[time] };
  if (weather === "clear") return p;
  const grey = weather === "rain" ? 0x9aa4b0 : 0x59616e;
  const mix = weather === "rain" ? 0.45 : 0.62;
  const dim = weather === "rain" ? 0.78 : 0.6;
  const toward = (c: number): number =>
    new THREE.Color(c).lerp(new THREE.Color(grey), mix).getHex();
  p.zenith = toward(p.zenith);
  p.horizon = toward(p.horizon);
  p.glow = toward(p.glow);
  p.glowStrength *= 0.4;
  p.sun = toward(p.sun);
  p.sunIntensity *= dim;
  p.hemiSky = toward(p.hemiSky);
  p.hemiGround = toward(p.hemiGround);
  p.hemiIntensity *= weather === "rain" ? 0.9 : 0.8;
  p.fog = toward(p.fog);
  p.fogNear *= weather === "rain" ? 0.6 : 0.42;
  p.fogFar *= weather === "rain" ? 0.62 : 0.46;
  p.haloOpacity *= weather === "rain" ? 0.25 : 0;
  p.discSize = weather === "rain" ? p.discSize * 0.7 : 0;
  p.stars *= weather === "rain" ? 0.2 : 0;
  p.cloud = toward(p.cloud);
  return p;
}

// ── The seasons, as astronomy rather than art direction ───────────────────
// The single biggest difference between a May stage and a September one is
// not the leaves — it is where the sun IS. A taiga rally is run at around
// 62°N (central Scandinavia), and the sun's noon elevation there is
// 90° − latitude + declination. The declination runs from +23.44° at the
// summer solstice down through zero at the equinoxes, so:
//
//   mid-May          90 − 62 + 17.5  ≈ 45° above the horizon at noon
//   summer solstice  90 − 62 + 23.4  ≈ 51°
//   late September   90 − 62 −  1.8  ≈ 26°
//
// Half the height, at the season the north's colour peaks. Everything else
// here falls out of that one number: longer shadows, a dimmer and warmer
// beam, and a colder, lower key over the whole landscape.

/** Where the taiga is, degrees north. */
const LATITUDE = 62;

/** The sun's declination in the middle of each season, degrees — mid-May,
 * the June solstice, and the last week of September, which is when "ruska"
 * (the north's autumn colour) peaks. Winter is not a season of this biome:
 * the boreal forest under snow is the arctic one. */
const DECLINATION: Record<Season, number> = { spring: 17.5, summer: 23.4, autumn: -1.8 };

/** The sine of the noon solar elevation — which is both how high the sun
 * gets and, because irradiance on flat ground goes as the cosine of the
 * zenith angle, how much of its light lands there. */
function noonSun(season: Season): number {
  return Math.sin(((90 - LATITUDE + DECLINATION[season]) * Math.PI) / 180);
}

/** Rayleigh optical depth of the whole clear atmosphere at sea level, per
 * air mass, at the wavelengths the renderer's three channels stand for
 * (~650, 550 and 450 nm). Scattering goes as λ⁻⁴, so blue is stripped out
 * of a beam about four and a half times as fast as red — which is why the
 * sky is blue, why a low sun is orange, and why a September noon is warmer
 * than a June one before a single cloud is involved. */
const RAYLEIGH = { r: 0.049, g: 0.097, b: 0.221 };

/** The season sits UNDER the time of day: it decides how high the sun gets
 * at all, and the time of day then says where along that arc it is. So the
 * elevation is SCALED rather than shifted — a dawn sun sits on the horizon
 * in every season; it is the noon one that moves — and the extra air the
 * lower beam has to come through is charged once, at the season's own noon,
 * rather than compounded onto a dawn that is already the length of the
 * atmosphere. */
function seasoned(p: Preset, season: Season): Preset {
  if (season === "summer") return p;
  const here = noonSun(season);
  const peak = noonSun("summer");
  p.sunElevation = Math.asin(Math.min(1, Math.sin(p.sunElevation) * (here / peak)));
  // Air mass is 1/sin(elevation): the path a beam takes through the
  // atmosphere, in units of the straight-up one.
  const extraAir = 1 / here - 1 / peak;
  const through = (depth: number): number => Math.exp(-depth * extraAir);
  const tr = through(RAYLEIGH.r);
  const tg = through(RAYLEIGH.g);
  const tb = through(RAYLEIGH.b);
  // What survives the trip, channel by channel. Applied to the sun's COLOR
  // rather than its intensity because that is what it physically is: a beam
  // that has lost more blue than red is both warmer and weaker, and one
  // multiply says both.
  const sun = new THREE.Color(p.sun);
  p.sun = sun.setRGB(sun.r * tr, sun.g * tg, sun.b * tb).getHex();
  const mix = (c: number, toward: number, t: number): number =>
    new THREE.Color(c).lerp(new THREE.Color(toward), t).getHex();
  if (season === "autumn") {
    // September air in the north is dry and clean — the humidity and the
    // pollen haze of high summer are gone — so the sky reads deeper and
    // the view opens out, while the low sun warms the horizon band.
    p.zenith = mix(p.zenith, 0x0f5fb0, 0.22);
    p.horizon = mix(p.horizon, 0xffd9a8, 0.2);
    p.fog = mix(p.fog, 0xe8d3ac, 0.18);
    p.fogFar *= 1.08;
    // Skylight is the other half of the key, and there is less of it under
    // a low sun. The ground BOUNCES a different colour too: what comes back
    // up off a straw-and-bilberry landscape is warm, not green.
    p.hemiIntensity *= 0.88;
    p.hemiGround = mix(p.hemiGround, 0xa8843f, 0.5);
    p.cloud = mix(p.cloud, 0xffe6cc, 0.15);
  } else {
    // May: the air still carries haze and birch pollen, so the sky is
    // milkier and the distance closes in a little.
    p.zenith = mix(p.zenith, 0x8fb4dc, 0.16);
    p.fog = mix(p.fog, 0xd8e2e8, 0.12);
    p.fogFar *= 0.94;
    p.hemiIntensity *= 0.97;
    p.hemiGround = mix(p.hemiGround, 0x9a9060, 0.35);
  }
  return p;
}

/** How dark the car is ever allowed to get, as a fraction of its daylight
 * paint. Everything else in the world is lit by the scene's own lights and
 * simply goes where they go; the car cannot, and past this it stops reading
 * as a car and starts reading as a silhouette with tail lamps. */
const CAR_FLOOR = 0.2;

/** The light a preset actually puts on a horizontal surface: the sky half
 * of the hemisphere plus what is left of the sun at its elevation. Linear
 * light, because that is the space three.js multiplies colors in. */
function keyLight(p: Preset): THREE.Color {
  const sky = new THREE.Color(p.hemiSky).multiplyScalar(p.hemiIntensity);
  const sun = new THREE.Color(p.sun).multiplyScalar(
    p.sunIntensity * Math.max(0, Math.sin(p.sunElevation)),
  );
  return sky.add(sun);
}

/** What the failing light does to the CAR. The body is fullbright — its
 * shading is baked into vertex colors so the arcade look never pops — which
 * means no light in the scene can reach it: at dusk the whole world goes
 * down and the car alone stays at noon, sitting on the landscape like a
 * sticker. This is the light put back on it: the preset's OWN key, measured
 * against the day preset's, so the car is as dark as the ground it stands
 * on and any retune of the lighting (or of the weather that dims it) is
 * carried onto the paint for free. */
function carTintFor(p: Preset): THREE.Color {
  const here = keyLight(p);
  const noon = keyLight(PRESETS.day);
  const ratio = (a: number, b: number): number =>
    CAR_FLOOR + (1 - CAR_FLOOR) * Math.min(1, b > 0 ? a / b : 1);
  return new THREE.Color(ratio(here.r, noon.r), ratio(here.g, noon.g), ratio(here.b, noon.b));
}

/** Direction from the origin toward the sun for elevation `el`. */
function sunDir(el: number): THREE.Vector3 {
  const c = Math.cos(el);
  return new THREE.Vector3(Math.sin(SUN_AZIMUTH) * c, Math.sin(el), Math.cos(SUN_AZIMUTH) * c);
}

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
  /** Whether the run's light is gone and the car has its lights on. */
  lampsLit: () => boolean;
  /** How filthy the car is, 0..1 — every beam fades under a caked lens. */
  setGrime: (level: number) => void;
  /** How far off the centerline the car's lamps sit, m — front and rear. */
  setLampSpread: (front: number, rear: number) => void;
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
  // warm bleed around the sun's azimuth — the Valheim glow.
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
    for (let i = 0; i < ridgeShade.length; i++) {
      rock
        .copy(fogColor)
        .lerp(zenith, ridgeHaze[i])
        .multiplyScalar(ridgeTone[i] * ridgeShade[i]);
      colors.setXYZ(i, rock.r, rock.g, rock.b);
    }
    colors.needsUpdate = true;
  };

  // ── Clouds: cumulus clusters, not single blobs. Each cloud is a handful
  // of overlapping puffs — big lumps in the middle, smaller ones at the
  // ends, undersides in a shaded material and sliced flat — and every
  // cloud rides the wind at its own pace and altitude.
  //
  // The whole sky is TWO draw calls: one instanced mesh for the lit puffs,
  // one for the shaded undersides. A puff is rigid against its cluster, so
  // it carries a fixed shape matrix and the wind ride below only rewrites
  // the translation column.
  const cloudGroup = new THREE.Group();
  const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, fog: false });
  const cloudBaseMat = new THREE.MeshBasicMaterial({
    color: 0xdde4ee,
    transparent: true,
    fog: false,
  });
  const cloudGeo = new THREE.SphereGeometry(1, 8, 6);
  /** One puff: where it sits inside its cluster (already turned by the
   * cluster's own heading), the shape it holds there, and which instance
   * of which mesh draws it. */
  type Puff = { at: THREE.Vector3; shape: THREE.Matrix4; shaded: boolean; index: number };
  type Cloud = {
    angle: number;
    radius: number;
    speed: number;
    y: number;
    /** The sphere the whole cluster fits inside, m: the furthest lump
     * along its axis plus that lump's own radius, rounded up. */
    reach: number;
    puffs: Puff[];
  };
  const cloudList: Cloud[] = [];
  const CLOUDS = 22;
  let litCount = 0;
  let shadedCount = 0;
  const scale = new THREE.Vector3();
  const ORIGIN = new THREE.Vector3();
  const SKY_UP = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < CLOUDS; i++) {
    // Whole-cluster scale spread, in metres — read against the ring radius
    // below, which is what decides how big one looks.
    const size = 40 + Math.random() * 74;
    const puffCount = 4 + Math.floor(Math.random() * 4);
    const puffs: Puff[] = [];
    const cloudSpin = new THREE.Quaternion().setFromAxisAngle(SKY_UP, Math.random() * Math.PI * 2);
    const place = (
      shaded: boolean,
      x: number,
      y: number,
      z: number,
      sx: number,
      sy: number,
      sz: number,
    ): void => {
      puffs.push({
        at: new THREE.Vector3(x, y, z).applyQuaternion(cloudSpin),
        shape: new THREE.Matrix4().compose(ORIGIN, cloudSpin, scale.set(sx, sy, sz)),
        shaded,
        index: shaded ? shadedCount++ : litCount++,
      });
    };
    for (let p = 0; p < puffCount; p++) {
      // Lumps along a rough axis: tall near the middle, trailing off at
      // the ends; every puff keeps a flat shared base line.
      const along = (p / (puffCount - 1) - 0.5) * 2;
      const bulk = 0.55 + (1 - Math.abs(along)) * 0.6 + Math.random() * 0.25;
      const px = along * size * (0.8 + Math.random() * 0.25);
      const pz = (Math.random() - 0.5) * size * 0.4;
      const r = bulk * size * 0.52;
      place(false, px, bulk * size * 0.3, pz, r, r * 0.72, r);
      // The shaded underside: a flatter, darker puff tucked below, on the
      // same axis line as the lump it sits under.
      place(
        true,
        px,
        bulk * size * 0.06,
        pz,
        bulk * size * 0.5,
        bulk * size * 0.22,
        bulk * size * 0.5,
      );
    }
    // Where the cluster rides. A cloud is SKY: it has to sit beyond every
    // ridge ring (which top out at 552 m) or it is an opaque white drum
    // parked on the hills, hard-facetted and half of it sliced away by the
    // mountain it is standing in. Out here it is farther than the horizon
    // is, so a cloud the skyline cuts into is one that is genuinely behind
    // it. Size scales with the distance, so the apparent size is the one
    // the sky was authored at, and the drift is ANGULAR, so pushing the
    // ring out does not change how fast the weather crosses the sky.
    const radius = 620 + Math.random() * 520;
    cloudList.push({
      angle: Math.random() * Math.PI * 2,
      radius,
      speed: 0.6 + Math.random() * 0.9,
      // Height as a fraction of the distance out, i.e. an elevation ANGLE
      // (about 18° to 39°): clouds belong in a band ABOVE the skyline. A
      // flat altitude puts the far ones on it, and the ridge ring opens a
      // gap toward the sun, so anything lower than the mountains shows
      // through it as a smudge sitting on the horizon.
      y: radius * (0.32 + Math.random() * 0.48),
      reach: size * 2,
      puffs,
    });
  }
  // Room for every puff there is; how many of them are DRAWN is set per
  // frame from what survives the cull. Anything past that count is left
  // alone rather than trusted to be empty — an instance nobody sets keeps
  // the identity matrix, which is a unit sphere over the start line.
  const cloudPuffs = new THREE.InstancedMesh(cloudGeo, cloudMat, litCount);
  const cloudBases = new THREE.InstancedMesh(cloudGeo, cloudBaseMat, shadedCount);
  // Culled per cluster in `placeClouds`, so three is told not to try: its
  // own test is over the whole ring, which the camera stands inside and
  // which therefore always answers yes.
  for (const mesh of [cloudPuffs, cloudBases]) mesh.frustumCulled = false;
  cloudGroup.add(cloudPuffs, cloudBases);
  group.add(cloudGroup);

  /** Slide every puff onto its cluster's current place on the ring, and
   * write only the clusters the camera can actually see.
   *
   * Culling is done HERE rather than left to three, because two instanced
   * meshes are two objects to it and both straddle the camera: the ring
   * the clouds orbit is drawn around the camera's own position, so a
   * bounding test on either mesh always answers yes. Compacting the
   * visible clusters into the front of the buffer costs nothing — the
   * matrices are rewritten every frame anyway — and halves the sky's
   * triangles for the price of 22 sphere tests. */
  const cloudFrustum = new THREE.Frustum();
  const cloudView = new THREE.Matrix4();
  const cloudWhere = new THREE.Sphere();
  const placeClouds = (camera: THREE.Camera | null): void => {
    if (camera) {
      camera.updateMatrixWorld();
      cloudFrustum.setFromProjectionMatrix(
        cloudView.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse),
      );
    }
    let litAt = 0;
    let shadedAt = 0;
    for (const cloud of cloudList) {
      const x = Math.sin(cloud.angle) * cloud.radius;
      const z = Math.cos(cloud.angle) * cloud.radius;
      if (camera) {
        // The clouds hang in the environment group, which rides the camera
        // in x and z, so a cluster's world place is that offset plus this.
        cloudWhere.center.set(group.position.x + x, cloud.y, group.position.z + z);
        cloudWhere.radius = cloud.reach;
        if (!cloudFrustum.intersectsSphere(cloudWhere)) continue;
      }
      for (const puff of cloud.puffs) {
        const m = puff.shape;
        m.elements[12] = x + puff.at.x;
        m.elements[13] = cloud.y + puff.at.y;
        m.elements[14] = z + puff.at.z;
        if (puff.shaded) cloudBases.setMatrixAt(shadedAt++, m);
        else cloudPuffs.setMatrixAt(litAt++, m);
      }
    }
    cloudPuffs.count = litAt;
    cloudBases.count = shadedAt;
    cloudPuffs.instanceMatrix.needsUpdate = true;
    cloudBases.instanceMatrix.needsUpdate = true;
  };
  placeClouds(null);

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
  const setGrime = (level: number): void => {
    grime = level < 0 ? 0 : level > 1 ? 1 : level;
  };

  // Lightning: a broad cold bloom high on the dome, plus a light surge.
  const boltMat = new THREE.MeshBasicMaterial({
    map: glowMap,
    transparent: true,
    opacity: 0,
    color: 0xdce8ff,
    fog: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const bolt = new THREE.Mesh(new THREE.PlaneGeometry(420, 420), boltMat);
  bolt.renderOrder = -2;
  bolt.visible = false;
  group.add(bolt);
  const reducedMotion =
    typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  let flash = 0;
  let nextBolt = 5;

  let preset: Preset = PRESETS.day;
  let stormy = false;
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

  const setSky = (show: boolean): void => {
    dome.visible = show;
    stars.visible = show;
    cloudGroup.visible = show;
    ridges.visible = show;
    disc.visible = show;
    halo.visible = show;
  };

  const apply = (env: RaceEnv): void => {
    preset = seasoned(weathered(env.timeOfDay, env.weather), env.season);
    stormy = env.weather === "storm";
    paintDome(preset);
    background.set(preset.zenith);
    fog.color.set(preset.fog);
    applyRange();
    hemi.color.set(preset.hemiSky);
    hemi.groundColor.set(preset.hemiGround);
    hemi.intensity = preset.hemiIntensity;
    sunLight.color.set(preset.sun);
    sunLight.intensity = preset.sunIntensity;
    const dir = sunDir(preset.sunElevation);
    sunLight.position.copy(dir).multiplyScalar(300);
    starMat.opacity = preset.stars;
    paintRidges(preset);
    cloudMat.color.set(preset.cloud);
    cloudMat.opacity = preset.cloudOpacity;
    cloudBaseMat.color.set(preset.cloud).multiplyScalar(0.8);
    cloudBaseMat.opacity = preset.cloudOpacity;
    // The disc and halo park where the light comes from.
    const sky = dir.clone().multiplyScalar(DOME_RADIUS * 0.86);
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
    flash = 0;
    boltMat.opacity = 0;
    bolt.visible = false;
  };

  const update = (state: GameState, camera: THREE.Camera, dt: number): void => {
    const cam = camera.position;
    group.position.set(cam.x, 0, cam.z);
    disc.lookAt(cam);
    halo.lookAt(cam);
    bolt.lookAt(cam);

    // Clouds ride the wind, each at its own pace — the sky drifts as a
    // population, never as one rigid ring.
    const windSpeed = Math.hypot(state.wind.x, state.wind.z);
    for (const cloud of cloudList) {
      cloud.angle += (0.0035 + windSpeed * 0.0014) * cloud.speed * dt;
    }
    // Under the map view the sky is off, and placing puffs nobody draws is
    // the one part of the ride worth skipping.
    if (cloudGroup.visible) placeClouds(camera);

    // Headlights track the nose, tail lamps the tail. Each pair's beams carry
    // half of what the single light used to, so the road ahead is as bright
    // as it was — it is just lit by two lamps instead of one.
    if (preset.headlights) {
      const car = state.car;
      const fwd = { x: Math.sin(car.heading), z: Math.cos(car.heading) };
      const right = { x: fwd.z, z: -fwd.x };
      aimLamps(headlights, car, fwd, right, {
        intensity: 150 * (1 - HEAD_GRIME * grime),
        spread: headSpread,
        from: 1.4,
        up: 0.8,
        to: 32,
        down: -1.5,
        splay: 5,
      });
      aimLamps(taillights, car, fwd, right, {
        intensity: 20 * (1 - TAIL_GRIME * grime),
        spread: tailSpread,
        from: -1.6,
        up: 0.55,
        to: -8,
        down: -1,
        splay: 2.2,
      });
    }

    // Thunder: a storm builds toward a strike, the strike floods the light
    // and blooms on the dome, then decays. Reduced motion keeps the storm
    // without the hard flash.
    if (stormy) {
      nextBolt -= dt;
      if (nextBolt <= 0) {
        nextBolt = 6 + Math.random() * 9;
        flash = reducedMotion ? 0.25 : 1;
        const a = Math.random() * Math.PI * 2;
        bolt.position.set(Math.sin(a) * 300, 170 + Math.random() * 90, Math.cos(a) * 300);
        bolt.visible = true;
      }
      if (flash > 0) {
        flash = Math.max(0, flash - (reducedMotion ? 1.8 : 4.5) * dt);
        const surge = flash * flash;
        hemi.intensity = preset.hemiIntensity * (1 + surge * 2.2);
        sunLight.intensity = preset.sunIntensity * (1 + surge * 1.6);
        boltMat.opacity = surge * 0.9;
        if (flash === 0) bolt.visible = false;
      }
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
    bolt.geometry.dispose();
    boltMat.dispose();
    cloudGeo.dispose();
    cloudMat.dispose();
    cloudBaseMat.dispose();
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
    setSky,
    carTint: () => carTintFor(preset),
    lampsLit: () => preset.headlights,
    setGrime,
    setLampSpread,
    update,
    dispose,
  };
}
