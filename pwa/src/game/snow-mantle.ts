// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE COAT OF SNOW THE COUNTRY WEARS — the winter's blanket as a surface of
// its own, lying on top of the ground rather than mixed into it.
//
// WHY IT IS NOT THE GROUND MESH. The ground lattice is fourteen metres
// between corners (`lattice.ts`), which is right for a country — a hillside
// is the same hillside either side of a cell — and useless for snow. Snow
// is a LAYER, and the whole of what the eye reads it by is its BOUNDARY:
// the bank standing at a ploughed road's lip, four metres from nothing to
// knee-deep. On the ground's lattice that bank falls between two corners
// and is erased, and what is left is a white tint on ground of exactly the
// same shape — flat white ground, which is what a snowfield must never look
// like.
//
// So the coat is its own mesh on its own grid, `STEP` metres, laid over the
// bare country: a sheet whose height is the blanket the engine put there
// (`TerrainField.blanketAt`, sampled on the same fine grid the physics
// reads) less whatever the wheels have packed out of it
// (`Snowpack.sunkAt`). That last term is why the sheet is rebuilt rather
// than built once — a car driving through deep snow WARPS it, and the
// trough behind it is this mesh bending, not a decal laid over it.
//
// AND IT NEEDS ROOM TO BEND INTO (`coatRoom`). The ground tiles are drawn
// UNDER this sheet by exactly that much, because a sheet that sinks below
// them is a sheet the depth buffer throws away: with the tiles left at the
// top of the untouched snow, every trough this mesh bent went behind them
// and a stage full of driven snow drew back as flat white ground with two
// stripes on it. Nothing here may ever go below `bareLatticeAt + rest -
// coatRoom(rest)`, and nothing that lies on the coat may either.
//
// IT FOLLOWS THE CAR. A coat over the whole country would be a million
// triangles of ground nobody is near; a square `REACH` metres across,
// re-anchored as the car drives out of it, is the same picture for a
// fraction of it. Everything past that edge is the ground tiles' own white
// paint, which is what a snowfield a hundred metres away is anyway.
//
// AND IT IS THE SAME SNOW THE CAR IS IN. The height here is the bare
// lattice plus the blanket; the height the physics stands the car at is the
// bare lattice plus `blanket * CLIMATE.blanket.ride` (terrain-ground.ts).
// Both compose the same two numbers, so the car is sunk into the drawn coat
// by exactly the depth it is ploughing through — and no sampling rate on
// either side can make the picture and the physics disagree.

import * as THREE from "three";
import { CLIMATE, TUNING, type Snowpack, type TerrainField } from "@engine";

import { snowLambert } from "./snow-shader.ts";

/** The grid the coat is drawn on, m. Two metres is the blanket's own
 * sampling grid (`SNOW_CELL`), so the sheet resolves every edge the engine
 * actually put in the field and nothing finer is there to find. */
const STEP = 2.5;
/** How far the coat reaches from the car, m — a square `2 * REACH` across.
 * Past it the ground tiles' paint carries the look. */
const REACH = 100;
/** Vertices per side. */
const N = Math.round((REACH * 2) / STEP) + 1;

/** Under this much snow there is nothing to draw: the sheet would be lying
 * on the ground it is supposed to be covering, and z-fighting with it. The
 * fragment throws those away, which is what gives the coat a clean edge at
 * the road's lip instead of a fade into the tile. */
const NOTHING = 0.03;

/** How far around the car a cut-only redraw reaches, m. The wheels can only
 * have carved snow they actually drove over, so this needs to cover the
 * ground crossed between two redraws with room for the body's width — a
 * couple of car lengths, not the whole sheet. */
const FRESH_REACH = 18;

/** How many freshly worked cells of snow it takes to redraw the sheet. A
 * pass over one cell is `CLIMATE.pack.cell` of trail, so this is a couple
 * of car lengths of new rut — under a frame's worth at racing speed, and
 * far more than the sheet's own 2.5 m grid can show. */
const WORK_REDRAW = 24;

/** THE ROOM UNDER THE COAT, m — how far the drawn snow may be pressed
 * before it reaches the ground the rest of the world is drawn at.
 *
 * The country's tiles are a fourteen-metre lattice, and on a white stage
 * they are laid THIS FAR UNDER the top of the untouched snow
 * (`terrain.ts`). That is not a fudge, it is the whole reason the coat can
 * show anything at all. A sheet that sinks below the tile is a sheet the
 * depth buffer throws away — so with the tile still drawn at the height the
 * snow used to stand at, a car that had flattened a third of a metre of
 * powder left a trough standing UNDER the ground, and the only thing left
 * of its trail was the colour. The snow remembered and nothing showed it.
 *
 * It is the car's own BELLY (`TUNING.snow.clearance`): the deepest snow a
 * body can press and still be riding over it rather than bulldozing it, and
 * so the deepest mark a car can leave that is a TRACK rather than a trench.
 * Snow deeper than that is drawn pressed to here and no further — what is
 * given up is the bottom of a hole nobody can see into anyway. */
