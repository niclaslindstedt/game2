// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// R27 — THE PEOPLE. What a spectator stand actually looks like from a car
// going past it at a hundred and forty.
//
// Which is the whole design brief, and it is a tighter one than it sounds. A
// figure beside a rally stage is on screen for well under a second, at
// twenty to forty metres, moving. Nobody reads a face. What reads is the
// SILHOUETTE — head, shoulders, a body, two legs — and COLOUR, because a
// crowd is the most colourful thing in a forest and that contrast is the
// entire reason a stand registers at all against green and brown.
//
// So a person here is six boxes and a five-colour wardrobe, and everything
// that would cost more than that goes into the two things that actually
// sell it: they are all slightly different (height, build, which way they
// are turned, what they are wearing), and they MOVE — a slow idle sway with
// arms up on the ones that are cheering. A field of identical figures
// standing perfectly still reads as a row of bollards, however good each one
// is.
//
// The whole crowd of a stage is a handful of InstancedMeshes — one per body
// part — because a stage can carry three hundred people and three hundred
// draw calls of a six-box person is a frame.

import * as THREE from "three";
import { hash2, standHeads, type Stand } from "@engine";

/** A body, part by part, in meters. A person is built from the ground up:
 * two legs, a torso, a head, and two arms hung off the shoulders. */
const BODY = {
  height: 1.72,
  legs: { width: 0.17, depth: 0.19, height: 0.82, apart: 0.1 },
  torso: { width: 0.44, depth: 0.24, height: 0.6 },
  head: { size: 0.21 },
  arm: { width: 0.11, depth: 0.12, height: 0.56 },
};

/** How much taller or shorter than the base a figure can come out, and how
 * much wider — enough that a crowd is people and not a clone stamp. */
const VARY = { height: 0.16, build: 0.18 };

/** The wardrobe. Rally spectators in a northern forest wear outdoor kit, so
 * these are anorak colours: saturated enough to carry against spruce at
 * distance, muted enough not to look like a bag of sweets. */
const COATS = ["#c8433a", "#2f6ea8", "#e0a52c", "#3f7c4a", "#b8b2a6", "#8d4f9e", "#d9694a"];
/** Trousers and hats are the quiet half of the palette. */
const LEGWEAR = ["#333a45", "#4a4033", "#28303a", "#5a5348"];
const SKIN = ["#e8bd97", "#c68b60", "#8d5a3b", "#f0d3b4", "#6b4429"];

/** Idle sway: how far a standing figure rocks, radians, and how fast. Slow
 * — this is people standing in a field, not a dance. */
const SWAY = { angle: 0.045, hz: 0.42 };
/** ...and the cheer: how far the arms of a celebrating figure swing, and
 * how much faster than the sway they do it. */
const CHEER = { angle: 1.05, hz: 1.9 };
/** What share of a crowd has its arms up at any moment. */
const CHEERING = 0.38;

/** People per meter of front row, and the gap between rows, m. */
const ROW_GAP = 1.15;

/** One person, resolved: where they stand, how big they are, which way they
 * face, and which phase of the sway they are on. */
type Figure = {
  x: number;
  z: number;
  y: number;
  facing: number;
  scale: number;
  build: number;
  /** Where in the idle cycle this one is — nobody sways in unison. */
  phase: number;
  /** True for the ones with their arms up. */
  cheering: boolean;
  coat: number;
  legs: number;
  skin: number;
  /** Which stand this one is in — how the update skips the far ones. */
  stand: number;
};

/** How near the car a stand has to be before its people are animated, m.
 * Past it they stand still — which at that range is indistinguishable, and
 * is the difference between animating a stage's whole crowd every frame and
 * animating the one stand that is on screen. */
const LIVE_RANGE = 160;

/** A crowd, built and drawn. */
export type Crowd = {
  group: THREE.Group;
  /** Advance the sway. `focusX`/`focusZ` is what the crowd is watching —
   * the car — so only the stands it is actually near do any work. */
  update: (dt: number, focusX: number, focusZ: number) => void;
  dispose: () => void;
};

/** One instanced body part: the geometry, its per-figure colour, and the
 * offset from the figure's own origin that positions it. */
type Part = {
  geo: THREE.BufferGeometry;
  mesh: THREE.InstancedMesh;
  /** Where the part sits in the figure's local frame, m, before the
   * figure's own scale is applied. */
  at: THREE.Vector3;
  /** How this part answers the animation: the body sways as a whole, an arm
   * that is cheering swings from the shoulder. */
  kind: "body" | "armL" | "armR";
};

