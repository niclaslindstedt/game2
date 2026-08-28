// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT IS IN THE SKY — and there are two completely different answers,
// because a fair-weather sky and an overcast one are not the same thing at
// different densities.
//
//   THE RING   cumulus clusters floating in open air, each riding the wind
//              at its own pace and altitude. What a clear day has in it.
//   THE DECK   a LID: one continuous ceiling a few hundred metres up, whose
//              UNDERSIDE is most of what the player can see of the sky.
//              What rain and a storm have instead.
//
// When the deck is up the ring does not go away — it drops under it and
// becomes SCUD: the ragged low fragments that tear along below a cloud base
// in bad weather, darker than the ceiling they hang under and moving
// visibly faster than anything else in the frame. That contrast is most of
// what makes a storm sky read as violent rather than merely dark.
//
// Everything here rides the camera, so none of it has parallax and all of
// it is drawn at a fixed size a few hundred metres out. Three draw calls
// for the whole sky: the lit puffs, their shaded undersides, and the deck.

import * as THREE from "three";

import type { Preset } from "./sky.ts";

/** How far out the deck reaches, m. Past every ridge ring (which top out
 * around 552 m) so the mountains stand in FRONT of the ceiling, and inside
 * the far plane the cloud ring already needs. */
const DECK_RADIUS = 900;
/** How the base falls away toward the rim, as a fraction of the overhead
 * height lost at the edge. A real cloud base appears to come down to meet
 * the horizon, and a flat lid reads as a painted ceiling instead. */
const DECK_SAG = 0.72;
const DECK_RINGS = 12;
const DECK_SEGMENTS = 64;

/** How much of the overhead height the relief lumps swing through, at full
 * `relief`. Enough that a storm ceiling has shape in it, never so much that
 * the underside folds through itself. */
const DECK_LUMP = 0.14;

/**
 * HOW HIGH THE LIT RIM REACHES, radians above the horizon.
 *
 * The gradient runs on the ELEVATION of the deck above the eye, not on how
 * far out the vertex is — and the difference is the whole look. A driver
 * looks along the road, so the sky they can see is a band a few degrees
 * high: read against distance, that band is all "nearly at the rim" and the
 * whole visible ceiling comes out the rim's colour, which is a light grey
 * sky in a thunderstorm. Read against elevation, the rim is what it
 * physically is — the last few degrees where the line of sight passes out
 * from under the base — and everything above it is the black underside.
 */
const RIM_BAND = 0.16;

const CLOUDS = 22;

/** Where the scud rides under the deck, as fractions of the base height —
 * a band rather than a plane, so the fragments read at different depths. */
const SCUD_BAND = [0.42, 0.86] as const;
/** How much faster the scud tears along than the same cluster would drift
 * in open air. The wind under a cloud base is the strongest wind in the
 * frame, and this is the only place the player can SEE that. */
const SCUD_PACE = 2.6;

/** What a cumulus heap becomes when it is torn along under a ceiling:
 * pulled out sideways and squashed flat. A round puff under an overcast
 * deck reads as a boulder hanging in the sky. */
const SCUD_FLATTEN = 0.34;
const SCUD_STRETCH = 1.35;

export type Clouds = {
  group: THREE.Group;
  /** Re-dress the sky for these conditions. */
  apply: (p: Preset) => void;
  /** Ride the wind. `at` is where the camera-locked group is standing, for
   * the cluster cull. */
  update: (windSpeed: number, dt: number, camera: THREE.Camera | null, at: THREE.Vector3) => void;
  /** Light the whole ceiling up for a lightning flash, 0..1. A strike
   * inside the cloud is seen as the CLOUD going white, not as a light
   * somewhere behind it. */
  setFlash: (surge: number) => void;
  setVisible: (show: boolean) => void;
  dispose: () => void;
};

