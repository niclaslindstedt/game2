// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The atmosphere: the sky a run is driven under, built out of the colours
// `sky.ts` works out for its conditions AT THIS MOMENT. The target look is
// Sega Rally's chunky saturated world sitting inside Valheim's air — a sky
// whose horizon glows around the sun, colored distance fog, a sun (or moon)
// with a soft halo, stars, a horizon of ridge silhouettes, and the cars'
// lamps coming up through their two stops as the light goes.
//
// THE SUN MOVES, and it moves FAST: one minute of racing is one hour of sun
// (`sunHourAt`), which through a spring sunrise is ten degrees of elevation
// a minute. So the preset is not applied once per stage but read off the
// race clock, and everything hung on it — the lights, the dome, the ridges,
// the fog, the lamps' switch — follows. A stage started at sunset is driven
// down the ladder into the dark without a cut.
//
// Which is the whole difficulty: at that pace nothing here may arrive in
// STEPS. The frame is split in two for it. `advance` is the light itself —
// the palette, the air's colour and reach, the mist, the dome's uniforms —
// and runs every frame, because half of what is done with the sun is a
// steep function of its elevation (a ridge cutting the beam, a cloud sea
// catching the first of it) and a sun delivered four times a second walked
// those up a tenth at a time. `repaint` is everything that has to be LAID
// DOWN again rather than told a number — the ridges' vertex colours, the
// stars, the cars' paint — and runs at `RELIGHT_EVERY`, where a step is a
// shade of 255 and no eye finds it.
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
  biomeRules,
  fallsAsSnow,
  rainsIn,
  sandVisibility,
  snowCoverAt,
  sunHourAt,
  temperatureAt,
  type BiomeId,
  type GameState,
  type RaceEnv,
} from "@engine";

import { createCarLamps } from "./car-lamps.ts";
import { glassSky } from "./car/glass-reflect.ts";
import { createClouds } from "./clouds.ts";
import { dressSky, sunOcclusion, type SkyDressing } from "./cloud-field.ts";
import { horizonCrossing, hoursToTurn, litAt, sunAt } from "./daylight.ts";
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
import { createNightSky } from "./night-sky.ts";
import { createRain } from "./rain.ts";
import { createSandAir } from "./sand-air.ts";
import { createSnowfall } from "./snowfall.ts";
import { createSkyShell, litLayers, type DrawnLayer } from "./sky-shader.ts";
import { SKY_ORDER, drawAsBackdrop } from "./sky-depth.ts";
import { createStorm } from "./storm.ts";
import { skyTurnAt, turnBasis } from "./starfield.ts";
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
import { createSunShadows } from "./car-shadow.ts";
import { fogRangeFor, SKY_LOOK, type VideoSettings } from "./settings.ts";
import { coverOf, precipReach, squallOf, type Clap } from "./weather.ts";
import { glowTexture } from "./textures.ts";

import {
  FLASH_COLOR,
  OCCLUSION_RATE,
  RELIGHT_EVERY,
  REMARCH_EVERY,
  RINGS_TAKEN,
  SAND_AIR,
  SAND_SKY,
  STILL_AIR,
  VEIL_RATE,
  VEIL_STEP,
  type Environment,
  type Ground,
} from "./environment-face.ts";

export type { Environment, Ground } from "./environment-face.ts";

