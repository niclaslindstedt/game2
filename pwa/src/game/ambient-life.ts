// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Ambient life: the world keeps moving whether or not the car does, and
// what moves depends on the country (R40).
//
//   TAIGA   Bird flocks wheel over the stage on flapping swept wings, and
//           far above them airliners cross the wilderness leaving contrails
//           that hang there for minutes — a pooled ribbon of point sprites
//           that spreads, thins, drifts on the wind aloft and takes the
//           sky's light (white at noon, embered at dusk).
//   DESERT  Vultures. Two or three to a kettle, twice the span, circling
//           high on held wings and flapping only to catch the thermal
//           again — and no traffic, because nothing crosses this sky.
//           On the ground, LIZARDS: a dozen basking within sight of the
//           car that dart for cover as it comes past, which is the one
//           thing in a desert that moves when you do.
//
// Pure presentation; all randomness here is renderer-side and can never
// touch the simulation.
//
// The sky's two halves are anchored differently, and that is the design.
// Birds are a few dozen metres up and belong to a PLACE — the flock is
// parked near the stage start and the car drives past it. Everything in
// sky-traffic.ts is hundreds of metres up and belongs to the SKY, so it
// rides the camera in x/z with no parallax, exactly as the clouds do: at
// that height a stage is not long enough for parallax to be visible, and
// pretending otherwise only walks the contrails down onto the horizon,
// where they would be drawn over the mountains.

import * as THREE from "three";
import type { BiomeId } from "@engine";

import {
  createSkyTraffic,
  puffFade,
  puffWidth,
  tipFade,
  type Crossing,
  DRIFT,
  LANE,
  PUFF,
} from "./sky-traffic.ts";
import { contrailTexture } from "./textures.ts";

const FLOCKS = 2;

/** How many airframes can be in the sky at once. A crossing lasts about
 * twenty seconds and they come over every fifteen to thirty, so two is the
 * common case and this is the headroom above it. */
const AIRFRAMES = 4;

/** How many puffs of contrail the sky can hold. A trail is thin, so it is
 * laid finely — about four hundred puffs to a crossing — and it outlives
 * eight gaps between crossings, which is what a fully dressed sky costs. It
 * is all ONE draw call of point sprites a few pixels across, so the count
 * is cheaper than it reads. The pool is a ring, so a busier sky than this
 * does not break: the oldest puffs go first, which erodes the faintest
 * trail from its far end and is what would have happened next anyway. */
const PUFF_POOL = 3500;

/** Where a retired puff is parked: far enough under the world that nothing
 * frames it, since the pool is never culled. */
const PARKED = -3000;

/** What one country's sky and ground carry. */
type Life = {
  /** Birds per flock, and the wingspan as a multiple of the sparrow-sized
   * default. */
  birds: number;
  span: number;
  /** The beat: how fast the wings go, Hz, and how much of a full stroke
   * they take. A vulture holds its wings and rocks; a small bird flaps. */
  beatHz: number;
  stroke: number;
  /** ...and how much of the time the wings are beating at all, 0..1 — the
   * rest is a glide. A crow flaps most of the way; a vulture almost never. */
  beating: number;
  /** How high the flock wheels over the ground, m, and how wide. */
  height: number;
  radius: number;
  /** Turns per second round the circle. */
  turn: number;
  /** Whether anything crosses this sky at altitude. */
  traffic: boolean;
  lizards: boolean;
};

const LIFE: Record<BiomeId, Life> = {
  taiga: {
    birds: 7,
    span: 1,
    beatHz: 9,
    stroke: 1,
    beating: 1,
    height: 30,
    radius: 26,
    turn: 0.28,
    traffic: true,
    lizards: false,
  },
  desert: {
    birds: 3,
    span: 2.3,
    beatHz: 2.2,
    stroke: 0.35,
    beating: 0.18,
    height: 70,
    radius: 55,
    turn: 0.1,
    traffic: false,
    lizards: true,
  },
};