export const COAT_ROOM = TUNING.snow.clearance;

/** ...and the room under a given depth of snow, m: never more than the
 * column itself has to give (`CLIMATE.pack.floor` is what a fully worked
 * one still stands at), so a thin cover leaves a thin room and bare ground
 * — the road's corridor, the water, every green stage — leaves none at all.
 * That last part is what keeps the tiles exactly where they always were
 * everywhere the snow is not. */
export function coatRoom(rest: number): number {
  return Math.min(COAT_ROOM, Math.max(0, rest) * (1 - CLIMATE.pack.floor));
}

/** How far in from the sheet's rim the coat comes back down to the tiles, m.
 * Past the rim the TILES are the snow, and they are laid `coatRoom` under
 * its top — so a coat that kept its full depth to the last row would stand
 * a belly's worth proud of them and ring the car with a low cliff wherever
 * the snow is deep. Brought down to meet them instead, the seam is a
 * hillside a hand's breadth shallower a hundred metres away, which is not a
 * thing anybody can see. */
const RIM_FADE = 15;

/** How far the sheet is lifted off the bare ground, m — enough that a
 * shallow cover still wins the depth test over the tile under it. */
const LIFT = 0.02;

/** HOW FAR THE SNOW'S SURFACE HAS COME DOWN at a point, m, averaged over
 * one cell of the sheet — four taps at the quarter points, which is the
 * coarsest average that cannot fall entirely between two wheel ruts.
 *
 * `sunkAt` and not `cutAt`: the wheels sink by only the loose share of what
 * the packing took out of the column, while the top of the snow loses the
 * whole of it. This sheet IS the top of the snow. Drawn off the wheels'
 * number it sank by a few centimetres where the car had flattened a third
 * of a metre, which is a car leaving no mark on snow it had demonstrably
 * ploughed.
 *
 * Averaged rather than read at the point, and that is deliberate: a wheel
 * rut is about 0.75 m wide and the pair of them 1.5 m apart, which is finer
 * than this sheet can hold. Point-sampled, a vertex either lands in a rut
 * or misses it and the coat dimples at random instead of sagging. Averaged,
 * the sheet carries the BROAD depression a driven-over patch of snow has —
 * the trough the body pressed — and `snow-marks.ts` draws the two furrows
 * in the floor of it. Each surface then says the thing it can say. */
function meanSunk(snow: Snowpack, x: number, z: number): number {
  const q = STEP / 4;
  return (
    (snow.sunkAt(x - q, z - q) +
      snow.sunkAt(x + q, z - q) +
      snow.sunkAt(x - q, z + q) +
      snow.sunkAt(x + q, z + q)) /
    4
  );
}

/** ...and as much of it as the coat has ROOM to show, m — what the drawn
 * snow at a point has actually come down by. Everything that lies on the
 * coat asks for this rather than the pack, because a mark sunk by more than
 * the coat sank is a mark under the coat. */
export function coatSagAt(
  field: TerrainField,
  snow: Snowpack | null,
  x: number,
  z: number,
): number {
  if (!snow || !snow.white) return 0;
  const rest = field.blanketAt(x, z);
  if (rest <= 0) return 0;
  return Math.min(meanSunk(snow, x, z), coatRoom(rest));
}

/** THE HEIGHT OF THE DRAWN COAT at a point, m — read the way the sheet
 * draws it rather than off the snow itself.
 *
 * The sheet's vertices sit on a FIXED world lattice `STEP` metres apart
 * (`update` snaps its corner to it, so the coat does not shimmer as the car
 * drives along it), and between them the mesh is flat. So this is the same
 * surface, sampled: a bilinear over the four lattice corners the point
 * falls between.
 *
 * Anything that has to LIE ON the coat reads it here. The alternative —
 * asking the pack directly, which answers at the 0.4 m grain a wheel
 * actually carves at — puts a fine rut UNDER a coarse sheet at every point
 * where the sheet's average is deeper than the rut beside it, and a thing
 * under the coat is a thing the coat hides. */
export function coatHeightAt(
  field: TerrainField,
  snow: Snowpack | null,
  x: number,
  z: number,
): number {
  const gx = x / STEP;
  const gz = z / STEP;
  const i = Math.floor(gx);
  const j = Math.floor(gz);
  const fx = gx - i;
  const fz = gz - j;
  const at = (di: number, dj: number): number => {
    const vx = (i + di) * STEP;
    const vz = (j + dj) * STEP;
    return field.bareLatticeAt(vx, vz) + field.blanketAt(vx, vz) - coatSagAt(field, snow, vx, vz);
  };
  const a = at(0, 0);
  const b = at(1, 0);
  const c = at(0, 1);
  const d = at(1, 1);
  return (a * (1 - fx) + b * fx) * (1 - fz) + (c * (1 - fx) + d * fx) * fz;
}

