// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE TRAIL A CAR PLOUGHS THROUGH SNOW — what is left behind it on a snow
// road or a snowfield (climate.ts). Nothing on a gravel road records a car
// having passed; snow does, and a white stage with no trail on it is a
// stage nobody has driven.
//
// It is not two dark stripes. A car in deep snow does what a plough does:
// each tyre cuts a floor down to what it packed, the snow it displaced is
// thrown out to the SIDE and stands in a bank along the outside of each
// track, and the strip between the wheels — which nothing drove over,
// because the car straddles it — is left standing as a CROWN. From the
// chase camera that is the whole read: two dark furrows, a white ridge
// between them, and a broken white bank down each edge.
//
// So the trail is a swept strip, `SECTION` across (the cross-section of a
// ploughed pair of ruts) and one stamp long per `SPACING` metres of travel.
// How PROUD the banks and the crown stand is the snow's own depth where the
// car is (`TerrainField.blanketAt`): a metre of powder off the road throws a
// real bank, and a packed snow road, which has none to throw, leaves the
// same trail drawn flat — the colour alone.
//
// Each car gets a RING of stamps: each is its own quads from the last stamp
// to this one, so the ring wraps with no seam to hide and the oldest mark is
// simply the next one overwritten. Laid on the DRAWN ground — the road's
// ribbon, or the top of the blanket off it — lifted a few centimetres so it
// draws over the tile without fighting it, and never sunk below it, because
// a floor under the ground mesh is a floor the depth buffer throws away.
//
// Whose trail is drawn is the DUST row's call (settings.ts, `DUST_RAISED`),
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
/** Lifted off the ground, m — the whole section rides on this, and no part
 * of it ever goes below. */
const LIFT = 0.04;

/** The colours across a trail. The floor is the pressed snow in the rut,
 * shadowed and blue; the rim is its shoulder; the crown between the wheels
 * and the banks thrown outside them are broken snow, which is BRIGHTER than
 * the field it came out of — freshly turned snow catches the light on every
 * facet, and that is what makes a trail read from behind. */
const FLOOR = new THREE.Color(0x97a6b8);
const RIM = new THREE.Color(0xd4dce6);
const CROWN = new THREE.Color(0xeff4fa);
const BANK = new THREE.Color(0xf7fbff);
/** ...and where the strip meets the untouched field, in the field's own
 * white, so the trail has no drawn edge. */
const EDGE = new THREE.Color(0xe6ecf4);

/** THE CROSS-SECTION of a ploughed pair of ruts: how far out from the car's
 * centreline each station stands, how far it rises (in ridge heights — see
 * `ridgeOf`), and what colour it is. A rally car's track is about a metre
 * and a half, near enough for every car in the catalogue, so the ruts sit
 * at ±0.74 m and everything else is built around them.
 *
 * Both ends come back down to the ground, so the strip meets the field
 * rather than floating a lip along its edge. */
const SECTION: { lat: number; rise: number; tone: THREE.Color }[] = [
  { lat: -1.34, rise: 0, tone: EDGE },
  { lat: -1.05, rise: 1.55, tone: BANK },
  { lat: -0.9, rise: 0.65, tone: RIM },
  // The rut has a FLOOR, not a crease: a tyre presses a flat band the width
  // of itself and a little more, and a section that touches the floor
  // colour at one station draws two hairlines nobody reads at speed.
  { lat: -0.86, rise: 0, tone: FLOOR },
  { lat: -0.62, rise: 0, tone: FLOOR },
  { lat: -0.56, rise: 0.65, tone: RIM },
  { lat: 0, rise: 1.4, tone: CROWN },
  { lat: 0.56, rise: 0.65, tone: RIM },
  { lat: 0.62, rise: 0, tone: FLOOR },
  { lat: 0.86, rise: 0, tone: FLOOR },
  { lat: 0.9, rise: 0.65, tone: RIM },
  { lat: 1.05, rise: 1.55, tone: BANK },
  { lat: 1.34, rise: 0, tone: EDGE },
];
/** Quads per stamp — one between each pair of stations. */
const SPANS = SECTION.length - 1;

/** How high a ridge stands, m, for the snow lying here: a share of the
 * blanket's own depth, floored so a packed snow ROAD (which has no blanket
 * at all — it is bladed and driven) still draws its trail, flat, and capped
 * so a metre of powder does not throw a wall a car could hit. */