// Before any material compiles: three resolves the fog chunk at compile
// time, and the ground's mist and shadows ride on the replaced one.
installHeightFog();

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

  // ── The night sky the simple one flies ───────────────────────────────────
  // BACKDROP, all of it: the stars, the Milky Way, the sun and its halo ride
  // the stack sky-depth.ts owns — last in the opaque pass, depth-tested at
  // the far plane — so a mountain occludes the sun however far off it
  // stands, and none of them is shaded on a pixel the country already
  // covers. They stay OUT of the transparent pass: marked `transparent`
  // they would be depth-tested at their own distance instead, which is
  // `DOME_RADIUS` and a bit, under 500 m — and a ridge further off than
  // that would have the sun shining through it. The blend modes are
  // additive because a material that is not `transparent` gets NO blending
  // under normal mode, and the night sky and the halo fade by opacity.
  const night = createNightSky();
  eye.add(night.group);

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
  // ...and the desert's own weather, which is neither: a wall of the
  // country in the air, and the country streaming past the glass once it
  // arrives (`engine/game/sandstorm.ts` runs it; this draws it). In the
  // world rather than on the camera group for the rain's reason — the
  // grains are metres from the lens and are drawn at the velocity the
  // camera sees them at.
  const sandAir = createSandAir();
  scene.add(sandAir.grains);
  scene.add(sandAir.wall);
  /** How much of the air is sand this instant, and what is left of the
   * visibility because of it (`sandVisibility`). Held here because the fog
   * range, the sky's colour and the grains all read the same two numbers. */
  let sandNow = 0;
  let sandSeen = 1;
  let effects = 1;

  let playThunder: (clap: Clap) => void = () => {};
  const storm = createStorm((clap) => playThunder(clap));
  group.add(storm.group);

  // ── Lights ───────────────────────────────────────────────────────────────
  const hemi = new THREE.HemisphereLight(0xffffff, 0xb0a894, 0.95);
  /** R47 — THE BOUNCE OFF THE SNOW. The hemisphere's lower half is the
   * light coming back UP off the ground, and what the ground is decides how
   * much of it there is: bare country returns about a fifth of what falls
   * on it, snow returns most of it. That is the whole reason a snowfield
   * looks bright under a sun too low to light anything else, why its
   * shadows are soft, and why they are BLUE — what fills them is skylight
   * bounced off white.
   *
   * Without it a winter is a beige country: the paint is white, the low
   * sun is warm and weak, and nothing lifts the shadow side of anything.
   * `lift` is how much the hemisphere gains where the ground is fully
   * white, and `tone` the colour it returns — the snow's own, cooled,
   * because the sky it is reflecting is blue. */
  const BOUNCE = { lift: 0.38, tone: new THREE.Color(0xdfe9f5) };
  const bounceGround = new THREE.Color();
  /** Scratch for the mist's two tones and the sun in it — `advance` mixes
   * them every frame, and a colour apiece a frame is a colour apiece a
   * frame. */
  const mistLit = new THREE.Color();
  const mistShade = new THREE.Color();
  const mistSun = new THREE.Color();
  const airTone = new THREE.Color();
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
  /** The sun's clock: where it stands THIS frame, and where it stood at
   * the last repaint (`repaint`, `RELIGHT_EVERY`). */
  let hourNow = env.hour;
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
  /** WHAT THE WEATHER LEAVES OF THE VIEW, as a share of the fog's own reach
   * (`precipReach`), and the last value the RIDGE RINGS were painted for.
   *
   * The sheets of rain and snow reach a few tens of metres and stop; the
   * rest of the frame is fog, so the fog IS how the weather reads past the
   * bonnet. Held here beside the sand's pair for the same reason — the fog
   * range and the fog's colour both read it, and it moves every frame. */
  let veilNow = 1;
  let veilCut = 1;
  /** The DETAIL row's `snow` stop, as the sheet and the tone both read it. */
  let snowLit = false;
  let rangeScale = 1;
  /** Set while a view drives the fog in meters instead of by preset. */
  let absolute: { near: number; far: number } | null = null;
  /** The country's shadow, marched off the heightfield — for a sky that
   * draws it, over a stage that has one. The map holds it at TWO moments
   * of the sun and the frame reads between them, so these are the hour the
   * near half was marched for and how much of the clock the pair covers
   * (0 while there is no pair yet, which asks for one on the next frame). */
  let march: ShadowMarch | null = null;
  let shadowFrom = 0;
  let shadowSpan = 0;
  /** Scratch: where the disc parks, and where the far end of the shadow's
   * bracket stands. */
  const sunPark = new THREE.Vector3();
  const bracketB = new THREE.Vector3();

  /** THE COLOUR OF THE AIR — the sky's own, with the sand in it.
   *
   * A sandstorm does not merely take the distance away, it REPLACES it:
   * what a driver sees a hundred metres off is not a paler version of the
   * desert, it is the desert IN THE AIR, lit copper where the sun still
   * reaches it and going brown as the front thickens. That colour goes on
   * the fog and on the background at once, because between them they are
   * everything the far half of the frame is made of. */
  const applyFogTone = (): void => {
    fog.color.set(preset.fog);
    // The sky behind it goes with it: a ceiling still showing blue over a
    // brown middle distance is the one thing that gives a fog trick away.
    background.set(preset.zenith);
    // A SNOWFALL IS A COLOUR TOO, and it is the flakes' own: what a driver
    // sees a hundred metres into heavy snow is not a paler version of the
    // country, it is the snow IN THE AIR. So the distance takes the tone
    // the sheet is already drawn in (`snowTone`) rather than an authored
    // white — which is what keeps a midnight blizzard a dark blue haze
    // instead of a white wall lit by nothing. Rain gets none of this: the
    // deck's own grey is already the colour of rain in the air, and the
    // weather look has put it on the fog (`fogDeck`, sky-looks.ts).
    const white = flakes * Math.min(1, rainNow);
    if (white > 0.01) fog.color.lerp(snowTone(preset, snowLit), 0.75 * white);
    if (sandNow <= 0) return;
    fog.color.lerp(SAND_AIR, Math.min(1, sandNow * 1.15));
    background.lerp(SAND_SKY, Math.min(1, sandNow * 1.1));
  };

  /** THE SKY THE RIDGE RINGS STAND IN — the preset with whatever the air
   * actually ended up being (the snow in it, the sand in it) put back on
   * it. The rings are the far end of every sight line in the frame, so they
   * are painted against the fog rather than against the preset's own: a
   * white-out with a chain of dark peaks standing above it is the one thing
   * that gives the whole trick away, and it is the same trap the deck's
   * ceiling is held to two lines up. */
  const paintHorizon = (): void => {
    const air = fog.color.getHex();
    // How much of the chain the air has taken: what the weather and the
    // sand have between them left of the view, against a range that stands
    // a great deal further out than the fog ever reaches. Scaled past one
    // because the rings are not AT the fog's own distance — by the time a
    // blizzard has the view down to a third, a skyline two kilometres back
    // is not a paler skyline, it is no skyline.
    const taken = Math.min(1, (1 - Math.min(veilCut, sandSeen)) * RINGS_TAKEN);
    horizon.paint(air === preset.fog ? preset : { ...preset, fog: air }, taken);
  };

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
    // ...and a SANDSTORM shortens both on top of that. It is not a
    // preference and not a sky: it is the air actually being full of the
    // ground, so it compounds with whatever the player and the weather
    // have already asked for rather than replacing either.
    // The VEIL is applied to the preset rather than through the scale: it
    // is the weather actually in the air, so it goes where a shorter
    // preset would, under `MIN_FOG_FAR`'s floor rather than over it — the
    // floor guards what the SETTING may take, and a downpour is allowed to
    // be as short as a downpour is.
    const range = fogRangeFor(
      preset.fogNear * veilNow,
      preset.fogFar * veilNow,
      rangeScale * sandSeen,
    );
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
    night.setVisible(simple);
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

  /** R47 — how white the ground under this sky is, 0..1: the cover at the
   * country's own FLOOR (climate.ts), so the bounce only arrives once even
   * the low ground has gone over rather than when a summit has. Read off
   * the country's own zone row, which is right whatever the altitude dial
   * did to it — in a winter the climate's frost line is the lower of the
   * two and decides this on its own. */
  const whiteGround = (): number => {
    if (!ground) return 0;
    return snowCoverAt(
      { season: env.season, temperature: env.temperature },
      biomeRules(biome).land.zones,
      ground.floor,
    );
  };

  /** The hemisphere the preset asks for, with the snow's bounce added. */
  const hemiNow = (): number => preset.hemiIntensity * (1 + BOUNCE.lift * whiteGround());

  /** Put the preset's own key light back on the scene. */
  const restLight = (): void => {
    hemi.color.set(preset.hemiSky);
    hemi.groundColor.copy(bounceGround.set(0xb0a894).lerp(BOUNCE.tone, whiteGround()));
    hemi.intensity = hemiNow();
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
    const sun = sunAt(hourNow, env.season, biome);
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
    const air = airTone.set(preset.fog);
    const lit = mistLit.set(preset.cloud).lerp(air, 0.35);
    Object.assign(HEIGHT_FOG.mistLit, { x: lit.r, y: lit.g, z: lit.b });
    const shade = mistShade.set(preset.cloudShade).lerp(air, 0.5);
    Object.assign(HEIGHT_FOG.mistShade, { x: shade.r, y: shade.g, z: shade.b });
    const sunColor = mistSun.set(preset.sun);
    Object.assign(HEIGHT_FOG.sunColor, { x: sunColor.r, y: sunColor.g, z: sunColor.b });
  };

  /** HOW MUCH SUN A DRAWN SHEET GETS at its own altitude — a cirrus sheet
   * burns after the cumulus under it has gone grey, and a lid is lit from
   * above whatever the hour. Written by `shell.apply` as a flat one, so
   * every call to it is followed by one of these. */
  const litShare = (layer: DrawnLayer["layer"]): number =>
    layer.deck ? 1 : litAt(layer.altitude, preset.sunUp);

  /** THE SUN AT THIS INSTANT, and everything cheap enough to hang on it
   * every frame: the palette itself, the colour and reach of the air, the
   * dome's uniforms, the mist.
   *
   * This is the half of a relight that is a handful of arithmetic and a
   * few dozen uniform writes, and it is the half that CANNOT wait for the
   * repaint's cadence. Half of what the frame does with the sun is a steep
   * function of its elevation — the ridge cutting the beam, how much of
   * the sun a cloud sea at its own altitude still sees (`litAt`, a ramp
   * six tenths of a degree wide), where the country's shadow falls — and
   * the sun climbs ten degrees a MINUTE of racing through a spring
   * sunrise. Fed a sun that arrives four times a second, every one of
   * those walks up in steps a tenth of itself high: the valley mist stops
   * lighting up and starts flickering on. */
  const advance = (hour: number): void => {
    hourNow = hour;
    preset = skyAt(env, biome, hour);
    sunV.copy(sunDir(preset.sunUp, preset.sunBearing));
    keyV.copy(sunDir(preset.sunElevation, preset.sunAzimuth));
    applyFogTone();
    applyRange();
    applyMist();
    if (look.shader) {
      shell.apply(preset, dressing, look);
      litLayers(shell, litShare);
    } else {
      // The disc and halo park where the light comes from.
      const at = sunPark.copy(keyV).multiplyScalar(DOME_RADIUS * 0.86);
      disc.position.copy(at);
      disc.scale.setScalar(preset.discSize || 0.001);
      discMat.color.set(preset.disc);
      halo.position.copy(at);
      halo.scale.setScalar(preset.haloSize);
      haloMat.color.set(preset.halo);
      haloMat.opacity = preset.haloOpacity;
    }
  };

  /** …and the DEAR half: everything that has to be laid down again rather
   * than merely told a new number — the ridge rings' eighteen hundred
   * vertex colours, the dome's, the cloud dressing, the stars, and the
   * paint on every car in the field. At `RELIGHT_EVERY`, which is the step
   * at which none of them moves by anything an eye can find. */
  const repaint = (hour: number): void => {
    litHour = hour;
    advance(hour);
    dressing = dressSky(env, biome, coverOf(env), deckAltitude());
    rainNow = preset.rain;
    hemi.groundColor.set(preset.hemiGround);
    restLight();
    rain.setTone(rainTone(preset));
    snow.setTone(snowTone(preset, snowLit));
    paintHorizon();
    storm.apply(preset);
    lamps.setStage(preset.lamps);
    // WHERE THE SPHERE OF STARS HAS TURNED TO this hour (starfield.ts) —
    // the same answer to both skies, one as a change of basis on the dome's
    // ray and one as the rotation of the group the field is baked in.
    const turn = skyTurnAt(hour, env.season, biome);
    if (look.shader) {
      shell.setTurn(turnBasis(turn));
      shell.apply(preset, dressing, look);
      litLayers(shell, litShare);
    } else {
      paintDome(preset);
      clouds.apply(preset, dressing);
      night.apply(preset, turn, keyV);
    }
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
    repaint(env.hour);
  };

  const setGround = (next: Ground | null): void => {
    ground = next;
    march = next ? createShadowMarch(next.heightAt, SHADOW_CELLS, SHADOW_SPAN) : null;
    shadowSpan = 0;
    repaint(litHour);
  };

  const setSkyLook = (level: VideoSettings["sky"]): void => {
    look = SKY_LOOK[level];
    repaint(litHour);
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

  /** THE SUN'S DIRECTION AT AN HOUR, into `out` — the REAL sun, wherever
   * it is, which is what casts the shadow the march follows. */
  const sunAtHour = (out: THREE.Vector3, hour: number): THREE.Vector3 => {
    const sun = sunAt(hour, env.season, biome);
    return out.copy(sunDir(sun.elevation, sun.azimuth));
  };

  /** THE COUNTRY'S SHADOW: re-sample the heights when the camera has
   * walked far enough, march a fresh pair when the sun has crossed the one
   * being read, and hand the fog the map's frame and how far through that
   * pair the sun now stands.
   *
   * The pair is what keeps the terminator moving: a march is three
   * milliseconds, far too dear to redo every frame, and half a degree of
   * sun — the interval it is worth redoing at — slides a ridge's shadow
   * further down a valley wall than the shader's own penumbra is deep. So
   * the far half is marched for where the sun will be at the END of the
   * interval, and the frame reads between the two. */
  const marchShadow = (cam: THREE.Vector3): void => {
    if (!march || !look.mountainShadow || !skyShown) {
      HEIGHT_FOG.shadowFrame.w = 0;
      return;
    }
    // The window first: when it has moved, `focus` has marched both halves
    // again over the new heights, at the same pair of moments.
    const moved = march.focus(cam.x, cam.z);
    // Then how far through the pair the sun stands. Modulo the day, so a
    // clock that has wrapped past midnight — or a run started again —
    // lands past the far end and lays a fresh pair rather than reading one
    // backwards.
    let through = shadowSpan > 0 ? ((hourNow - shadowFrom + 24) % 24) / shadowSpan : 1;
    if (through >= 1) {
      // A pair that the sun has merely walked off the end of carries its
      // far half over as the new near one, which is half the marching; one
      // that never existed, or that a jumped clock has left nowhere near
      // the sun, is laid from scratch.
      const fresh = shadowSpan <= 0 || through > 1.5;
      shadowFrom = hourNow;
      shadowSpan = hoursToTurn(REMARCH_EVERY, hourNow, env.season, biome);
      const then = sunAtHour(bracketB, hourNow + shadowSpan);
      if (fresh) march.march(sunV, then);
      else march.advance(then);
      through = 0;
      writeShadowMap(march.data);
    } else if (moved) {
      writeShadowMap(march.data);
    }
    HEIGHT_FOG.shadowRange.z = through;
    HEIGHT_FOG.shadowFrame.x = march.originX;
    HEIGHT_FOG.shadowFrame.y = march.originZ;
    HEIGHT_FOG.shadowFrame.z = 1 / march.span;
    // What a shadow takes off the ground: the beam's share of its light.
    HEIGHT_FOG.shadowFrame.w = beamShareOf(preset) * beamNow();
    HEIGHT_FOG.shadowRange.x = march.lo;
    HEIGHT_FOG.shadowRange.y = march.hi - march.lo;
  };

  /** THE SHEET OVER THE EYE: the lowest one the dome is drawing above `y`,
   * or null under an open sky. What throws a shadow on the ground, and what
   * a window can see through. */
  const sheetOver = (y: number): DrawnLayer | null =>
    shell.layers().find(({ layer }) => !layer.deck && layer.altitude > y) ?? null;

  /** THE CLOUDS' SHADOW on the ground: the lowest sheet over the eye,
   * read by the fog chunk at the same offsets the dome draws it at. */
  const shadeByClouds = (cam: THREE.Vector3): void => {
    const over = sheetOver(cam.y);
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

    // THE SUN'S CLOCK. Where the sun IS is read every frame; what it
    // PAINTS is laid down again only when it has moved far enough to be
    // worth the vertices (`advance` and `repaint`).
    const hour = sunHourAt(state.env, state.t);
    const moved = Math.abs(hour - litHour);
    if (Math.min(moved, 24 - moved) >= RELIGHT_EVERY) repaint(hour);
    else advance(hour);

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
    if (night.group.visible) night.tick(dt);

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
    const airAt = temperatureAt(state.track.climate, cam.y);
    const freezing = fallsAsSnow(airAt) ? 1 : 0;
    flakes += (freezing - flakes) * Math.min(1, dt * 1.5);
    // WHAT THE SQUALL DOES TO THE DISTANCE. The sheets stop a few tens of
    // metres out; everything past that is fog, so a downpour that does not
    // move the fog is a downpour that stops at the bonnet. Eased rather
    // than snapped — the air takes a moment to thicken, and the fog range
    // is read by every material in the scene. The fog itself takes it the
    // frame it moves (`advance`); what waits for the step is the RIDGE
    // RINGS, which are eighteen hundred vertices laid again.
    veilNow += (precipReach(rainNow, flakes) - veilNow) * Math.min(1, dt * VEIL_RATE);
    if (Math.abs(veilNow - veilCut) > VEIL_STEP) {
      veilCut = veilNow;
      paintHorizon();
    }
    rain.setIntensity(effects > 0 ? rainNow * (1 - flakes) : 0);
    rain.setFlash(surge);
    rain.update(cam.x, cam.y, cam.z, state.wind.x, state.wind.z, dt);
    // THE SANDSTORM. The engine has already worked out where the front is
    // (`state.sand`); everything here is what that LOOKS like. The
    // visibility goes first and it goes fast — a haboob's leading edge
    // takes the world away in seconds — and the fog is what carries most
    // of it, because a fog range that collapses is the same thing as air
    // you cannot see through and every material in the scene already reads
    // it. The grains and the wall are what makes it read as SAND rather
    // than as a fog bank, and the wall is the half the player gets to see
    // coming.
    const seen = sandVisibility(state.sand.sand);
    if (seen !== sandSeen || state.sand.sand !== sandNow) {
      sandNow = state.sand.sand;
      sandSeen = seen;
      paintHorizon();
    }
    sandAir.set(effects > 0 ? sandNow : 0, effects > 0 ? state.sand.approach : 0);
    sandAir.update(cam.x, cam.y, cam.z, state.wind.x, state.wind.z, dt);
    snow.setIntensity(effects > 0 ? rainNow * flakes : 0);
    // WHICH crystal is falling is the air's own answer (`snowHabits`): a
    // stage at -6 falls as needles and columns where one at -15 falls as
    // the six-armed dendrites, and a camera climbing a pass drives out of
    // the one and into the other.
    snow.setHabit(airAt);
    snow.setFlash(surge);
    snow.update(cam.x, cam.y, cam.z, state.wind.x, state.wind.z, dt);
    if (surge > 0) {
      // A strike is a light SOMEWHERE, not a lift of the one that is
      // already there: the key swings round to the bolt for as long as it
      // burns, which is what puts the far side of a tree in shadow and
      // sells the flash as a place rather than as a screen wash.
      hemi.color.set(FLASH_COLOR);
      hemi.intensity = hemiNow() + 2.2 * surge;
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
    glassSky(preset, biome, skyShown, sheetOver(cam.y));
    // Last, so the map is built around wherever the light ended up.
    shadows.follow(state.car, camera);
  };

  const dispose = (): void => {
    horizon.dispose();
    domeGeo.dispose();
    domeMat.dispose();
    shell.dispose();
    night.dispose();
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
    sunHour: () => hourNow,
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
    setSnowCrystals: (on) => {
      if (on === snowLit) return;
      snowLit = on;
      snow.setCrystals(on);
      snow.setTone(snowTone(preset, snowLit));
    },
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