export function createClouds(): Clouds {
  const group = new THREE.Group();

  // ── The deck ─────────────────────────────────────────────────────────────
  // A fan of rings seen from underneath. Its vertices carry two baked
  // numbers apiece — how far out they are and how the relief lumps it —
  // and `apply` rewrites the colours and the height from those, so a
  // change of weather costs one pass over 800 vertices rather than a
  // rebuild.
  const deckGeo = new THREE.BufferGeometry();
  const deckVerts = DECK_RINGS * DECK_SEGMENTS + 1;
  const deckPos = new Float32Array(deckVerts * 3);
  const deckColors = new Float32Array(deckVerts * 3);
  /** Distance out as a fraction of the rim, per vertex. */
  const deckOut = new Float32Array(deckVerts);
  /** The underside's own lumpiness, -1..1 per vertex. */
  const deckLump = new Float32Array(deckVerts);
  const deckIndex: number[] = [];
  for (let ring = 0; ring < DECK_RINGS; ring++) {
    // Rings bunched toward the rim: overhead one covers a huge solid angle
    // and needs almost no tessellation, while the last few degrees above
    // the horizon are where all the perspective is.
    const u = Math.pow((ring + 1) / DECK_RINGS, 0.7);
    for (let s = 0; s < DECK_SEGMENTS; s++) {
      const i = ring * DECK_SEGMENTS + s;
      const a = (s / DECK_SEGMENTS) * Math.PI * 2;
      const r = u * DECK_RADIUS;
      deckPos[i * 3] = Math.sin(a) * r;
      deckPos[i * 3 + 2] = Math.cos(a) * r;
      deckOut[i] = u;
      deckLump[i] =
        0.5 * Math.sin(3.1 * a + 5.7 * u * Math.PI) +
        0.3 * Math.sin(7.3 * a - 3.1 * u * Math.PI + 1.7) +
        0.2 * Math.sin(13.1 * a + 9.4 * u * Math.PI + 4.2);
    }
  }
  const deckHub = deckVerts - 1;
  deckOut[deckHub] = 0;
  deckLump[deckHub] = 0.2;
  for (let s = 0; s < DECK_SEGMENTS; s++) {
    const next = (s + 1) % DECK_SEGMENTS;
    deckIndex.push(deckHub, s, next);
    for (let ring = 0; ring < DECK_RINGS - 1; ring++) {
      const a = ring * DECK_SEGMENTS + s;
      const b = ring * DECK_SEGMENTS + next;
      deckIndex.push(a, a + DECK_SEGMENTS, b, b, a + DECK_SEGMENTS, b + DECK_SEGMENTS);
    }
  }
  deckGeo.setAttribute("position", new THREE.BufferAttribute(deckPos, 3));
  deckGeo.setAttribute("color", new THREE.BufferAttribute(deckColors, 3));
  deckGeo.setIndex(deckIndex);
  const deckMat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    side: THREE.DoubleSide,
    fog: false,
    depthWrite: false,
  });
  const deck = new THREE.Mesh(deckGeo, deckMat);
  // Over the sky dome, under the mountains: the ridges stand in front of
  // the ceiling, which is what puts the weather BEHIND the landscape.
  deck.renderOrder = -2;
  deck.frustumCulled = false;
  deck.visible = false;
  group.add(deck);

  const paintDeck = (d: NonNullable<Preset["deck"]>): void => {
    const overhead = new THREE.Color(d.overhead);
    const rim = new THREE.Color(d.rim);
    const c = new THREE.Color();
    for (let i = 0; i < deckVerts; i++) {
      const u = deckOut[i];
      const y = d.base * (1 - DECK_SAG * u * u) * (1 + DECK_LUMP * d.relief * deckLump[i]);
      deckPos[i * 3 + 1] = y;
      // How high this piece of ceiling sits in the sky, radians. The hub is
      // straight overhead and every ring falls toward the horizon.
      const elevation = Math.atan2(y, Math.max(1, u * DECK_RADIUS));
      const t = 1 - Math.min(1, elevation / RIM_BAND);
      c.copy(overhead).lerp(rim, Math.pow(t, 1.5));
      // …and the lumps shade themselves, which is the difference between a
      // ceiling and a painted disc.
      const shade = 1 + 0.22 * d.relief * deckLump[i];
      deckColors[i * 3] = c.r * shade;
      deckColors[i * 3 + 1] = c.g * shade;
      deckColors[i * 3 + 2] = c.b * shade;
    }
    deckGeo.getAttribute("position").needsUpdate = true;
    deckGeo.getAttribute("color").needsUpdate = true;
  };

  // ── The ring: cumulus clusters, not single blobs ──────────────────────
  // Each cloud is a handful of overlapping puffs — big lumps in the middle,
  // smaller ones at the ends, undersides in a shaded material and sliced
  // flat — and every cloud rides the wind at its own pace and altitude.
  //
  // The whole ring is TWO draw calls: one instanced mesh for the lit puffs,
  // one for the shaded undersides. A puff is rigid against its cluster, so
  // it carries a fixed shape matrix and the wind ride below only rewrites
  // the translation column.
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
  type Puff = {
    at: THREE.Vector3;
    /** The lump as it flies in open air, and the torn-out flatter version
     * of itself it becomes when it is scud under a ceiling. A fair-weather
     * cumulus is a heap; scud is a rag. */
    shape: THREE.Matrix4;
    scud: THREE.Matrix4;
    scudAt: THREE.Vector3;
    shaded: boolean;
    index: number;
  };
  type Cloud = {
    angle: number;
    radius: number;
    speed: number;
    /** Where it flies in open air, m — and where in the scud band it drops
     * to when a deck goes up, 0..1 along that band. */
    sky: number;
    band: number;
    y: number;
    /** The sphere the whole cluster fits inside, m: the furthest lump
     * along its axis plus that lump's own radius, rounded up. */
    reach: number;
    puffs: Puff[];
  };
  const cloudList: Cloud[] = [];
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
      const at = new THREE.Vector3(x, y, z).applyQuaternion(cloudSpin);
      puffs.push({
        at,
        shape: new THREE.Matrix4().compose(ORIGIN, cloudSpin, scale.set(sx, sy, sz)),
        scud: new THREE.Matrix4().compose(
          ORIGIN,
          cloudSpin,
          scale.set(sx * SCUD_STRETCH, sy * SCUD_FLATTEN, sz * SCUD_STRETCH),
        ),
        scudAt: at.clone().setY(at.y * SCUD_FLATTEN),
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
    const band = Math.random();
    // Height as a fraction of the distance out, i.e. an elevation ANGLE
    // (about 18° to 39°): clouds belong in a band ABOVE the skyline. A
    // flat altitude puts the far ones on it, and the ridge ring opens a
    // gap toward the sun, so anything lower than the mountains shows
    // through it as a smudge sitting on the horizon.
    const sky = radius * (0.32 + band * 0.48);
    cloudList.push({
      angle: Math.random() * Math.PI * 2,
      radius,
      speed: 0.6 + Math.random() * 0.9,
      sky,
      band,
      y: sky,
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
  group.add(cloudPuffs, cloudBases);

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
  const placeClouds = (camera: THREE.Camera | null, at: THREE.Vector3): void => {
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
        cloudWhere.center.set(at.x + x, cloud.y, at.z + z);
        cloudWhere.radius = cloud.reach;
        if (!cloudFrustum.intersectsSphere(cloudWhere)) continue;
      }
      for (const puff of cloud.puffs) {
        const m = scudding ? puff.scud : puff.shape;
        const at = scudding ? puff.scudAt : puff.at;
        m.elements[12] = x + at.x;
        m.elements[13] = cloud.y + at.y;
        m.elements[14] = z + at.z;
        if (puff.shaded) cloudBases.setMatrixAt(shadedAt++, m);
        else cloudPuffs.setMatrixAt(litAt++, m);
      }
    }
    cloudPuffs.count = litAt;
    cloudBases.count = shadedAt;
    cloudPuffs.instanceMatrix.needsUpdate = true;
    cloudBases.instanceMatrix.needsUpdate = true;
  };

  /** Base colours the flash brightens away from, kept so a surge can be
   * taken back off without re-reading the preset. */
  const litTone = new THREE.Color(0xffffff);
  const shadedTone = new THREE.Color(0xdde4ee);
  let scudding = false;

  const apply = (p: Preset): void => {
    const d = p.deck;
    scudding = d !== null;
    deck.visible = d !== null;
    if (d) {
      paintDeck(d);
      // Scud is the ceiling's own material torn off and lit from nowhere:
      // darker than the underside above it, and darker still below.
      // Scud hangs UNDER the base, so nothing lights it: it is a shade
      // lighter than the ceiling it was torn off, never lighter than the
      // lit strip out at the rim. A white rag under a black base reads as
      // a boulder parked in the sky.
      litTone.set(d.overhead).lerp(new THREE.Color(d.rim), 0.18).multiplyScalar(1.15);
      shadedTone.copy(litTone).multiplyScalar(0.72);
      for (const cloud of cloudList) {
        cloud.y = d.base * (SCUD_BAND[0] + (SCUD_BAND[1] - SCUD_BAND[0]) * cloud.band);
      }
    } else {
      litTone.set(p.cloud);
      shadedTone.set(p.cloud).multiplyScalar(0.8);
      for (const cloud of cloudList) cloud.y = cloud.sky;
    }
    cloudMat.color.copy(litTone);
    cloudMat.opacity = p.cloudOpacity;
    cloudBaseMat.color.copy(shadedTone);
    cloudBaseMat.opacity = p.cloudOpacity;
    deckMat.color.setScalar(1);
  };

  const setFlash = (surge: number): void => {
    // Colours above 1 are legal multipliers in three and clip at the
    // framebuffer, which is exactly what a cloud full of lightning does.
    const lift = 1 + 3.4 * surge;
    deckMat.color.setScalar(lift);
    cloudMat.color.copy(litTone).multiplyScalar(lift);
    cloudBaseMat.color.copy(shadedTone).multiplyScalar(lift);
  };

  const update = (
    windSpeed: number,
    dt: number,
    camera: THREE.Camera | null,
    at: THREE.Vector3,
  ): void => {
    const pace = scudding ? SCUD_PACE : 1;
    for (const cloud of cloudList) {
      cloud.angle += (0.0035 + windSpeed * 0.0014) * cloud.speed * pace * dt;
    }
    placeClouds(camera, at);
  };

  const setVisible = (show: boolean): void => {
    group.visible = show;
  };

  const dispose = (): void => {
    deckGeo.dispose();
    deckMat.dispose();
    cloudGeo.dispose();
    cloudMat.dispose();
    cloudBaseMat.dispose();
  };

  placeClouds(null, ORIGIN);
  return { group, apply, update, setFlash, setVisible, dispose };
}
