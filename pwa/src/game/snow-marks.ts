// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE TRAIL A CAR PRESSES INTO SNOW — what is left behind it on a snow road
// or a snowfield (climate.ts). Nothing on a gravel road records a car having
// passed; snow does, and a white stage with no trail on it is a stage nobody
// has driven.
//
// It is not two dark stripes, and it is not a ploughed lane either. What a
// car leaves in deep snow is the shape of the CAR: the body presses a broad
// floor at about its own clearance, because the snow under it has to come
// down for the car to be where it is, and the four tyres cut a furrow into
// that floor on each side, down to whatever they packed. Between them the
// strip the car STRADDLES stays up at the body's own level and reads as a
// CROWN. From the chase camera the whole trail is that: a wide trough, two
// dark furrows in its floor, and a pale ridge running between them.
//
// So the trail is a swept strip, `SECTION` across (the cross-section of that
// pair of ruts) and one stamp long per `SPACING` metres of travel.
//
// WHAT IT IS DRAWING IS REAL. The engine's snow is deformable
// (`snowpack.ts`) and the car's wheels have already pressed this ground down
// by a measured number of metres (`Snowpack.sunkAt`) — and a trail driven a
// second and a third time deepens exactly as the physics under it does.
//
// THE GROUND ITSELF DOES MOST OF IT. The coat of snow off the road is a mesh
// that bends (`snow-mantle.ts`), so the trough is a real hole in the drawn
// world and this strip is laid IN it, on the coat's own surface
// (`coatHeightAt`). What is left for the section to stand up is only what
// the coat had no room to show — a couple of centimetres off the road, and
// on a snow ROAD, whose mat is one mesh built when the stage was and cannot
// bend at all, the whole of a rut that was never more than that deep.
// Nothing here may ever be drawn BELOW the ground it is laid on: a floor
// under the ground mesh is a floor the depth buffer throws away.
//
// ...and the FLOOR'S COLOUR is how worked the snow is (`Snowpack.workAt`).
// Packed snow is a polished floor where fresh snow is crystals, and it is
// the darker, bluer, glassier of the two — which is the game telling the
// driver, in the one place they are looking, that the fast line is also
// the slippery one.
//
// Each car gets a RING of stamps: each is its own quads from the last stamp
// to this one, so the ring wraps with no seam to hide and the oldest mark is
// simply the next one overwritten. Laid on the DRAWN ground — the road's
// ribbon, or the coat's own sagging surface off it — lifted a few
// centimetres so it draws over what is under it without fighting it.
//
// Whose trail is drawn is the DUST row's call (settings.ts, `TRAIL_LEFT`),
// which is the same question about the same wheels — but it is NOT the same
// budget, and that is the whole of why it has its own record. What a car
// throws off the ground is sprites, spawned per frame per car for as long as
// anybody is driving. What it LEAVES on the ground is this: one mesh, built
// the first time that car touches snow and never again, a ring of stamps
// rewritten in place. A stage with no snow on it never allocates one.
//
// So the car being driven marks the snow at every stop of the row, `off`
// included, and only the FIELD's ruts — one mesh per rival in range — are
// the row's to put away. The renderer asks per car, so this module only ever
// lays what it is handed.

import * as THREE from "three";
import { snowUnder, type GameState, type SnowUnder } from "@engine";

import { coatHeightAt, coatSagAt } from "./snow-mantle.ts";

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
 * facet, and that is what makes a trail read from behind.
 *
 * `FLOOR`, `BANK` and `EDGE` are exported because a car's rut is not the only thing
 * pressed into a snowfield: the crowd's walk out to a stand (`carpark.ts`)
 * is the same two tones, and a path trodden by boots that read as a
 * different white from one pressed by tyres would be two materials claiming
 * to be one snow. */
export const FLOOR = new THREE.Color(0xa8b6c8);
/** ...and what the floor becomes once traffic has worked it all the way
 * down: a polished floor rather than a pressed one, darker and bluer
 * again. The mix is the pack itself, so the racing line on a white stage
 * darkens as it is driven. */
const GLAZE = new THREE.Color(0x8e9db2);
const RIM = new THREE.Color(0xcfd9e6);
const CROWN = new THREE.Color(0xf6f9fc);
export const BANK = new THREE.Color(0xffffff);
/** ...and where the strip meets the untouched field, in the field's own
 * white, so the trail has no drawn edge. */
export const EDGE = new THREE.Color(0xeceff2);

/** Half the track width the section below is drawn around, m — where the
 * ruts are, and where the cut that sizes them is read. */
const TRACK_HALF = 0.74;

/** THE CROSS-SECTION OF A CAR'S TRACK: how far out from the car's centreline
 * each station stands, how far it rises (in ridge heights — see `ridgeOf`),
 * and what colour it is. A rally car's track is about a metre and a half,
 * near enough for every car in the catalogue, so the ruts sit at ±0.74 m and
 * everything else is built around them.
 *
 * The shape is the CAR, read from the middle out: the crown the body pressed
 * and straddled, a furrow under each wheel, the little the tyres pushed out
 * past themselves, and then the untouched field. It is deliberately NOT a
 * snowplough's cross-section — no wall of thrown snow down either side —
 * because the thing that made the mark was a car, and the deep trough it
 * sits in is drawn by the coat under it rather than implied by banks over
 * it (`ridgeOf`).
 *
 * Both ends come back down to the ground, so the strip meets the field
 * rather than floating a lip along its edge. */