export type AmbientLife = {
  group: THREE.Group;
  /** The sky's light, which tints the contrails and dims the birds — and
   * its LID: the cloud base overhead in metres, or Infinity under a clear
   * sky. High traffic is above the weather, so an overcast stage sees none
   * of it, and drawing it anyway paints aeroplanes over the ceiling. */
  setSky: (tint: THREE.Color, ceiling: number) => void;
  /** Which country's life this is — what flies, and whether anything
   * crawls. Idempotent, and cheap to call on every re-light. */
  setBiome: (biome: BiomeId) => void;
  /** `ground` and `car` are what the lizards need — where the sand is, and
   * what they are running from. Either may be left out for a frame that
   * has no world under it. */
  update: (
    camX: number,
    camZ: number,
    windX: number,
    windZ: number,
    dt: number,
    ground?: (x: number, z: number) => number,
    car?: { x: number; z: number },
  ) => void;
  dispose: () => void;
};

/** One wing: a swept triangle hinged at the body, its tip trailing behind
 * the leading edge. Three vertices — the cheapest shape that is not a
 * plank, and the sweep is what makes a distant speck read as a bird. x runs
 * out along the wing, z along the flight direction (+z ahead). */
function wingShape(): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute(
    "position",
    new THREE.Float32BufferAttribute([0, 0, 0.16, 0.9, 0, -0.12, 0, 0, -0.2], 3),
  );
  return geo;
}

/** The wing angles a beat swings between, rad: deep on the downstroke,
 * shallow on the recovery, and a little dihedral held at the crossing. A
 * symmetric beat reads as a metronome. */
const BEAT = { down: 0.95, up: 0.5, dihedral: 0.08 };
/** ...and the dihedral a SOARING bird holds instead: a vulture glides in a
 * shallow V and rocks on it, which is how one is told from a hawk a mile
 * off. */
const SOAR_DIHEDRAL = 0.32;

// ── The lizards ───────────────────────────────────────────────────────────

/** How many are kept near the car, how far out they are stood, and how
 * close the car has to come before one bolts. */
const LIZARDS = 12;
const LIZARD_REACH = 70;
const LIZARD_FLEE = 16;
/** How fast one runs, m/s, for how long, s — a dash, not a journey. */
const LIZARD_DASH = 3.2;
const LIZARD_DASH_S = 0.9;

/** A lizard is a flattened body, a tapering tail and a head, all one dark
 * lump: what reads at any distance is the SHAPE against the sand and the
 * fact that it moved. */
