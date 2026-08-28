// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Ambient life: the world keeps moving whether or not the car does. Bird
// flocks wheel over the stage on flapping swept wings, and now and then
// an airplane crosses high overhead trailing a contrail — a pooled ribbon
// of glow sprites that drifts on the wind and takes the sky's light (white
// at noon, embered at dusk). Pure presentation; all randomness here is
// renderer-side and can never touch the simulation.

import * as THREE from "three";

import { glowTexture } from "./textures.ts";

const FLOCKS = 2;
const BIRDS_PER_FLOCK = 7;
const TRAIL_POOL = 200;

export type AmbientLife = {
  group: THREE.Group;
  /** The sky's light — tints the contrail and dims the birds at night. */
  setTint: (tint: THREE.Color) => void;
  update: (camX: number, camZ: number, windX: number, windZ: number, dt: number) => void;
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

export function createAmbientLife(): AmbientLife {
  const group = new THREE.Group();

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
  for (let f = 0; f < FLOCKS; f++) {
    const birds: Bird[] = [];
    for (let b = 0; b < BIRDS_PER_FLOCK; b++) {
      const root = new THREE.Group();
      const left = new THREE.Mesh(wingGeo, birdMat);
      left.scale.x = -1; // mirrored, so both wings sweep back off the body
      const right = new THREE.Mesh(wingGeo, birdMat);
      root.add(left, right);
      group.add(root);
      birds.push({ root, left, right, phase: Math.random() * Math.PI * 2 });
    }
    flocks.push({
      center: new THREE.Vector3((f - 0.5) * 300, 30 + f * 14, 120 + f * 260),
      radius: 26 + f * 10,
      speed: (0.28 + f * 0.05) * (f % 2 === 0 ? 1 : -1),
      angle: f * 2.1,
      birds,
    });
  }

  // ── The airplane and its contrail ────────────────────────────────────────
  const plane = new THREE.Group();
  const planeMat = new THREE.MeshBasicMaterial({ color: 0xd8dde4 });
  const fuselage = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 7), planeMat);
  const wings = new THREE.Mesh(new THREE.BoxGeometry(9, 0.2, 1.4), planeMat);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.2, 0.9), planeMat);
  tail.position.set(0, 0.5, -3);
  plane.add(fuselage, wings, tail);
  plane.visible = false;
  group.add(plane);

  const trailMap = glowTexture();
  const trailPos = new Float32Array(TRAIL_POOL * 3);
  const trailLife = new Float32Array(TRAIL_POOL);
  for (let i = 0; i < TRAIL_POOL; i++) trailPos[i * 3 + 1] = -500;
  const trailGeo = new THREE.BufferGeometry();
  trailGeo.setAttribute("position", new THREE.BufferAttribute(trailPos, 3));
  const trailMat = new THREE.PointsMaterial({
    map: trailMap,
    color: 0xffffff,
    size: 7,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
  });
  const trail = new THREE.Points(trailGeo, trailMat);
  trail.frustumCulled = false;
  group.add(trail);
  let trailCursor = 0;
  const TRAIL_LIFE = 26; // seconds a puff persists

  let planeDir = new THREE.Vector3(1, 0, 0);
  let planeTimer = 8; // first crossing soon after the stage loads
  let planeAlive = 0;
  let puffClock = 0;

  const setTint = (tint: THREE.Color): void => {
    trailMat.color.copy(tint);
    // Birds go from near-black silhouettes by day to invisible-dark at
    // night without ever turning grey.
    birdMat.color.set(0x2a2d33).multiply(tint);
    planeMat.color.set(0xd8dde4).multiply(tint);
  };

  const update = (camX: number, camZ: number, windX: number, windZ: number, dt: number): void => {
    const t = performance.now() / 1000;

    for (const flock of flocks) {
      flock.angle += flock.speed * dt;
      // The flock wheels around a center parked near the stage start; far
      // from the camera it still reads as motion on the skyline.
      for (let i = 0; i < flock.birds.length; i++) {
        const bird = flock.birds[i];
        const a = flock.angle + (i / flock.birds.length) * 0.9;
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
        const beat = Math.sin(t * 9 + bird.phase);
        const swing = beat > 0 ? beat * beat * BEAT.up : -(beat * beat) * BEAT.down;
        const flap = swing + BEAT.dihedral;
        bird.left.rotation.z = -flap;
        bird.right.rotation.z = flap;
      }
    }

    // The airplane: spawn on a timer, fly a straight chord over the stage,
    // puff the contrail behind it, retire once it is far gone.
    planeTimer -= dt;
    if (planeTimer <= 0 && !plane.visible) {
      const heading = Math.random() * Math.PI * 2;
      planeDir = new THREE.Vector3(Math.sin(heading), 0, Math.cos(heading));
      plane.position
        .set(camX, 150 + Math.random() * 40, camZ)
        .addScaledVector(planeDir, -700)
        .add(
          new THREE.Vector3(
            -planeDir.z * (Math.random() - 0.5) * 400,
            0,
            planeDir.x * (Math.random() - 0.5) * 400,
          ),
        );
      plane.lookAt(plane.position.clone().add(planeDir));
      plane.visible = true;
      planeAlive = 0;
    }
    if (plane.visible) {
      planeAlive += dt;
      plane.position.addScaledVector(planeDir, 55 * dt);
      puffClock += dt;
      if (puffClock > 0.12) {
        puffClock = 0;
        const i = trailCursor;
        trailCursor = (trailCursor + 1) % TRAIL_POOL;
        trailPos[i * 3] = plane.position.x - planeDir.x * 4;
        trailPos[i * 3 + 1] = plane.position.y - 0.5;
        trailPos[i * 3 + 2] = plane.position.z - planeDir.z * 4;
        trailLife[i] = TRAIL_LIFE;
      }
      if (planeAlive > 30) {
        plane.visible = false;
        planeTimer = 40 + Math.random() * 50;
      }
    }

    // Contrail puffs spread on the high-altitude wind and sink out.
    for (let i = 0; i < TRAIL_POOL; i++) {
      if (trailLife[i] <= 0) continue;
      trailLife[i] -= dt;
      trailPos[i * 3] += windX * 0.4 * dt;
      trailPos[i * 3 + 2] += windZ * 0.4 * dt;
      if (trailLife[i] <= 0) trailPos[i * 3 + 1] = -500;
    }
    trailGeo.attributes.position.needsUpdate = true;
  };

  const dispose = (): void => {
    wingGeo.dispose();
    birdMat.dispose();
    fuselage.geometry.dispose();
    wings.geometry.dispose();
    tail.geometry.dispose();
    planeMat.dispose();
    trailGeo.dispose();
    trailMat.dispose();
  };

  return { group, setTint, update, dispose };
}
