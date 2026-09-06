// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE MARKS A CAR LEAVES IN SNOW — two tracks of pressed snow trailing
// every wheel pair over a snow road or a snowfield (climate.ts). Nothing on
// a gravel road records a car having passed; snow does, and a white stage
// with no marks on it is a stage nobody has driven. From the chase camera
// a track is a darker, blue-grey band in the white with a shadowed floor,
// which is what the compressed snow reads as at any distance the game
// looks at it from — the depression itself is never modelled.
//
// Each car gets a RING of quads per track: a stamp is laid every
// `SPACING` metres of travel, as its own four vertices from the last stamp
// to this one, so the ring wraps with no seam to hide and the oldest mark
// is simply the next one overwritten. Laid on the DRAWN ground — the road's
// ribbon, or the top of the blanket off it — lifted a few centimetres so
// it draws over the tile without fighting it.
//
// Whose marks are drawn is the DUST row's call (settings.ts, `DUST_RAISED`),
// which is the same question: what a car throws off the ground and what it
// leaves on it are one budget. The player's on MEDIUM, everybody's on
// HIGH, nobody's on LOW — and the renderer asks per car, so this module
// only ever lays what it is handed.

import * as THREE from "three";
import type { GameState } from "@engine";

/** Metres of travel between stamps. */
const SPACING = 0.7;
/** Stamps kept per car — at `SPACING` this is a few hundred metres of
 * road behind it, which is the far side of any corner the camera can see. */
const STAMPS = 420;
/** Half the distance between the two tracks, m: a rally car's track is a
 * metre and a half, near enough for every car in the catalogue — the marks
 * are read as a pair, never measured. */
const HALF_TRACK = 0.74;
/** How wide one tyre's track is, m. A tyre is 0.2 m across; the pressed
 * band beside it is wider, and drawn wider still so it survives at range. */
const HALF_WIDTH = 0.16;
/** Lifted off the ground, m. */
const LIFT = 0.04;
/** The colours: the shadowed floor of the track, and its softer rim. */
const FLOOR = new THREE.Color(0xa7b4c4);
const RIM = new THREE.Color(0xd4dce6);

type Ribbon = {
  mesh: THREE.Mesh;
  positions: Float32Array;
  head: number;
  laid: number;
  /** Where the last stamp was laid — the pair of track points. */
  lastX: number;
  lastZ: number;
  lastL: [number, number, number];
  lastR: [number, number, number];
  /** Whether the last stamp is a real one to draw a quad from: false on
   * the first stamp and after any break (air, a gravel stretch, a respawn),
   * so a mark never runs across a gap. */
  joined: boolean;
};

export type SnowMarks = {
  group: THREE.Group;
  /** Lay this car's marks for the frame, if it is on snow and on its
   * wheels. `ground` is the DRAWN surface under a point. */
  lay: (state: GameState, ground: (x: number, z: number) => number) => void;
  /** Take a car's ribbon down — it is out of range, or gone. */
  forget: (state: GameState) => void;
  /** Take every ribbon down: a new stage, a restart. */
  reset: () => void;
  dispose: () => void;
};

/** THE DRAWN GROUND under a run: the road's ribbon on the road, and off
 * it the top of the blanket the tiles are drawn at — which the ridden
 * ground lies UNDER in winter (the car is sunk into the snow, terrain.ts),
 * so the higher of the two is the surface a mark has to lie on. */
export function drawnGround(state: GameState): (x: number, z: number) => number {
  const t = state.terrain;
  return (x, z) => Math.max(t.groundAt(x, z), t.latticeAt(x, z));
}