function lizardShape(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const body = new THREE.IcosahedronGeometry(0.11, 0);
  body.scale(1, 0.45, 1.9);
  body.translate(0, 0.05, 0);
  parts.push(body);
  const tail = new THREE.ConeGeometry(0.05, 0.34, 4);
  tail.rotateX(Math.PI / 2);
  tail.translate(0, 0.04, -0.35);
  parts.push(tail);
  const head = new THREE.IcosahedronGeometry(0.06, 0);
  head.scale(1, 0.7, 1.4);
  head.translate(0, 0.06, 0.24);
  parts.push(head);
  const positions: number[] = [];
  for (const part of parts) {
    const flat = part.toNonIndexed();
    const pos = flat.getAttribute("position");
    for (let i = 0; i < pos.count; i++) positions.push(pos.getX(i), pos.getY(i), pos.getZ(i));
    flat.dispose();
    part.dispose();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  return geo;
}

/**
 * THE CONTRAIL'S SHADER — two attributes grafted onto three's own points
 * shader, for the same reason dust.ts grafts three onto its own: a
 * `PointsMaterial` draws every point at ONE size and ONE opacity, and a
 * contrail is a line whose every puff is a different age. The near end is
 * sharp, narrow and bright; the far end is a wide grey smear about to go.
 * With one size and one opacity for the lot, a contrail can only be a line
 * that fades all at once, which is a laser and not a cloud.
 *
 * Grafted rather than hand-rolled so the size-attenuation maths (its
 * `scale` uniform is the drawing buffer's height, which nothing outside
 * three can supply) and the tint keep working. No lamps and no spin: the
 * car's headlights do not reach half a kilometre into the sky, and a puff
 * that size does not need its mask turned to hide that it is one.
 */
function graftContrail(mat: THREE.PointsMaterial): void {
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
        attribute float aWidth;
        attribute float aFade;
        varying float vFade;`,
      )
      .replace(
        "gl_PointSize = size;",
        `gl_PointSize = size * aWidth;
        vFade = aFade;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        varying float vFade;`,
      )
      .replace(
        "vec4 diffuseColor = vec4( diffuse, opacity );",
        "vec4 diffuseColor = vec4( diffuse, opacity * vFade );",
      );
  };
  // Without this three sees one PointsMaterial cache key for every grafted
  // material in the scene and hands this one the dust's shader instead.
  mat.customProgramCacheKey = (): string => "contrail";
}

/** The airframe, at the size a thing half a kilometre up has to be before
 * it is anything at all: a fuselage, a wing and a tailplane, and no detail
 * a speck could not carry. */
function airframe(mat: THREE.Material): THREE.Group {
  const plane = new THREE.Group();
  const fuselage = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.4, 13), mat);
  const wings = new THREE.Mesh(new THREE.BoxGeometry(16, 0.35, 2.6), mat);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.35, 1.7), mat);
  tail.position.set(0, 0.9, -5.6);
  plane.add(fuselage, wings, tail);
  plane.visible = false;
  return plane;
}

export function createAmbientLife(): AmbientLife {
  const group = new THREE.Group();
  let life: Life = LIFE.taiga;
  let biome: BiomeId = "taiga";

  // ── Birds: two swept wings per bird, flapped in code ─────────────────────
  //
  // A bird at this range is TWO LINES meeting at a point, and everything
  // about whether it reads as a bird is in the angle between them. Both
  // wings therefore beat the SAME way — down together, up together, into a
  // shallow V — because two wings moving opposite ways are one straight line
  // rotating about its middle, which is a propeller.
  const birdMat = new THREE.MeshBasicMaterial({ color: 0x2a2d33, side: THREE.DoubleSide });
  const wingGeo = wingShape();
  type Bird = { root: THREE.Group; left: THREE.Mesh; right: THREE.Mesh; phase: number };
  type Flock = {
    center: THREE.Vector3;
    radius: number;
    speed: number;
    angle: number;
    birds: Bird[];
  };
  const flocks: Flock[] = [];
  /** Every bird ever made, so a country with fewer per flock hides the
   * rest rather than rebuilding them. */
  const most = Math.max(...Object.values(LIFE).map((l) => l.birds));
  for (let f = 0; f < FLOCKS; f++) {
    const birds: Bird[] = [];
    for (let b = 0; b < most; b++) {
      const root = new THREE.Group();
      const left = new THREE.Mesh(wingGeo, birdMat);
      left.scale.x = -1; // mirrored, so both wings sweep back off the body
      const right = new THREE.Mesh(wingGeo, birdMat);
      root.add(left, right);
      group.add(root);
      birds.push({ root, left, right, phase: Math.random() * Math.PI * 2 });
    }
    flocks.push({
      center: new THREE.Vector3((f - 0.5) * 300, 0, 120 + f * 260),
      radius: 0,
      speed: 0,
      angle: f * 2.1,
      birds,
    });
  }

  /** Put the flocks the way this country flies them. */
  const flockAs = (): void => {
    flocks.forEach((flock, f) => {
      flock.center.y = life.height + f * 14;
      flock.radius = life.radius + f * 10;
      flock.speed = (life.turn + f * 0.05) * (f % 2 === 0 ? 1 : -1);
      flock.birds.forEach((bird, i) => {
        bird.root.visible = i < life.birds;
        bird.root.scale.setScalar(life.span);
      });
    });
  };
  flockAs();

  // ── The high traffic and its contrails ───────────────────────────────────
  //
  // Everything below hangs off `sky`, which follows the camera over the
  // ground and keeps its own altitude. Nothing in it takes fog either: the
  // air that hides the far trees is the air the car is driving through, and
  // a lane four hundred metres up is above it — the same `fog: false` the
  // dome, the ridges and the clouds are drawn with.
  const sky = new THREE.Group();
  group.add(sky);

  const planeMat = new THREE.MeshBasicMaterial({ color: 0xd8dde4, fog: false });
  const planes = Array.from({ length: AIRFRAMES }, () => {
    const plane = airframe(planeMat);
    sky.add(plane);
    return plane;
  });

  const trailMap = contrailTexture();
  const trailPos = new Float32Array(PUFF_POOL * 3);
  const trailWidth = new Float32Array(PUFF_POOL);
  const trailFade = new Float32Array(PUFF_POOL);
  /** How solid this puff is for being where it is along its own trail — the
   * tip taper, which never changes once laid, so it is kept rather than
   * recomputed with the age every frame. */
  const trailTip = new Float32Array(PUFF_POOL);
  /** Age in seconds; at `PUFF.life` a puff is spent, which is where they all
   * start so an empty pool needs no second flag. */
  const trailAge = new Float32Array(PUFF_POOL).fill(PUFF.life);
  for (let i = 0; i < PUFF_POOL; i++) trailPos[i * 3 + 1] = PARKED;
  const trailGeo = new THREE.BufferGeometry();
  trailGeo.setAttribute("position", new THREE.BufferAttribute(trailPos, 3));
  trailGeo.setAttribute("aWidth", new THREE.BufferAttribute(trailWidth, 1));
  trailGeo.setAttribute("aFade", new THREE.BufferAttribute(trailFade, 1));
  const trailMat = new THREE.PointsMaterial({
    map: trailMap,
    color: 0xffffff,
    // The width is per puff and in METRES (`aWidth`), so the material's own
    // size is left as the unit the graft multiplies.
    size: 1,
    transparent: true,
    opacity: 0.38,
    depthWrite: false,
    fog: false,
  });
  graftContrail(trailMat);
  const trail = new THREE.Points(trailGeo, trailMat);
  trail.frustumCulled = false;
  // BEHIND THE WEATHER. Transparent objects are sorted by how far their
  // ORIGIN is from the camera, and this pool's origin is the ground under
  // the camera — so left to itself a contrail half a kilometre up sorts as
  // the nearest thing in the frame and is painted over the cumulus it is
  // supposed to be miles above. The ring of clouds draws at the default
  // order, the dome, the stars and the sun's halo below that; this sits
  // between them.
  trail.renderOrder = -1;
  sky.add(trail);
  let puffCursor = 0;

  /** A crossing being flown and trailed. `laid` is how far along its own
   * track the contrail has been written, in metres — which is what lets a
   * crossing handed over already an hour old lay its whole trail on the
   * frame it arrives, through the same loop that dribbles one out behind a
   * live aeroplane. */
  type Live = { cross: Crossing; laid: number; plane: THREE.Group | null };
  const traffic = createSkyTraffic();
  const live: Live[] = [];
  const free = [...planes];

  const enter = (cross: Crossing): void => {
    // Only a crossing still IN its span gets an airframe; the rest are
    // trails whose aeroplane is long over the horizon.
    const plane = cross.age < cross.span ? (free.pop() ?? null) : null;
    if (plane) {
      // The airframe's nose is +z and `sky` is never rotated, so a heading
      // is the whole of its attitude — no lookAt, and nothing to redo as
      // the group tracks the camera.
      plane.rotation.y = Math.atan2(cross.dirX, cross.dirZ);
      plane.visible = true;
    }
    live.push({ cross, laid: 0, plane });
  };
  for (const cross of traffic.open()) enter(cross);

  /** The cloud base the last re-light reported, m — kept so a change of
   * country can re-decide the sky without waiting for the next one. */
  let ceilingNow = Infinity;

  /** Whether the high traffic is drawn at all: only over a country that
   * has any, and only when there is no deck between it and the car. Every
   * lane runs above the lowest cloud base the weather can build, so the
   * ceiling test is the whole of the second rule. */
  const showSky = (): void => {
    sky.visible = life.traffic && ceilingNow > LANE.low;
  };

  // ── The lizards ──────────────────────────────────────────────────────────
  const lizardGeo = lizardShape();
  const lizardMat = new THREE.MeshLambertMaterial({ color: 0x6f6a4a });
  const lizards = new THREE.InstancedMesh(lizardGeo, lizardMat, LIZARDS);
  lizards.visible = false;
  lizards.frustumCulled = false;
  group.add(lizards);
  type Lizard = {
    x: number;
    z: number;
    heading: number;
    /** Seconds of dash left; 0 is basking. */
    dash: number;
    /** Stood at all — false until the ground has been asked for a spot. */
    placed: boolean;
  };
  const herd: Lizard[] = Array.from({ length: LIZARDS }, () => ({
    x: 0,
    z: 0,
    heading: 0,
    dash: 0,
    placed: false,
  }));
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const whip = new THREE.Quaternion();
  const v = new THREE.Vector3();
  const s = new THREE.Vector3(1, 1, 1);
  const up = new THREE.Vector3(0, 1, 0);

  /** Stand a lizard somewhere new within reach of the camera — ahead of it
   * more often than not, which is where the car is going. */
  const restand = (lizard: Lizard, camX: number, camZ: number): void => {
    const a = Math.random() * Math.PI * 2;
    const d = LIZARD_REACH * (0.35 + Math.random() * 0.65);
    lizard.x = camX + Math.sin(a) * d;
    lizard.z = camZ + Math.cos(a) * d;
    lizard.heading = Math.random() * Math.PI * 2;
    lizard.dash = 0;
    lizard.placed = true;
  };

  const setSky = (tint: THREE.Color, ceiling: number): void => {
    trailMat.color.copy(tint);
    // Birds go from near-black silhouettes by day to invisible-dark at
    // night without ever turning grey.
    birdMat.color.set(0x2a2d33).multiply(tint);
    planeMat.color.set(0xd8dde4).multiply(tint);
    ceilingNow = ceiling;
    showSky();
  };

  const setBiome = (next: BiomeId): void => {
    if (next === biome) return;
    biome = next;
    life = LIFE[next];
    flockAs();
    showSky();
    lizards.visible = life.lizards;
    for (const lizard of herd) lizard.placed = false;
  };

  const update = (
    camX: number,
    camZ: number,
    windX: number,
    windZ: number,
    dt: number,
    ground?: (x: number, z: number) => number,
    car?: { x: number; z: number },
  ): void => {
    const t = performance.now() / 1000;

    for (const flock of flocks) {
      flock.angle += flock.speed * dt;
      // The flock wheels around a center parked near the stage start; far
      // from the camera it still reads as motion on the skyline.
      for (let i = 0; i < life.birds; i++) {
        const bird = flock.birds[i];
        const a = flock.angle + (i / life.birds) * 0.9;
        const r = flock.radius + (i % 3) * 4;
        bird.root.position.set(
          flock.center.x + Math.sin(a) * r,
          flock.center.y + Math.sin(t * 0.7 + bird.phase) * 2,
          flock.center.z + Math.cos(a) * r,
        );
        // Facing the way it is GOING, which is the tangent of the circle
        // and not the radius: a quarter turn off the position angle, the
        // other way round for a flock wheeling the other way. Square wings
        // hid this; swept ones fly visibly sideways without it.
        bird.root.rotation.y = a + (flock.speed > 0 ? Math.PI / 2 : -Math.PI / 2);
        // The mirrored wing takes the same angle with the opposite sign, so
        // the pair opens and closes TOGETHER. Give them opposite signs and
        // the bird is one straight line rotating about its middle.
        //
        // A soaring bird beats only now and then: a slow gate on the beat
        // opens for a few strokes and shuts again, and between them the
        // wings sit up in their V and rock with the air.
        const gate =
          life.beating >= 1 ? 1 : Math.sin(t * 0.45 + bird.phase) > 1 - 2 * life.beating ? 1 : 0;
        const beat = Math.sin(t * life.beatHz * Math.PI * 2 + bird.phase) * gate;
        const swing = (beat > 0 ? beat * beat * BEAT.up : -(beat * beat) * BEAT.down) * life.stroke;
        const rock = life.beating >= 1 ? 0 : Math.sin(t * 1.3 + bird.phase * 2) * 0.06;
        const held = life.beating >= 1 ? BEAT.dihedral : SOAR_DIHEDRAL;
        const flap = swing + held + rock;
        bird.left.rotation.z = -flap;
        bird.right.rotation.z = flap;
      }
    }

    // The lizards: basking until the car is on them, then a dash straight
    // away from it, then basking again wherever they stopped. One that the
    // camera has left far behind is stood up again somewhere ahead.
    if (life.lizards && ground) {
      for (const lizard of herd) {
        if (!lizard.placed || Math.hypot(lizard.x - camX, lizard.z - camZ) > LIZARD_REACH * 1.4) {
          restand(lizard, camX, camZ);
        }
        if (car && lizard.dash <= 0) {
          const dx = lizard.x - car.x;
          const dz = lizard.z - car.z;
          if (dx * dx + dz * dz < LIZARD_FLEE * LIZARD_FLEE) {
            lizard.heading = Math.atan2(dx, dz) + (Math.random() - 0.5) * 0.8;
            lizard.dash = LIZARD_DASH_S;
          }
        }
        if (lizard.dash > 0) {
          lizard.dash -= dt;
          lizard.x += Math.sin(lizard.heading) * LIZARD_DASH * dt;
          lizard.z += Math.cos(lizard.heading) * LIZARD_DASH * dt;
        }
      }
      herd.forEach((lizard, i) => {
        q.setFromAxisAngle(up, lizard.heading);
        // A running lizard's tail whips: a little yaw wobble at a run.
        if (lizard.dash > 0) q.multiply(whip.setFromAxisAngle(up, Math.sin(t * 22) * 0.2));
        m.compose(v.set(lizard.x, ground(lizard.x, lizard.z) + 0.02, lizard.z), q, s);
        lizards.setMatrixAt(i, m);
      });
      lizards.instanceMatrix.needsUpdate = true;
    }

    if (!sky.visible) return;
    sky.position.set(camX, 0, camZ);

    const arriving = traffic.step(dt);
    if (arriving) enter(arriving);

    for (let i = live.length - 1; i >= 0; i--) {
      const run = live[i];
      const cross = run.cross;
      cross.age += dt;
      const flying = cross.age < cross.span;
      // How far down the track the aeroplane has got — and it stops at the
      // end of the chord, so a crossing that arrives already spent lays
      // exactly the trail it flew and no more.
      const chord = cross.span * cross.speed;
      const flown = (flying ? cross.age : cross.span) * cross.speed;
      while (run.laid + PUFF.step <= flown) {
        run.laid += PUFF.step;
        // How old this piece of the trail is: the age of the crossing less
        // the time it took to fly this far. A backfilled trail therefore
        // carries the same age gradient a live one grows, through the same
        // two lines — and the oldest end of a very old one is simply never
        // laid, because there would be nothing left of it to see.
        const born = cross.age - run.laid / cross.speed;
        if (born >= PUFF.life) continue;
        const p = puffCursor;
        puffCursor = (puffCursor + 1) % PUFF_POOL;
        trailPos[p * 3] = cross.fromX + cross.dirX * run.laid;
        trailPos[p * 3 + 1] = cross.y;
        trailPos[p * 3 + 2] = cross.fromZ + cross.dirZ * run.laid;
        trailAge[p] = Math.max(0, born);
        trailTip[p] = tipFade(run.laid / chord);
      }
      if (run.plane) {
        if (flying) {
          run.plane.position.set(
            cross.fromX + cross.dirX * flown,
            cross.y,
            cross.fromZ + cross.dirZ * flown,
          );
        } else {
          run.plane.visible = false;
          free.push(run.plane);
          run.plane = null;
        }
      }
      // Retired once the aeroplane is gone AND its trail is written; the
      // puffs outlive it in the pool on their own ages.
      if (!flying) live.splice(i, 1);
    }

    // The contrails: spreading, thinning, and creeping on the wind aloft.
    for (let i = 0; i < PUFF_POOL; i++) {
      const age = trailAge[i];
      if (age >= PUFF.life) continue;
      const aged = age + dt;
      trailAge[i] = aged;
      if (aged >= PUFF.life) {
        trailPos[i * 3 + 1] = PARKED;
        trailFade[i] = 0;
        continue;
      }
      trailPos[i * 3] += windX * DRIFT * dt;
      trailPos[i * 3 + 2] += windZ * DRIFT * dt;
      trailWidth[i] = puffWidth(aged);
      trailFade[i] = puffFade(aged) * trailTip[i];
    }
    trailGeo.attributes.position.needsUpdate = true;
    trailGeo.attributes.aWidth.needsUpdate = true;
    trailGeo.attributes.aFade.needsUpdate = true;
  };

  const dispose = (): void => {
    wingGeo.dispose();
    birdMat.dispose();
    for (const plane of planes)
      for (const part of plane.children) (part as THREE.Mesh).geometry.dispose();
    planeMat.dispose();
    trailGeo.dispose();
    trailMat.dispose();
    lizardGeo.dispose();
    lizardMat.dispose();
    lizards.dispose();
  };

  return { group, setSky, setBiome, update, dispose };
}