const RIDGE = { of: 0.34, min: 0.012, max: 0.1 };

function ridgeOf(depth: number): number {
  return Math.min(RIDGE.max, Math.max(RIDGE.min, depth * RIDGE.of));
}

/** How uneven the banks are, as a share of their own height. Snow does not
 * throw evenly: the bank a wheel builds is lumpy at the scale of the lumps
 * it is made of, and a pair of dead-straight ridges reads as extruded
 * plastic. Drawn off the stamp's own position so a trail does not change
 * shape when it is laid again. */
const ROUGH = 0.4;

function jitter(x: number, z: number): number {
  const h = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return h - Math.floor(h);
}

/** One stamp's worth of section points, world space. */
type Row = Float64Array;

type Ribbon = {
  mesh: THREE.Mesh;
  positions: Float32Array;
  head: number;
  laid: number;
  /** Where the last stamp was laid, and its section. */
  lastX: number;
  lastZ: number;
  last: Row;
  /** Whether the last stamp is a real one to draw a quad from: false on
   * the first stamp and after any break (air, a gravel stretch, a respawn),
   * so a mark never runs across a gap. */
  joined: boolean;
};

export type SnowMarks = {
  group: THREE.Group;
  /** Lay this car's trail for the frame, if it is on snow and on its
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
    // One quad of four vertices per span of the section, per stamp.
    const verts = STAMPS * SPANS * 4;
    const positions = new Float32Array(verts * 3);
    const colors = new Float32Array(verts * 3);
    const index = new Uint32Array(STAMPS * SPANS * 6);
    for (let q = 0; q < STAMPS * SPANS; q++) {
      const b = q * 4;
      // Corners: 0 = last outer, 1 = last inner, 2 = this inner, 3 = this
      // outer, where outer and inner are the two stations this quad spans.
      index.set([b, b + 1, b + 2, b, b + 2, b + 3], q * 6);
      const span = q % SPANS;
      for (let v = 0; v < 4; v++) {
        const c = SECTION[v === 1 || v === 2 ? span + 1 : span].tone;
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
      last: new Float64Array(SECTION.length * 3),
      joined: false,
    };
  };

  const onSnow = (state: GameState): boolean =>
    (state.surface === "snow" || state.surface === "snowfield") &&
    !state.car.airborne &&
    !state.car.rolling;

  /** Where this stamp's section stands, into `row`. */
  const cut = (
    row: Row,
    car: GameState["car"],
    ridge: number,
    ground: (x: number, z: number) => number,
  ): void => {
    // The driver's right axis in world space is (cos h, -sin h).
    const rx = Math.cos(car.heading);
    const rz = -Math.sin(car.heading);
    for (let i = 0; i < SECTION.length; i++) {
      const st = SECTION[i];
      const x = car.x + rx * st.lat;
      const z = car.z + rz * st.lat;
      // The thrown snow is lumpy; the floor of a rut is not — a wheel
      // presses it flat, which is the whole reason a rut reads as a rut.
      const rough = st.rise > 0 ? 1 - ROUGH + jitter(x, z) * 2 * ROUGH : 1;
      row[i * 3] = x;
      row[i * 3 + 1] = ground(x, z) + LIFT + st.rise * ridge * rough;
      row[i * 3 + 2] = z;
    }
  };

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
    const now = new Float64Array(SECTION.length * 3);
    cut(now, car, ridgeOf(state.terrain.blanketAt(car.x, car.z)), ground);
    if (r.joined) {
      const p = r.positions;
      const last = r.last;
      for (let span = 0; span < SPANS; span++) {
        const q = (r.head * SPANS + span) * 4;
        const a = span * 3;
        const b = (span + 1) * 3;
        const put = (v: number, src: Row, at: number): void => {
          p[(q + v) * 3] = src[at];
          p[(q + v) * 3 + 1] = src[at + 1];
          p[(q + v) * 3 + 2] = src[at + 2];
        };
        put(0, last, a);
        put(1, last, b);
        put(2, now, b);
        put(3, now, a);
      }
      r.head = (r.head + 1) % STAMPS;
      r.laid = Math.min(STAMPS, r.laid + 1);
      const attr = r.mesh.geometry.attributes.position as THREE.BufferAttribute;
      attr.needsUpdate = true;
      r.mesh.visible = true;
    }
    r.lastX = car.x;
    r.lastZ = car.z;
    r.last = now;
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