/** The snow's own white, and what it becomes where a wheel has worked it.
 * Fresh snow is very slightly blue rather than pure white: a white that
 * clips to the same value across a whole hillside has no form in it, and
 * the blue is what the shaded side of a drift actually is — sky light,
 * scattered out of the pack. */
const FRESH = new THREE.Color(0xf4f8ff);
const PACKED = new THREE.Color(0xb9c6d6);

/** THE COAT'S OWN MATERIAL: the shared snow surface (`snow-shader.ts` —
 * wrap lighting and the glitter, which the trail laid on top of this sheet
 * carries too), plus the one thing that belongs to the sheet alone. Where
 * the blanket has run out there is nothing to draw: the fragment is thrown
 * away rather than faded, which is what gives the coat a clean edge at the
 * road's lip instead of a seam across the tile under it. */
function snowMaterial(): THREE.MeshLambertMaterial {
  return snowLambert({ vertexColors: true }, () => ({
    vertex: [
      ["#include <common>", "attribute float depth;\n varying float vDepth;"],
      ["#include <begin_vertex>", "vDepth = depth;"],
    ],
    fragment: [
      ["#include <common>", "varying float vDepth;"],
      ["#include <clipping_planes_fragment>", `if (vDepth < ${NOTHING.toFixed(3)}) discard;`],
    ],
  }));
}

export type SnowMantle = {
  object: THREE.Object3D;
  /** Re-lay the coat around a point. Cheap to call every frame: the sheet
   * is only rebuilt when the car has walked a whole cell out of where it
   * was laid, or when the snow under it has been driven through since. */
  update: (x: number, z: number, snow: Snowpack | null) => void;
  dispose: () => void;
};

/** Lay a coat of snow over the country, or nothing at all where the climate
 * leaves it green — a green stage builds no mesh and pays nothing. */
