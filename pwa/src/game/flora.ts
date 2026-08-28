// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Planting the flora: the shared library of built shapes, the two materials
// the whole world's greenery is drawn with (one solid, one double-sided and
// wind-swayed), and the two ways a population of plants is instanced — one
// mesh per variant for a densely planted patch (`buildFlora`), or one mesh
// per variant across a whole streaming population (`buildFloraField`).
//
// The look follows the world's rules — chunky facets, saturated vertex
// colors under Lambert light, a nearest-filtered speckle map for grain — so
// a forest of thousands stays a handful of draw calls. What each plant
// looks like is flora-species.ts; the primitives it is built from are
// flora-build.ts.

import * as THREE from "three";
import { createRng, type Season } from "@engine";

import { GeoBuilder, floraPalette } from "./flora-build.ts";
import { VARIANTS } from "./flora-species.ts";
import { detailTexture } from "./textures.ts";

export { TRUNK_COLOR } from "./flora-build.ts";

/** Every plantable variant id — what a biome's mixes may reference. */
export const FLORA_IDS: readonly string[] = Object.keys(VARIANTS);

export type FloraPlacement = {
  id: string;
  x: number;
  y: number;
  z: number;
  scale: number;
  /** Spin around up, radians. */
  spin: number;
};

export type Flora = {
  group: THREE.Group;
  /** Zero out every planted instance whose position `hits` — how an
   * endless run retires plants that road built later runs through. */
  retire: (hits: (x: number, z: number) => boolean) => void;
};

/** How many differently-jittered builds of each variant the world keeps.
 * A plant's shape is fixed the moment its geometry is built, so every
 * instance drawn from one shares it; the variety a forest reads as comes
 * from per-instance scale, spin and tint. A handful of shapes per variant
 * is enough to break up the repeat at any distance a tree is legible from,
 * and the alternative — a fresh build per patch of ground — is a second
 * of geometry work and hundreds of buffer uploads per stage. */
const SHAPES = 3;

/** Every built shape, keyed by variant, jitter AND season — the year's
 * colours are baked into the vertices, so a spring birch and an autumn one
 * are two different geometries and a stage that changes season rebuilds
 * the ones it uses. Shared by every patch of ground that plants one, so
 * each is marked `shared` and every teardown path skips it
 * (lib/shared-gpu.ts) — freeing one with the first chunk to be dropped
 * would blank the forest still standing. */
const shapes = new Map<string, THREE.BufferGeometry>();

function shapeFor(id: string, shape: number, season: Season): THREE.BufferGeometry {
  const key = `${id}#${shape}#${season}`;
  const built = shapes.get(key);
  if (built) return built;
  // Seeded from the variant and jitter alone, so a plant keeps its SHAPE
  // across a change of season and only its colours move — and so a shape is
  // the same however early or late the stage happens to ask for it.
  const rng = createRng((hashId(`${id}#${shape}`) ^ 0x7f4a7c15) >>> 0);
  const b = new GeoBuilder(() => rng.next(), floraPalette(season));
  VARIANTS[id].build(b);
  const geo = b.build();
  geo.userData.shared = true;
  shapes.set(key, geo);
  return geo;
}

