// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE FOREST THE SHADOW MAP SEES — a small pool of the trees closest to the
// car, and the only flora allowed to cast.
//
// WHY IT CANNOT JUST BE A FLAG. The obvious change is `castShadow = true` on
// the flora the world already plants, and it is a trap. Flora is instanced
// per CHUNK (flora.ts), and a finite stage is one chunk — so a species' mesh
// spans the whole stage, its bounding sphere always intersects the shadow
// camera's 80 m frame, and nothing is ever culled from the pass. Every tree
// on a five-kilometre stage would be drawn into the depth map every frame,
// which is exactly the "a forest drawn into one is not" that car-shadow.ts
// warns about.
//
// The layer trick does not save it either: three gates a caster on
// `object.layers.test( camera.layers )` against the SCENE camera
// (WebGLShadowMap), so a mesh the camera cannot see casts nothing. There is
// no "cast but do not draw" flag.
//
// So the casters are a pool of their own: a fixed, small instanced mesh per
// species carrying only the plants inside the map's reach, refilled when the
// car has moved far enough to change which those are. The cost is the CAP,
// whatever the stage's length or its density — which is the whole point, and
// the reason a 5 km forest and a 500 m one meter the same.
//
// The pool is drawn in the colour pass as well (there is no way not to be),
// with `colorWrite` and `depthWrite` off so it puts nothing on the screen
// and occludes nothing. It is a few dozen trees of fragments that write
// nothing, against the thousands of trees of depth it is there to avoid.

import * as THREE from "three";

/** Where one plant stands. Structurally `FloraPlacement` (flora.ts), stated
 * again here rather than imported so this module's whole graph stays
 * DOM-FREE and testable: flora.ts reaches `textures.ts` for its speckle map,
 * and a type-only import is still type-CHECKED — a test that pulls this in
 * would run green under vitest and fail the root typecheck with a page of
 * errors pointing at `document`. */
type PlantedAt = {
  x: number;
  y: number;
  z: number;
  scale: number;
  spin: number;
};

/** One species' worth of plantable geometry, and where that species stands.
 * Handed over by `buildFlora`; the pool never builds geometry of its own. */
export type FloraCasterSource = {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  list: readonly PlantedAt[];
};

/** How many plants may cast at once, per species.
 *
 * Sized off the frame rather than off taste: the map reaches `SHADOW_REACH`
 * (40 m) around a focus biased up the road, and what fits in that circle at
 * the densities the biomes plant at is a few dozen of any one species. Past
 * that the extra trees are behind the ones already casting and change no
 * texel — a shadow map does not care how many things are stacked along the
 * same ray, only about the nearest. */
const CAP = 40;

/** How many SPECIES may cast at once.
 *
 * The cap above bounds how many plants of one species are in the pass; this
 * bounds how many meshes, which is what the draw-call count is made of — a
 * pool that takes every tall variant a biome plants measured at +36 draws a
 * frame, and varied with the country. Sorted tallest first, so what gets in
 * is what throws the longest shadows.
 *
 * Together the two make the top stop cost a FIXED amount rather than one
 * that depends on where the stage is set: at most `MAX_SPECIES` meshes of
 * at most `CAP` instances, on any stage of any length. */
const MAX_SPECIES = 6;

/** How far the focus may move before the pool is refilled, m. The refill is
 * a walk of the stage's whole placement list, so it is worth not doing every
 * frame — and at a step this short the plants that enter the frame do so
 * well before their shadows would reach the car. */
const STEP = 6;

/** How tall a plant has to be before it is worth a draw call, m.
 *
 * The world plants everything through the same builder — spruces, but also
 * ferns, tufts and heather — and a pool that takes them all is one mesh per
 * VARIANT, which measured at +70 draw calls a frame for a stage's worth of
 * undergrowth. What that undergrowth buys is nothing: a 200 mm tuft at the
 * map's own texel size is a few pixels of shadow under a plant already
 * drawn dark against the ground it sits on.
 *
 * So only what can throw a shadow somebody would notice gets in. Measured
 * off the geometry's own height rather than authored per variant, because a
 * new plant should not have to remember to declare itself. */
const MIN_HEIGHT = 1.6;

/** How far past the map's own reach a plant is still taken, m. A tree stands
 * OUTSIDE the frame and throws its shadow INTO it whenever the sun is low,
 * which is exactly when the shadow is longest and most worth having. */
const MARGIN = 22;

export type FloraShadows = {
  /** Hang this in the scene once. */
  group: THREE.Group;
  /** The flora that exists to be cast from — every live chunk's, handed over
   * again whenever a chunk is built or retired. */
  setSources: (sources: readonly FloraCasterSource[]) => void;
  /** Whether the pool casts at all: the LIGHTING row's top stop. Off, the
   * meshes are hidden and the pass never sees them. */
  setEnabled: (on: boolean) => void;
  /** Put the pool around this point, refilling if it has moved far enough.
   * `reach` is the map's own (`SHADOW_REACH`). */
  follow: (focus: THREE.Vector3, reach: number) => void;
  dispose: () => void;
};

