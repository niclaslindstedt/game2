// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The atmosphere: time of day and weather turned into light and sky. The
// target look is Sega Rally's chunky saturated world sitting inside
// Valheim's air — a gradient sky dome whose horizon glows around the sun,
// colored distance fog, a sun (or moon) with a soft halo, stars, wind-blown
// clouds, hemisphere + directional lighting over the Lambert world, storm
// lightning, and headlights when the light is gone. Everything here is
// presentation: it reads GameState (env, wind, car) and never writes it.

import * as THREE from "three";
import type { GameState, RaceEnv, TimeOfDay, Weather } from "@engine";

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

  // ── Distant mountains: two silhouette ridge rings riding the horizon.
  // Camera-locked like the dome (infinitely far), tinted per preset so they
  // read through the atmosphere — hazier behind, moodier in front.
  const buildRidge = (radius: number, lift: number, jag: number): THREE.Mesh => {
    const STEPS = 110;
    const positions: number[] = [];
    const indices: number[] = [];
    const p1 = Math.random() * Math.PI * 2;
    const p2 = Math.random() * Math.PI * 2;
    const p3 = Math.random() * Math.PI * 2;
    for (let i = 0; i <= STEPS; i++) {
      const a = (i / STEPS) * Math.PI * 2;
      const wave =
        Math.sin(a * 3 + p1) * 0.45 + Math.sin(a * 7 + p2) * 0.35 + Math.sin(a * 13 + p3) * 0.2;
      // The ridge opens toward the sun's azimuth — a sea gap, so a low dawn
      // or dusk sun always has a horizon to sit on instead of a rock wall.
      const gap = 1 - 0.92 * Math.pow(Math.max(0, Math.cos(a - SUN_AZIMUTH)), 5);
      const h = Math.max(3, (lift + wave * jag) * gap);
      const x = Math.sin(a) * radius;
      const z = Math.cos(a) * radius;
      positions.push(x, -6, z, x, h, z);
      if (i > 0) {
        const b = (i - 1) * 2;
        indices.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
      }
    }
    const ridgeGeo = new THREE.BufferGeometry();
    ridgeGeo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    ridgeGeo.setIndex(indices);
    const ridgeMat = new THREE.MeshBasicMaterial({ fog: false, side: THREE.DoubleSide });
    const ridge = new THREE.Mesh(ridgeGeo, ridgeMat);
    ridge.renderOrder = -1;
    return ridge;
  };
  const ridgeFar = buildRidge(520, 70, 95);
  const ridgeNear = buildRidge(430, 38, 70);
  group.add(ridgeFar, ridgeNear);

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
    const size = 14 + Math.random() * 26; // whole-cluster scale spread
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
    cloudList.push({
      angle: Math.random() * Math.PI * 2,
      radius: 190 + Math.random() * 240,
      speed: 0.6 + Math.random() * 0.9,
      y: 85 + Math.random() * 60,
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
    ridgeFar.visible = show;
    ridgeNear.visible = show;
    disc.visible = show;
    halo.visible = show;
  };

  const apply = (env: RaceEnv): void => {
    preset = weathered(env.timeOfDay, env.weather);
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
    // Mountains: the far ridge is mostly atmosphere, the near one keeps
    // more of its own dark mass.
    (ridgeFar.material as THREE.MeshBasicMaterial).color
      .set(preset.fog)
      .lerp(new THREE.Color(preset.zenith), 0.3);
    (ridgeNear.material as THREE.MeshBasicMaterial).color
      .set(preset.fog)
      .lerp(new THREE.Color(preset.zenith), 0.55)
      .multiplyScalar(0.82);
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
    for (const ridge of [ridgeFar, ridgeNear]) {
      ridge.geometry.dispose();
      (ridge.material as THREE.MeshBasicMaterial).dispose();
    }
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

  apply({ timeOfDay: "day", weather: "clear", windDir: 0, windSpeed: 0, gustPhase: 0 });
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