const SECTION: { lat: number; rise: number; tone: THREE.Color }[] = [
  { lat: -1.34, rise: 0, tone: EDGE },
  // What the tyre pushed out past itself — the low shoulder outside a rut,
  // and never more than that: this is the station that used to stand three
  // times as proud and turn every trail into a bladed lane.
  { lat: -1.05, rise: 0.55, tone: BANK },
  { lat: -0.9, rise: 0.45, tone: RIM },
  // The rut has a FLOOR, not a crease: a tyre presses a flat band the width
  // of itself and a little more, and a section that touches the floor
  // colour at one station draws two hairlines nobody reads at speed.
  { lat: -0.86, rise: 0, tone: FLOOR },
  { lat: -0.62, rise: 0, tone: FLOOR },
  { lat: -0.56, rise: 0.45, tone: RIM },
  // R47 — THE CROWN IS PRESSED, not untouched, and it is the station the
  // whole trail reads by. The car straddles this strip so no wheel has been
  // over it, but the CHASSIS has: the body parts the snow along the line its
  // nose sweeps before the wheels ever reach it (`TUNING.snow.chassis`), and
  // what it leaves is a broad floor at about the car's own clearance with
  // the two ruts cut into it. Measured on the campaign's alpine circuit over
  // three different lines through the deepest field, the crown stands at
  // 0.85, 0.87 and 0.86 of the rut's own depth above the rut floor — so this
  // is the one station that is the CAR's shape rather than the snow's, and
  // it is what says a car went through here and these were its wheels.
  { lat: 0, rise: 0.86, tone: CROWN },
  { lat: 0.56, rise: 0.45, tone: RIM },
  { lat: 0.62, rise: 0, tone: FLOOR },
  { lat: 0.86, rise: 0, tone: FLOOR },
  { lat: 0.9, rise: 0.45, tone: RIM },
  { lat: 1.05, rise: 0.55, tone: BANK },
  { lat: 1.34, rise: 0, tone: EDGE },
];
/** Quads per stamp — one between each pair of stations. */
const SPANS = SECTION.length - 1;

/** How high the section stands above the ground it is laid on, m — WHAT THE
 * GROUND ITSELF COULD NOT SHOW.
 *
 * The drawn snow sinks under a car now: the coat is a mesh and it bends
 * (`snow-mantle.ts`), so most of a trail is a hole in the ground rather
 * than a shape laid over it, and this strip only has to carry the part the
 * coat had no room for. Off the road in deep powder that is nearly nothing
 * and the trail IS the trough — a broad floor the body pressed, with two
 * furrows and a crown between them. On a snow ROAD it is the whole of the
 * rut, because the mat is one mesh built when the stage was and it cannot
 * bend at all; a snow road's cover is thin and already worn, so the whole
 * of the rut is a few centimetres.
 *
 * `max` is low ON PURPOSE, and it is the rule the trail is judged against:
 * a car in snow leaves a TRACK — the body's clearance and the tyres — and
 * never the walls of thrown snow a snowplough leaves behind it. Past a few
 * centimetres the section stops reading as a car's mark and starts reading
 * as a bladed lane, which is the wrong vehicle entirely. `min` keeps a
 * hairline, so a road worked to a floor still draws its trail. */
const RIDGE = { min: 0.012, max: 0.08 };