/** One body part's geometry.
 *
 * The white `color` attribute is load-bearing, not decoration. A figure's
 * colour is per-INSTANCE (`InstancedMesh.instanceColor`), and three.js only
 * multiplies that into the fragment when the material sets `vertexColors` —
 * which in turn makes the shader read a per-vertex `color` attribute. A box
 * has none, so the two together render a crowd of silhouettes in pure
 * black. White here is the identity: the instance colour comes through
 * unchanged. */
function box(w: number, h: number, d: number): THREE.BufferGeometry {
  const geo = new THREE.BoxGeometry(w, h, d);
  const white = new Float32Array(geo.attributes.position.count * 3).fill(1);
  geo.setAttribute("color", new THREE.BufferAttribute(white, 3));
  return geo;
}

/** Lay the people out inside a stand's rectangle: rows behind rows, jittered
 * off the lattice so it reads as a crowd rather than a formation. */
function peopleOf(stand: Stand, index: number, ground: (x: number, z: number) => number): Figure[] {
  const figures: Figure[] = [];
  // Along the road is the stand's own facing turned back a quarter turn.
  const along = stand.facing + Math.PI / 2;
  const ax = Math.sin(along);
  const az = Math.cos(along);
  // Back from the front row, away from the road.
  const bx = Math.sin(stand.facing + Math.PI);
  const bz = Math.cos(stand.facing + Math.PI);
  // The engine's own head count, not a second opinion on it: R42 sizes the
  // car park behind the corner from `standHeads`, so drawing a different
  // number of people is drawing a crowd the cars could not have brought.
  const perRow = standHeads(stand) / stand.rows;
  for (let row = 0; row < stand.rows; row++) {
    for (let n = 0; n < perRow; n++) {
      const roll = (k: number): number => hash2(index * 131 + row * 17 + n, k, 0x63f1);
      // Rows behind the front are offset half a place, so nobody is stood
      // directly behind anybody — which is how a crowd packs itself.
      const slot = (n + 0.5 + (row % 2) * 0.5) / perRow - 0.5;
      const alongM = slot * stand.width + (roll(1) - 0.5) * 0.5;
      const backM = row * ROW_GAP + (roll(2) - 0.5) * 0.35;
      const x = stand.x + ax * alongM + bx * backM;
      const z = stand.z + az * alongM + bz * backM;
      figures.push({
        stand: index,
        x,
        z,
        y: ground(x, z),
        // Looking at the road, give or take: a crowd is not a firing squad.
        facing: stand.facing + (roll(3) - 0.5) * 0.7,
        scale: 1 + (roll(4) - 0.5) * 2 * VARY.height,
        build: 1 + (roll(5) - 0.5) * 2 * VARY.build,
        phase: roll(6) * Math.PI * 2,
        cheering: roll(7) < CHEERING,
        coat: Math.floor(roll(8) * COATS.length),
        legs: Math.floor(roll(9) * LEGWEAR.length),
        skin: Math.floor(roll(10) * SKIN.length),
      });
    }
  }
  return figures;
}

/**
 * Build every spectator on the stage.
 *
 * `ground` is the height of the land under a point — the terrain field's,
 * so a crowd on a slope stands on the slope. `budget` scales the head count
 * with the player's effects setting: fewer people, same stands.
 */