export function createSnowMantle(field: TerrainField): SnowMantle | null {
  if (!field.snowy) return null;

  const positions = new Float32Array(N * N * 3);
  const normals = new Float32Array(N * N * 3);
  const colors = new Float32Array(N * N * 3);
  const depths = new Float32Array(N * N);
  // The heights, kept so the normals can be finite differences of the
  // sheet itself rather than of the ground under it — a rut has to shade.
  const H = new Float32Array(N * N);

  const indices = new Uint32Array((N - 1) * (N - 1) * 6);
  let at = 0;
  for (let j = 0; j < N - 1; j++) {
    for (let i = 0; i < N - 1; i++) {
      const k = j * N + i;
      indices[at++] = k;
      indices[at++] = k + N;
      indices[at++] = k + 1;
      indices[at++] = k + 1;
      indices[at++] = k + N;
      indices[at++] = k + N + 1;
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geo.setAttribute("depth", new THREE.BufferAttribute(depths, 1));
  geo.setIndex(new THREE.BufferAttribute(indices, 1));
  const material = snowMaterial();
  const mesh = new THREE.Mesh(geo, material);
  mesh.name = "snow-mantle";
  // The coat is laid in world coordinates, so it must never be culled
  // against a bounding sphere computed for where it used to be.
  mesh.frustumCulled = false;
  mesh.receiveShadow = true;

  let anchorX = Number.NaN;
  let anchorZ = Number.NaN;
  /** How many cells the pack had worked when the sheet was last laid — the
   * one cheap number that says whether anything has driven through the snow
   * since, and so whether the trough in it has moved. */
  let workedAt = -1;
  const tint = new THREE.Color();

  /** Re-sample part of the sheet: the rows and columns `[i0, i1] x [j0, j1]`,
   * which is the whole of it when the anchor has moved and a patch around
   * the car when only the snow under it has changed. */
  const lay = (
    originX: number,
    originZ: number,
    snow: Snowpack | null,
    i0: number,
    i1: number,
    j0: number,
    j1: number,
  ): void => {
    for (let j = j0; j <= j1; j++) {
      const z = originZ + j * STEP;
      for (let i = i0; i <= i1; i++) {
        const x = originX + i * STEP;
        const k = j * N + i;
        const rest = field.blanketAt(x, z);
        // What the wheels have taken out of it (`meanSunk`), and how much of
        // that there is room to SHOW: the tiles under this sheet are laid
        // `coatRoom` beneath the untouched top, and a vertex pressed past
        // them is a vertex behind them.
        const raw = rest > 0 && snow ? meanSunk(snow, x, z) : 0;
        const room = coatRoom(rest);
        const cut = Math.min(raw, room);
        // ...and at the SHEET'S RIM the coat comes down to the tiles, which
        // is where the same snow is drawn a metre further out. Inside the
        // fade this is exactly `rest - cut`; at the last row it is the
        // tile's own height, so the two surfaces meet instead of stepping.
        const edge = Math.min(1, (Math.min(i, N - 1 - i, j, N - 1 - j) * STEP) / RIM_FADE);
        const depth = Math.max(0, rest - room + (room - cut) * edge);
        const y = field.bareLatticeAt(x, z) + depth + LIFT;
        H[k] = y;
        positions[k * 3] = x;
        positions[k * 3 + 1] = y;
        positions[k * 3 + 2] = z;
        depths[k] = depth;
        // Worked snow is the darker, bluer of the two: what the wheels
        // pressed down is a floor, and the field beside it is crystals.
        // Off the RAW fall rather than the drawn one — how worked a patch of
        // snow is is a fact about the snow, and it goes on darkening after
        // the coat has run out of room to sink any further.
        const worked = rest > 1e-3 ? Math.min(1, raw / (rest * CLIMATE.blanket.ride)) : 0;
        tint.copy(FRESH).lerp(PACKED, worked);
        colors[k * 3] = tint.r;
        colors[k * 3 + 1] = tint.g;
        colors[k * 3 + 2] = tint.b;
      }
    }
    // Normals off the sheet's own slope, central differences where there is
    // a neighbour either side and one-sided at the rim. One ring wider than
    // the window: a vertex just outside it reads a height that just changed.
    const n0 = Math.max(0, j0 - 1);
    const n1 = Math.min(N - 1, j1 + 1);
    const m0 = Math.max(0, i0 - 1);
    const m1 = Math.min(N - 1, i1 + 1);
    for (let j = n0; j <= n1; j++) {
      for (let i = m0; i <= m1; i++) {
        const k = j * N + i;
        const l = i > 0 ? H[k - 1] : H[k];
        const r = i < N - 1 ? H[k + 1] : H[k];
        const d = j > 0 ? H[k - N] : H[k];
        const u = j < N - 1 ? H[k + N] : H[k];
        const spanX = (i > 0 ? 1 : 0) + (i < N - 1 ? 1 : 0);
        const spanZ = (j > 0 ? 1 : 0) + (j < N - 1 ? 1 : 0);
        const dx = (l - r) / (spanX * STEP);
        const dz = (d - u) / (spanZ * STEP);
        const len = Math.hypot(dx, 1, dz);
        normals[k * 3] = dx / len;
        normals[k * 3 + 1] = 1 / len;
        normals[k * 3 + 2] = dz / len;
      }
    }
    geo.getAttribute("position").needsUpdate = true;
    geo.getAttribute("normal").needsUpdate = true;
    geo.getAttribute("color").needsUpdate = true;
    geo.getAttribute("depth").needsUpdate = true;
  };

  return {
    object: mesh,
    update: (x, z, snow) => {
      // Snapped to the grid so the sheet's vertices sit at the same world
      // positions from one laying to the next — a sheet that slid with the
      // car would shimmer as every vertex re-sampled a different point.
      const originX = Math.floor((x - REACH) / STEP) * STEP;
      const originZ = Math.floor((z - REACH) / STEP) * STEP;
      const worked = snow ? snow.worked : 0;
      // Re-laid when the car has walked out of the sheet, or when enough
      // fresh snow has been worked to have moved the trough. NOT on every
      // cell the wheels touch: a car at speed works a few every step, and
      // re-sampling six thousand vertices that often is a frame's whole
      // budget spent redrawing a rut that moved by centimetres.
      const moved = originX !== anchorX || originZ !== anchorZ;
      const carved = worked - workedAt >= WORK_REDRAW;
      if (!moved && !carved) return;
      anchorX = originX;
      anchorZ = originZ;
      workedAt = worked;
      if (!moved) {
        // Only the snow changed, and only where the car has just been. Re-lay
        // the patch around it rather than the whole sheet: a rut appears
        // under the wheels and nowhere else, and re-sampling six thousand
        // vertices to move a few hundred of them is a frame's whole budget.
        const ci = Math.round((x - originX) / STEP);
        const cj = Math.round((z - originZ) / STEP);
        const r = Math.ceil(FRESH_REACH / STEP);
        lay(
          originX,
          originZ,
          snow,
          Math.max(0, ci - r),
          Math.min(N - 1, ci + r),
          Math.max(0, cj - r),
          Math.min(N - 1, cj + r),
        );
        return;
      }
      lay(originX, originZ, snow, 0, N - 1, 0, N - 1);
    },
    dispose: () => {
      geo.dispose();
      material.dispose();
    },
  };
}