export function createSnowMarks(): SnowMarks {
  const group = new THREE.Group();
  const material = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.86,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const ribbons = new Map<GameState, Ribbon>();

  const build = (): Ribbon => {
    // Two tracks, each STAMPS quads of four vertices.
    const verts = STAMPS * 2 * 4;
    const positions = new Float32Array(verts * 3);
    const colors = new Float32Array(verts * 3);
    const index = new Uint32Array(STAMPS * 2 * 6);
    for (let q = 0; q < STAMPS * 2; q++) {
      const b = q * 4;
      // Corners: 0 = last outer, 1 = last inner, 2 = this inner, 3 = this
      // outer — outer and inner being the rim colour, and the floor drawn
      // as the mean between them by the vertex shading.
      index.set([b, b + 1, b + 2, b, b + 2, b + 3], q * 6);
      for (let v = 0; v < 4; v++) {
        const c = v === 1 || v === 2 ? FLOOR : RIM;
        colors[(b + v) * 3] = c.r;
        colors[(b + v) * 3 + 1] = c.g;
        colors[(b + v) * 3 + 2] = c.b;
      }
    }
    // Parked under the world until laid.
    positions.fill(-1000);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geo.setIndex(new THREE.BufferAttribute(index, 1));
    const mesh = new THREE.Mesh(geo, material);
    mesh.frustumCulled = false;
    mesh.renderOrder = 1;
    group.add(mesh);
    return {
      mesh,
      positions,
      head: 0,
      laid: 0,
      lastX: 0,
      lastZ: 0,
      lastL: [0, 0, 0],
      lastR: [0, 0, 0],
      joined: false,
    };
  };

  const onSnow = (state: GameState): boolean =>
    (state.surface === "snow" || state.surface === "snowfield") &&
    !state.car.airborne &&
    !state.car.rolling;

  const lay = (state: GameState, ground: (x: number, z: number) => number): void => {
    const car = state.car;
    let r = ribbons.get(state);
    if (!onSnow(state)) {
      if (r) r.joined = false;
      return;
    }
    if (!r) {
      r = build();
      ribbons.set(state, r);
    }
    const moved = Math.hypot(car.x - r.lastX, car.z - r.lastZ);
    if (r.joined && moved < SPACING) return;
    // A stamp far from the last is a car that jumped, respawned or was
    // handed a new road: start a fresh run rather than drawing the leap.
    if (moved > SPACING * 6) r.joined = false;
    // The track points, across the car's heading: the driver's right axis
    // in world space is (cos h, -sin h).
    const rx = Math.cos(car.heading);
    const rz = -Math.sin(car.heading);
    const lx = car.x - rx * HALF_TRACK;
    const lz = car.z - rz * HALF_TRACK;
    const rrx = car.x + rx * HALF_TRACK;
    const rrz = car.z + rz * HALF_TRACK;
    const L: [number, number, number] = [lx, ground(lx, lz) + LIFT, lz];
    const R: [number, number, number] = [rrx, ground(rrx, rrz) + LIFT, rrz];
    if (r.joined) {
      const p = r.positions;
      const stamp = (
        track: 0 | 1,
        from: [number, number, number],
        to: [number, number, number],
      ) => {
        const q = (r.head * 2 + track) * 4;
        // Across the track: the outer and inner edge of the band, off the
        // direction the band runs in.
        const dx = to[0] - from[0];
        const dz = to[2] - from[2];
        const len = Math.hypot(dx, dz) || 1;
        const nx = (-dz / len) * HALF_WIDTH;
        const nz = (dx / len) * HALF_WIDTH;
        const put = (v: number, x: number, y: number, z: number) => {
          p[(q + v) * 3] = x;
          p[(q + v) * 3 + 1] = y;
          p[(q + v) * 3 + 2] = z;
        };
        put(0, from[0] + nx, from[1], from[2] + nz);
        put(1, from[0] - nx, from[1], from[2] - nz);
        put(2, to[0] - nx, to[1], to[2] - nz);
        put(3, to[0] + nx, to[1], to[2] + nz);
      };
      stamp(0, r.lastL, L);
      stamp(1, r.lastR, R);
      r.head = (r.head + 1) % STAMPS;
      r.laid = Math.min(STAMPS, r.laid + 1);
      const attr = r.mesh.geometry.attributes.position as THREE.BufferAttribute;
      attr.needsUpdate = true;
      r.mesh.visible = true;
    }
    r.lastX = car.x;
    r.lastZ = car.z;
    r.lastL = L;
    r.lastR = R;
    r.joined = true;
  };

  const drop = (r: Ribbon): void => {
    group.remove(r.mesh);
    r.mesh.geometry.dispose();
  };

  const forget = (state: GameState): void => {
    const r = ribbons.get(state);
    if (!r) return;
    ribbons.delete(state);
    drop(r);
  };

  const reset = (): void => {
    for (const r of ribbons.values()) drop(r);
    ribbons.clear();
  };

  const dispose = (): void => {
    reset();
    material.dispose();
  };

  return { group, lay, forget, reset, dispose };
}