function ridgeOf(sunk: number, sag: number): number {
  return Math.min(RIDGE.max, Math.max(RIDGE.min, sunk - sag));
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

/** How far the SNOW'S SURFACE has come down under this car's wheels, m —
 * the deeper of the two lines, which is how deep the rut here actually is.
 *
 * `sunkAt` and not `cutAt`, for the reason `snowpack.ts` states: the wheels
 * sink by only the loose share of what the packing took out of the column,
 * while the top of the snow loses the whole of it, and a rut drawn off the
 * wheels' number is a rut several times shallower than the one the car
 * demonstrably left.
 *
 * Asked at the wheels and never at the middle, and that is not a detail:
 * the middle of a car is the crown it STRADDLES. No wheel has ever been
 * there, so a trail sized off it is drawn dead flat on ground the wheels
 * either side of it have pressed a foot into. */
function sunkUnderWheels(state: GameState): number {
  const car = state.car;
  // The driver's right axis in world space is (cos h, -sin h).
  const rx = Math.cos(car.heading) * TRACK_HALF;
  const rz = -Math.sin(car.heading) * TRACK_HALF;
  return Math.max(
    state.snow.sunkAt(car.x + rx, car.z + rz),
    state.snow.sunkAt(car.x - rx, car.z - rz),
  );
}

/** Scratch: the snow under a stamp, and the floor's tone for it. One
 * record each — this runs for every car that is laying a trail, every
 * frame it moves a stamp's worth. */
const UNDER: SnowUnder = { rest: 0, base: 0 };
const FLOOR_NOW = new THREE.Color();

type Ribbon = {
  mesh: THREE.Mesh;
  positions: Float32Array;
  colors: Float32Array;
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
  /** THE LIGHT THE TRAIL IS DRAWN IN, set once a frame before laying: the
   * same ambient the unlit dust takes (`Environment.dustTint`).
   *
   * The strip is a decal on a MeshBasic material — it carries its own
   * colour and the scene's lights pass straight through it, exactly as
   * they pass through a particle. Left untinted it is the one thing in a
   * winter frame that does not know what time it is: authored to sit in
   * the snow at noon, it reads as a stripe of white paint at dusk and as
   * a lamp at night. One multiply fixes it, and it follows any retune of
   * the weather for free. */
  light: (tint: THREE.Color) => void;
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
  const snow = state.snow;
  if (!snow.white) return (x, z) => Math.max(t.groundAt(x, z), t.latticeAt(x, z));
  // ...WHICH SAGS INTO THE TROUGH THE CAR PRESSED. Off the road the coat is
  // a mesh that bends (`snow-mantle.ts`), so a mark laid at the untouched
  // top would hang in the air over the very trench it is supposed to be
  // lying in.
  //
  // Read off the COAT (`coatHeightAt`) and never off the pack under it,
  // which is the trap this walked into once already: the pack answers at
  // the 0.4 m grain a wheel carves at, the coat is drawn on a 2.5 m grid,
  // and a mark that follows the fine rut goes UNDER the coarse sheet
  // wherever the sheet's own average is the deeper of the two — which is a
  // trail drawn inside the ground. The coat is the ground here. Anything
  // finer than it is this strip's to draw, standing on it.
  return (x, z) => Math.max(t.groundAt(x, z), coatHeightAt(t, snow, x, z));
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
      //
      // WOUND TO FACE UP, and it has to be spelled out because getting it
      // wrong costs the whole trail and looks exactly like not drawing one.
      // The section runs left to right across the car and the stamps run
      // forward along it, and in this world's handedness those two axes
      // cross DOWNWARD — the driver's right is (cos h, -sin h) and forward
      // is (sin h, cos h), so `right × forward` is -y whichever way the car
      // is pointing. Taken in section order the quad therefore faces into
      // the ground, and a front-face material throws away every triangle in
      // the mesh: the trail was laid, correct, and complete, and nothing was
      // ever on screen. Reversed here, once, rather than by drawing both
      // sides — a mark lies on the ground and there is no under-side of it
      // to see.
      index.set([b, b + 2, b + 1, b, b + 3, b + 2], q * 6);
      const span = q % SPANS;
      for (let v = 0; v < 4; v++) {
        const c = SECTION[v === 1 || v === 2 ? span + 1 : span].tone;
        colors[(b + v) * 3] = c.r;
        colors[(b + v) * 3 + 1] = c.g;
        colors[(b + v) * 3 + 2] = c.b;
      }
      // ...seeded here and rewritten per stamp: how worked the snow under
      // a stamp is is a fact about that stamp, and the floor's tone is the
      // only thing on the strip that reads it.
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
      colors,
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
    // What the engine's snow says about this patch: how far the wheels have
    // let it down (the relief the trail is drawn with) and how worked it
    // is (the floor's colour). One reading per stamp, at the car — the
    // strip is under two metres across and the answer does not change
    // across it by anything the eye could see.
    snowUnder(state.track, state.terrain, state.nearIndex, car.x, car.z, UNDER);
    const worked = state.snow.workAt(car.x, car.z, UNDER.base);
    // ...and how far the ground under this stamp has ALREADY come down for
    // the same car, so the section only stands up the part that is left.
    // Zero on the road, where nothing under the car can bend and the whole
    // rut is this strip's to draw.
    const sag = coatSagAt(state.terrain, state.snow, car.x, car.z);
    cut(now, car, ridgeOf(sunkUnderWheels(state), sag), ground);
    if (r.joined) {
      const p = r.positions;
      const c = r.colors;
      const last = r.last;
      FLOOR_NOW.copy(FLOOR).lerp(GLAZE, worked);
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
        for (let v = 0; v < 4; v++) {
          const st = SECTION[v === 1 || v === 2 ? span + 1 : span];
          const tone = st.tone === FLOOR ? FLOOR_NOW : st.tone;
          c[(q + v) * 3] = tone.r;
          c[(q + v) * 3 + 1] = tone.g;
          c[(q + v) * 3 + 2] = tone.b;
        }
      }
      r.head = (r.head + 1) % STAMPS;
      r.laid = Math.min(STAMPS, r.laid + 1);
      (r.mesh.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      (r.mesh.geometry.attributes.color as THREE.BufferAttribute).needsUpdate = true;
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

  const light = (tint: THREE.Color): void => {
    material.color.copy(tint);
  };

  return { group, light, lay, forget, reset, dispose };
}