export function buildCrowd(
  stands: Stand[],
  ground: (x: number, z: number) => number,
  budget = 1,
): Crowd {
  const group = new THREE.Group();
  const figures: Figure[] = [];
  stands.forEach((stand, i) => {
    const all = peopleOf(stand, i, ground);
    // Thinning takes every Nth person rather than the tail of the list, so a
    // thinned stand is a sparser crowd across its whole width instead of
    // half a crowd with a gap beside it.
    const keep = Math.max(1, Math.round(1 / Math.max(0.05, budget)));
    for (let n = 0; n < all.length; n++) if (n % keep === 0) figures.push(all[n]);
  });
  if (figures.length === 0) {
    return { group, update: () => {}, dispose: () => {} };
  }
  const live: boolean[] = stands.map(() => true);

  const L = BODY.legs;
  const T = BODY.torso;
  const A = BODY.arm;
  const legY = L.height / 2;
  const torsoY = L.height + T.height / 2;
  const headY = L.height + T.height + BODY.head.size / 2;
  const shoulderY = L.height + T.height - A.height / 2;
  const parts: Part[] = [
    {
      geo: box(L.width, L.height, L.depth),
      at: new THREE.Vector3(-L.apart, legY, 0),
      kind: "body",
    },
    { geo: box(L.width, L.height, L.depth), at: new THREE.Vector3(L.apart, legY, 0), kind: "body" },
    { geo: box(T.width, T.height, T.depth), at: new THREE.Vector3(0, torsoY, 0), kind: "body" },
    {
      geo: box(BODY.head.size, BODY.head.size, BODY.head.size),
      at: new THREE.Vector3(0, headY, 0),
      kind: "body",
    },
    {
      geo: box(A.width, A.height, A.depth),
      at: new THREE.Vector3(-(T.width / 2 + A.width / 2), shoulderY, 0),
      kind: "armL",
    },
    {
      geo: box(A.width, A.height, A.depth),
      at: new THREE.Vector3(T.width / 2 + A.width / 2, shoulderY, 0),
      kind: "armR",
    },
  ].map((p, i) => {
    // Legs are legwear, the head is skin, everything else is the coat.
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const mesh = new THREE.InstancedMesh(p.geo, mat, figures.length);
    mesh.frustumCulled = false;
    const colors = new Float32Array(figures.length * 3);
    const tint = new THREE.Color();
    figures.forEach((f, n) => {
      const palette = i < 2 ? LEGWEAR[f.legs] : i === 3 ? SKIN[f.skin] : COATS[f.coat];
      tint.set(palette);
      // A touch of per-figure shade so a row in one coat is not one flat
      // block of colour across the whole stand.
      const shade = 0.86 + ((n * 37) % 100) / 360;
      colors[n * 3] = tint.r * shade;
      colors[n * 3 + 1] = tint.g * shade;
      colors[n * 3 + 2] = tint.b * shade;
    });
    mesh.instanceColor = new THREE.InstancedBufferAttribute(colors, 3);
    group.add(mesh);
    return { ...p, mesh } as Part;
  });

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const swing = new THREE.Quaternion();
  const side = new THREE.Vector3(1, 0, 0);
  const pivot = new THREE.Vector3();

  let clock = 0;
  /** Write the matrices of every figure in a live stand. A figure in a stand
   * that is not live keeps the matrix it was last given — which is the whole
   * point of `live`, and is why this has to run over ALL of them once at
   * build time: an instance nobody ever writes keeps the identity matrix,
   * and a person on the identity matrix is a person standing at the world
   * origin, which is the start line. */
  const place = (): void => {
    for (const part of parts) {
      figures.forEach((f, n) => {
        if (!live[f.stand]) return;
        const lean = Math.sin(clock * SWAY.hz * Math.PI * 2 + f.phase) * SWAY.angle;
        q.setFromAxisAngle(up, f.facing);
        scale.set(f.build * f.scale, f.scale, f.build * f.scale);
        pos.copy(part.at).multiply(scale).applyQuaternion(q);
        pos.x += f.x;
        pos.y += f.y;
        pos.z += f.z;
        if (part.kind === "body" || !f.cheering) {
          // The whole figure rocks a little on its feet. Rolled about the
          // heading axis rather than tilted in world space, so a figure
          // turned away sways the same way as one facing you.
          swing.setFromAxisAngle(side.set(Math.cos(f.facing), 0, -Math.sin(f.facing)), lean);
          m.compose(pos, q.premultiply(swing), scale);
        } else {
          // An arm up: swung from the shoulder, so the hand travels and the
          // shoulder does not. The pivot is the arm's own top.
          const wave =
            CHEER.angle * (0.55 + 0.45 * Math.sin(clock * CHEER.hz * Math.PI * 2 + f.phase));
          const armSide = part.kind === "armL" ? 1 : -1;
          swing.setFromAxisAngle(
            side.set(Math.sin(f.facing), 0, Math.cos(f.facing)),
            wave * armSide,
          );
          // Rotate the arm about its shoulder: move to the pivot, turn, and
          // come back down the rotated arm.
          pivot.set(0, (A.height / 2) * f.scale, 0);
          pos.add(pivot);
          pivot.applyQuaternion(swing);
          pos.sub(pivot);
          m.compose(pos, q.premultiply(swing), scale);
        }
        part.mesh.setMatrixAt(n, m);
      });
      part.mesh.instanceMatrix.needsUpdate = true;
    }
  };

  const update = (dt: number, focusX = 0, focusZ = 0): void => {
    clock += dt;
    let any = false;
    for (let i = 0; i < stands.length; i++) {
      live[i] = Math.hypot(stands[i].x - focusX, stands[i].z - focusZ) < LIVE_RANGE;
      any = any || live[i];
    }
    if (!any) return;
    place();
  };

  // Everybody is placed once with every stand live, so a crowd the car never
  // gets near is still standing in the right place. It cannot go through
  // `update`: that recomputes `live` from the focus before it writes
  // anything, so a stand out of range would never be placed at all.
  live.fill(true);
  place();

  const dispose = (): void => {
    for (const part of parts) {
      part.geo.dispose();
      (part.mesh.material as THREE.Material).dispose();
    }
  };

  return { group, update, dispose };
}
