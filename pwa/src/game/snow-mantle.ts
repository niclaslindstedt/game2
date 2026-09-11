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
// (`Snowpack.cutAt`). That last term is why the sheet is rebuilt rather
// than built once — a car driving through deep snow WARPS it, and the
// trough behind it is this mesh bending, not a decal laid over it.
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
import { CLIMATE, type Snowpack, type TerrainField } from "@engine";

import { SUN_DIR } from "./sun-dir.ts";

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

/** How many freshly worked cells of snow it takes to redraw the sheet. A
 * pass over one cell is `CLIMATE.pack.cell` of trail, so this is a couple
 * of car lengths of new rut — under a frame's worth at racing speed, and
 * far more than the sheet's own 2.5 m grid can show. */
const WORK_REDRAW = 24;

/** How far the sheet is lifted off the bare ground, m — enough that a
 * shallow cover still wins the depth test over the tile under it. */
const LIFT = 0.02;

/** The snow's own white, and what it becomes where a wheel has worked it.
 * Fresh snow is very slightly blue rather than pure white: a white that
 * clips to the same value across a whole hillside has no form in it, and
 * the blue is what the shaded side of a drift actually is — sky light,
 * scattered out of the pack. */
const FRESH = new THREE.Color(0xf4f8ff);
const PACKED = new THREE.Color(0xb9c6d6);

/** THE SNOW SHADER, grafted onto a Lambert material rather than written
 * from nothing — the lights, the shadows and the game's own height fog are
 * all in the built-in one already (`height-fog.ts` grafts itself into
 * three's shader chunks), and a material assembled by hand would have to
 * reproduce every one of them to sit in the same world.
 *
 * Two things are added, and they are the two things that separate snow from
 * white paint:
 *
 *   * WRAP LIGHTING — the cheap standing approximation of subsurface
 *     scattering. Light does not stop at the surface of snow, it goes in,
 *     bounces about the grains and comes back out somewhere else, so the
 *     terminator is soft and the shaded side glows instead of going black.
 *     `N·L` is remapped through `(N·L + w) / (1 + w)`, which is that in one
 *     line.
 *
 *   * THE GLITTER — snow sparkles because it is not a surface at all, it is
 *     a heap of crystals, each an almost perfect mirror at a random angle.
 *     A handful of them line up with the sun and the eye at once and flare.
 *     Modelled the way real-time work does it: hash the WORLD position into
 *     a random normal per cell, and give it an extremely tight specular
 *     lobe. World-space, so the glints sit still on the ground and twinkle
 *     as the CAMERA moves, which is what the real thing does — a glitter
 *     that swims with the view reads as noise on the lens. */
function snowMaterial(): THREE.MeshLambertMaterial {
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, fog: true });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uSun = { value: SUN_DIR };
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
         attribute float depth;
         varying float vDepth;
         varying vec3 vWorldPos;`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
         vDepth = depth;
         vWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
         uniform vec3 uSun;
         varying float vDepth;
         varying vec3 vWorldPos;
         // One random unit vector per cell of world space.
         vec3 snowHash(vec3 p) {
           p = fract(p * vec3(0.1031, 0.1030, 0.0973));
           p += dot(p, p.yxz + 33.33);
           return normalize(fract((p.xxy + p.yxx) * p.zyx) * 2.0 - 1.0);
         }`,
      )
      // Nothing at all where the blanket has run out — a clean edge, and
      // the tile underneath showing through rather than a seam.
      .replace(
        "#include <clipping_planes_fragment>",
        `#include <clipping_planes_fragment>
         if (vDepth < ${NOTHING.toFixed(3)}) discard;`,
      )
      .replace(
        "#include <fog_fragment>",
        `{
           vec3 nrm = normalize(vNormal);
           vec3 view = normalize(cameraPosition - vWorldPos);
           // Wrap lighting: the light that went INTO the snow and came back.
           float wrapped = max(0.0, (dot(nrm, uSun) + 0.6) / 1.6);
           gl_FragColor.rgb *= 0.72 + 0.45 * wrapped;
           // ...and the crystals that happened to line up.
           vec3 half3 = normalize(uSun + view);
           vec3 facet = normalize(nrm + snowHash(floor(vWorldPos * 7.0)) * 0.55);
           float glint = pow(max(0.0, dot(facet, half3)), 220.0);
           gl_FragColor.rgb += glint * 1.6 * max(0.0, uSun.y);
         }
         #include <fog_fragment>`,
      );
  };
  return material;
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

  const lay = (originX: number, originZ: number, snow: Snowpack | null): void => {
    for (let j = 0; j < N; j++) {
      const z = originZ + j * STEP;
      for (let i = 0; i < N; i++) {
        const x = originX + i * STEP;
        const k = j * N + i;
        const rest = field.blanketAt(x, z);
        // What the wheels have taken out of it. The pack only ever removes
        // snow, so the coat sags into a trough exactly where a car went
        // through and stands untouched a metre either side of it.
        const cut = rest > 0 && snow ? snow.cutAt(x, z) : 0;
        const depth = Math.max(0, rest - cut);
        const y = field.bareLatticeAt(x, z) + depth + LIFT;
        H[k] = y;
        positions[k * 3] = x;
        positions[k * 3 + 1] = y;
        positions[k * 3 + 2] = z;
        depths[k] = depth;
        // Worked snow is the darker, bluer of the two: what the wheels
        // pressed down is a floor, and the field beside it is crystals.
        const worked = rest > 1e-3 ? Math.min(1, cut / (rest * CLIMATE.blanket.ride)) : 0;
        tint.copy(FRESH).lerp(PACKED, worked);
        colors[k * 3] = tint.r;
        colors[k * 3 + 1] = tint.g;
        colors[k * 3 + 2] = tint.b;
      }
    }
    // Normals off the sheet's own slope, central differences where there is
    // a neighbour either side and one-sided at the rim.
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
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
      if (!moved && worked - workedAt < WORK_REDRAW) return;
      anchorX = originX;
      anchorZ = originZ;
      workedAt = worked;
      lay(originX, originZ, snow);
    },
    dispose: () => {
      geo.dispose();
      material.dispose();
    },
  };
}