function hashId(key: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

/** The breeze clock, shared by every leafy material in the world so the
 * whole ground cover leans the same way at the same moment. */
const uTime = { value: 0 };

/** Advance the breeze. Called ONCE a frame for the whole world — the sway
 * is one uniform, not one per patch of grass. */
export function swayFlora(dt: number): void {
  uTime.value += dt;
}

type FloraMaterials = { solid: THREE.MeshLambertMaterial; leafy: THREE.MeshLambertMaterial };
let materials: FloraMaterials | null = null;

/** The two materials the whole world's flora is drawn with. Built on first
 * use rather than at import, because the speckle map is painted on a
 * canvas and this module is read by tooling that has none. */
function floraMaterials(): FloraMaterials {
  if (materials) return materials;
  const map = detailTexture();
  const solid = new THREE.MeshLambertMaterial({ vertexColors: true, map });
  const leafy = new THREE.MeshLambertMaterial({
    vertexColors: true,
    map,
    side: THREE.DoubleSide,
  });
  // The breeze: each ground-cover instance leans on its own phase (from
  // its world position), displacing tips more than bases.
  leafy.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uTime;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uTime;")
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        {
          float swayPhase = uTime * 1.9;
          #ifdef USE_INSTANCING
            swayPhase += (instanceMatrix[3].x + instanceMatrix[3].z) * 0.31;
          #endif
          float reach = max(transformed.y, 0.0);
          transformed.x += sin(swayPhase) * 0.07 * reach;
          transformed.z += cos(swayPhase * 0.63) * 0.045 * reach;
        }`,
      );
  };
  solid.userData.shared = true;
  leafy.userData.shared = true;
  materials = { solid, leafy };
  return materials;
}

/** Turn a placement list into instanced meshes — one per variant used,
 * over the world's two shared materials (solid and double-sided ground
 * cover) and its shared library of built shapes. `rand` picks which shape
 * of a variant this patch plants and jitters each instance's tint; pass
 * the stage's seeded RNG so a seed always grows the same forest, and the
 * run's season so it grows it in the right colours. */
export function buildFlora(
  placements: FloraPlacement[],
  rand: () => number,
  season: Season,
): Flora {
  const group = new THREE.Group();
  const byId = new Map<string, FloraPlacement[]>();
  for (const p of placements) {
    if (!VARIANTS[p.id]) throw new Error(`unknown flora variant: ${p.id}`);
    let list = byId.get(p.id);
    if (!list) byId.set(p.id, (list = []));
    list.push(p);
  }

  const { solid, leafy } = floraMaterials();

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const v = new THREE.Vector3();
  const sc = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const c = new THREE.Color();

  const planted: { mesh: THREE.InstancedMesh; list: FloraPlacement[] }[] = [];
  for (const [id, list] of byId) {
    const def = VARIANTS[id];
    const geo = shapeFor(id, Math.floor(rand() * SHAPES) % SHAPES, season);
    const mesh = new THREE.InstancedMesh(geo, def.twoSided ? leafy : solid, list.length);
    list.forEach((p, i) => {
      q.setFromAxisAngle(up, p.spin);
      // Sunk a touch below grade so no base floats off a slope.
      m.compose(v.set(p.x, p.y - 0.18 * p.scale, p.z), q, sc.set(p.scale, p.scale, p.scale));
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, c.setScalar(0.88 + rand() * 0.24));
    });
    group.add(mesh);
    planted.push({ mesh, list });
  }
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  return {
    group,
    retire: (hits) => {
      for (const { mesh, list } of planted) {
        let touched = false;
        list.forEach((p, i) => {
          if (!hits(p.x, p.z)) return;
          mesh.setMatrixAt(i, zero);
          touched = true;
        });
        if (touched) mesh.instanceMatrix.needsUpdate = true;
      }
    },
  };
}

/** A pooled planting: ONE instanced mesh per variant across a whole
 * population of patches of ground, rather than one per variant per patch.
 *
 * `buildFlora` above is right for a patch that is big and densely planted
 * — a chunk of road, which puts hundreds of the same tree in one mesh and
 * can be hidden as a unit when the fog swallows it. It is wrong for the
 * open country, which is planted in small cells that each hold a handful
 * of two dozen different variants: that comes out as a draw call per two
 * or three plants. The country all lives inside the fog anyway, so there
 * is nothing to hide and nothing lost by pooling it.
 *
 * A patch is replanted or cleared as a whole; every change rewrites the
 * affected meshes, which is a few hundred matrices and cheap next to the
 * geometry work that put the placements together in the first place. */
export type FloraField = {
  group: THREE.Group;
  /** Plant a patch, replacing whatever it held before. */
  plant: (patch: string, placements: readonly FloraPlacement[]) => void;
  /** Take a patch out of the ground. */
  clear: (patch: string) => void;
  /** Draw only these patches — the pool's answer to frustum culling, which
   * it has otherwise given up: one mesh spanning every patch is one object
   * to three, and the camera stands in the middle of it. Null draws
   * everything. Every call rewrites the meshes, so the caller is the one
   * that has to notice when the set has not actually changed. */
  show: (visible: ReadonlySet<string> | null) => void;
  dispose: () => void;
};

/** Instance capacity is grown in blocks, so a cell arriving one at a time
 * does not rebuild every mesh in the field on every sync. */
const POOL_BLOCK = 64;

export function buildFloraField(season: Season): FloraField {
  const group = new THREE.Group();
  const patches = new Map<string, readonly FloraPlacement[]>();
  const meshes = new Map<string, THREE.InstancedMesh>();
  let visible: ReadonlySet<string> | null = null;

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const v = new THREE.Vector3();
  const sc = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const c = new THREE.Color();

  /** Rewrite every mesh from the patches currently in the ground. */
  const flush = (): void => {
    const byId = new Map<string, FloraPlacement[]>();
    for (const [patch, placements] of patches) {
      if (visible && !visible.has(patch)) continue;
      for (const p of placements) {
        if (!VARIANTS[p.id]) throw new Error(`unknown flora variant: ${p.id}`);
        let list = byId.get(p.id);
        if (!list) byId.set(p.id, (list = []));
        list.push(p);
      }
    }
    const { solid, leafy } = floraMaterials();
    for (const [id, list] of byId) {
      let mesh = meshes.get(id);
      if (!mesh || mesh.instanceMatrix.count < list.length) {
        if (mesh) {
          group.remove(mesh);
          mesh.dispose();
        }
        const room = Math.ceil(list.length / POOL_BLOCK) * POOL_BLOCK;
        // One shape per variant here, chosen off the variant's own name:
        // the country is background, and the shape variety that matters at
        // this distance is between SPECIES, not between builds of one.
        const geo = shapeFor(id, hashId(id) % SHAPES, season);
        mesh = new THREE.InstancedMesh(geo, VARIANTS[id].twoSided ? leafy : solid, room);
        group.add(mesh);
        meshes.set(id, mesh);
      }
      list.forEach((p, i) => {
        q.setFromAxisAngle(up, p.spin);
        // Sunk a touch below grade so no base floats off a slope.
        m.compose(v.set(p.x, p.y - 0.18 * p.scale, p.z), q, sc.set(p.scale, p.scale, p.scale));
        (mesh as THREE.InstancedMesh).setMatrixAt(i, m);
        // Tint from the plant's own POSITION, not from a stream of random
        // numbers: a patch replanted after its neighbour was cleared has
        // to come back the same shade it was.
        (mesh as THREE.InstancedMesh).setColorAt(
          i,
          c.setScalar(0.88 + (hashId(`${p.x.toFixed(1)},${p.z.toFixed(1)}`) / 0xffffffff) * 0.24),
        );
      });
      // Only what was written is drawn — the rest of the block is capacity,
      // and an instance nobody sets would stand at the world origin.
      mesh.count = list.length;
      mesh.visible = true;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
    // A variant with nothing left standing is HIDDEN rather than emptied:
    // an instanced mesh with a count of zero is still a draw call. It keeps
    // its mesh, though — the country ahead is the same country as the
    // country behind, and it will be asked for again within a few hundred
    // metres.
    for (const [id, mesh] of meshes) {
      if (!byId.has(id)) mesh.visible = false;
    }
  };

  return {
    group,
    plant: (patch, placements) => {
      patches.set(patch, placements);
      flush();
    },
    clear: (patch) => {
      if (!patches.delete(patch)) return;
      flush();
    },
    show: (next) => {
      visible = next;
      flush();
    },
    dispose: () => {
      for (const mesh of meshes.values()) mesh.dispose();
      meshes.clear();
      patches.clear();
      group.clear();
    },
  };
}