export function createFloraShadows(): FloraShadows {
  const group = new THREE.Group();
  group.name = "flora shadows";
  let enabled = false;
  let sources: readonly FloraCasterSource[] = [];
  let meshes: THREE.InstancedMesh[] = [];
  /** The materials cloned per source material, so one clone serves every
   * species that shares it. */
  const silent = new Map<THREE.Material, THREE.Material>();
  const at = new THREE.Vector3(Infinity, 0, Infinity);
  let filled = false;

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const v = new THREE.Vector3();
  const sc = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);

  /** A material that draws nothing but still casts. `visible` must stay TRUE
   * — three skips an invisible material in the shadow pass as well as in the
   * colour one — so the writes are switched off instead. */
  const silence = (source: THREE.Material): THREE.Material => {
    let quiet = silent.get(source);
    if (!quiet) {
      quiet = source.clone();
      quiet.name = "flora-shadow";
      quiet.colorWrite = false;
      quiet.depthWrite = false;
      silent.set(source, quiet);
    }
    return quiet;
  };

  const clear = (): void => {
    for (const mesh of meshes) {
      group.remove(mesh);
      mesh.dispose();
    }
    meshes = [];
  };

  /** How tall this species' biggest plant stands, m — 0 for one that plants
   * nothing. Against the tallest of the species rather than the mean: a
   * variant is planted at a spread of scales, and the big ones are the ones
   * whose shadow reaches the road. */
  const heightOf = (source: FloraCasterSource): number => {
    if (source.list.length === 0) return 0;
    const geo = source.geometry;
    if (!geo.boundingBox) geo.computeBoundingBox();
    const box = geo.boundingBox;
    if (!box) return 0;
    let tallest = 0;
    for (const p of source.list) tallest = Math.max(tallest, p.scale);
    return (box.max.y - box.min.y) * tallest;
  };

  /** The species that actually cast: tall enough to be worth a draw call,
   * and no more of them than the cap. Derived once per source change and
   * held, because the refill has to walk exactly this list in exactly this
   * order to line up with the meshes built from it. */
  let casting: FloraCasterSource[] = [];

  const chooseCasters = (): void => {
    casting = sources
      .filter((source) => heightOf(source) >= MIN_HEIGHT)
      .sort((a, b) => heightOf(b) - heightOf(a))
      .slice(0, MAX_SPECIES);
  };

  const rebuild = (): void => {
    clear();
    chooseCasters();
    for (const source of casting) {
      const mesh = new THREE.InstancedMesh(
        source.geometry,
        silence(source.material),
        Math.min(CAP, source.list.length),
      );
      mesh.castShadow = true;
      mesh.receiveShadow = false;
      // Never culled: its instances are rewritten every refill, so the
      // bounding volume three would cull against is always a frame behind
      // the plants actually in it — and the pool is by construction the
      // handful of things nearest the map's own centre.
      mesh.frustumCulled = false;
      mesh.count = 0;
      mesh.visible = enabled;
      meshes.push(mesh);
      group.add(mesh);
    }
    filled = false;
  };

  const refill = (focus: THREE.Vector3, reach: number): void => {
    const far = (reach + MARGIN) ** 2;
    for (const [i, source] of casting.entries()) {
      const mesh = meshes[i];
      if (!mesh) continue;
      let n = 0;
      for (const p of source.list) {
        const dx = p.x - focus.x;
        const dz = p.z - focus.z;
        if (dx * dx + dz * dz > far) continue;
        q.setFromAxisAngle(up, p.spin);
        // The same sinking flora.ts plants them with, or a shadow starts a
        // finger above the ground its trunk is standing in.
        m.compose(v.set(p.x, p.y - 0.18 * p.scale, p.z), q, sc.setScalar(p.scale));
        mesh.setMatrixAt(n, m);
        if (++n >= mesh.instanceMatrix.count) break;
      }
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
    }
    at.copy(focus);
    filled = true;
  };

  return {
    group,
    setSources: (next) => {
      sources = next;
      rebuild();
    },
    setEnabled: (on) => {
      enabled = on;
      for (const mesh of meshes) mesh.visible = on;
    },
    follow: (focus, reach) => {
      if (!enabled || meshes.length === 0) return;
      const dx = focus.x - at.x;
      const dz = focus.z - at.z;
      if (filled && dx * dx + dz * dz < STEP * STEP) return;
      refill(focus, reach);
    },
    dispose: () => {
      clear();
      for (const quiet of silent.values()) quiet.dispose();
      silent.clear();
    },
  };
}
