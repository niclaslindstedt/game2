// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE MODELLED TREES the flora draws: every tree variant MODELLED in Blender
// off the very row its code recipe draws with and the skeleton that recipe
// lays (`make blender KIND=tree`, `scripts/blender/tree.py`), committed as
// one glTF a kind in `pwa/models/trees/` by `make models` and packed by
// every build — unless a build is switched back to the code-built trees
// (`VITE_MODEL_TREES=0`; `model-switch.ts`). A kind whose file did not load
// is drawn by its recipe (`flora-species.ts` and kin), as every tree is
// under the switch.
//
// A MODEL CARRIES NO COLOUR: every face's material is NAMED for its paint —
// a colour of the paint box (`SPRUCE_DARK`) or a pair blended up the part
// (`TRUNK_DARK>PINE_BARK`) — and every vertex a SHADE and a BLEND
// (`tree.py`'s header). `treeModel` dresses it here in the season's colours,
// through the same table the code's builder paints its own with
// (`floraPalette`), and hands back a geometry in the very frame and metres
// the code's shape stands in, so the instancing, the shadow pool and the
// winter's load (`snow-cap.ts`) take it without knowing the difference.

import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import type { Season } from "@engine";

import { PAINT_BOX, floraPalette } from "./flora-build.ts";
import { TREE_ROW } from "./flora-tree-rows.ts";
import { TREE_KINDS, TREE_PAINT_ROLE, type TreeColour, type TreeKind } from "./flora-trees.ts";
import { modelSwitch } from "./model-switch.ts";

/** The build's environment — Vite's in the app; none in the suite. */
const ENV = (import.meta as { env?: Record<string, string | boolean | undefined> }).env ?? {};

/** Whether this build draws the modelled trees (ON unless turned off). */
export const TREE_MODELS = modelSwitch(ENV.VITE_MODEL_TREES);

/** The two colours a face's paint names — its first, and the one a vertex's
 * blend goes to (the same again for a single colour) — or null for a name
 * the paint box does not know. Pure, so the suite reads it. */
export function paintColours(name: string): [THREE.Color, THREE.Color] | null {
  const [a, b = a] = name.split(">");
  if (!(a in TREE_PAINT_ROLE) || !(b in TREE_PAINT_ROLE)) return null;
  return [PAINT_BOX[a as TreeColour], PAINT_BOX[b as TreeColour]];
}

/** One primitive of a variant's mesh, read out of its glTF in the tree's
 * own metres (through its node, which carries the packed file's
 * quantization step): three numbers a vertex each. */
export type TreePiece = {
  paint: string;
  position: Float32Array;
  normal: Float32Array;
  tone: Float32Array;
  index: Uint32Array;
};

/** Every kind's variants, by mesh name (`spruceTall`, `spruceTall_far`). */
const loaded = new Map<TreeKind, Map<string, TreePiece[]>>();
let loading: Promise<void> | null = null;
/** Dressed geometries, by variant, band and season: shared by every patch
 * that plants one (`userData.shared`, as the code's shapes are). */
const dressed = new Map<string, THREE.BufferGeometry>();

/** The pieces of a loaded glTF scene, by variant mesh. */
export function piecesOf(gltf: Pick<GLTF, "scene">): Map<string, TreePiece[]> {
  const out = new Map<string, TreePiece[]>();
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse((o) => {
    if (!/^[a-zA-Z]+(_far)?$/.test(o.name) || !(o.name.replace(/_far$/, "") in TREE_ROW)) return;
    const meshes: THREE.Mesh[] = [];
    if (o instanceof THREE.Mesh) meshes.push(o);
    else o.traverse((c) => c instanceof THREE.Mesh && meshes.push(c));
    const pieces: TreePiece[] = [];
    for (const m of meshes) {
      const g = m.geometry as THREE.BufferGeometry;
      const pos = g.getAttribute("position");
      const nrm = g.getAttribute("normal");
      const tone = g.getAttribute("color");
      if (!pos || !nrm || !tone || !g.index) continue;
      const mat = Array.isArray(m.material) ? m.material[0] : m.material;
      const n = pos.count;
      const position = new Float32Array(n * 3);
      const normal = new Float32Array(n * 3);
      const tones = new Float32Array(n * 3);
      const turn = new THREE.Matrix3().getNormalMatrix(m.matrixWorld);
      const v = new THREE.Vector3();
      for (let i = 0; i < n; i++) {
        v.fromBufferAttribute(pos, i)
          .applyMatrix4(m.matrixWorld)
          .toArray(position, i * 3);
        v.fromBufferAttribute(nrm, i)
          .applyMatrix3(turn)
          .normalize()
          .toArray(normal, i * 3);
        tones[i * 3] = tone.getX(i);
        tones[i * 3 + 1] = tone.getY(i);
        tones[i * 3 + 2] = tone.getZ(i);
      }
      pieces.push({
        paint: mat.name,
        position,
        normal,
        tone: tones,
        index: Uint32Array.from(g.index.array),
      });
    }
    out.set(o.name, pieces);
  });
  return out;
}

/** Fetch every kind's model, once (`base` where the site's `models/` is —
 * the build's base URL unless a lab page says otherwise); resolves when all
 * are in or given up on. */
export function loadTreeModels(base = String(ENV.BASE_URL ?? "/")): Promise<void> {
  if (loading) return loading;
  if (!TREE_MODELS) return (loading = Promise.resolve());
  // The committed models are meshopt-packed (`scripts/lib/glb-pack.mjs`).
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  loading = Promise.all(
    TREE_KINDS.map((kind) =>
      loader.loadAsync(`${base}models/trees/${kind}.glb`).then(
        (g) => void loaded.set(kind, piecesOf(g)),
        () => undefined,
      ),
    ),
  ).then(() => undefined);
  return loading;
}

/** Hand a kind's parsed model in directly (the tree lab, the suite). */
export function setTreeModel(kind: TreeKind, pieces: Map<string, TreePiece[]>): void {
  loaded.set(kind, pieces);
  for (const key of [...dressed.keys()]) {
    if (TREE_ROW[key.split("#")[0]]?.kind === kind) dressed.delete(key);
  }
}

/** How many metres of a surface one repeat of the flora's speckle map
 * spans: about the size of the code's own parts, which each take the map
 * once, so a modelled tree carries the same grain. */
const GRAIN = 2.5;

/**
 * ONE VARIANT'S MODEL, dressed for a season — the tree the road's band
 * draws, or with `sketch` the one the wild beyond it draws — in the code
 * shape's own frame; or null when `id` is not a modelled tree or its kind
 * has no model loaded (the code's recipe draws it).
 */
export function treeModel(id: string, season: Season, sketch = false): THREE.BufferGeometry | null {
  const row = TREE_ROW[id];
  if (!row) return null;
  const key = `${id}#${sketch ? "far" : "full"}#${season}`;
  const done = dressed.get(key);
  if (done) return done;
  const pieces = loaded.get(row.kind)?.get(`${id}${sketch ? "_far" : ""}`);
  if (!pieces || pieces.length === 0) return null;
  const palette = floraPalette(season);
  const pos: number[] = [];
  const nrm: number[] = [];
  const col: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const c = new THREE.Color();
  for (const piece of pieces) {
    const colours = paintColours(piece.paint);
    if (!colours) continue;
    const [a, b] = colours.map((x) => palette.get(x) ?? x);
    const first = pos.length / 3;
    const { position: at, normal: nr, tone } = piece;
    const n = at.length / 3;
    for (let i = 0; i < n; i++) {
      const x = at[i * 3];
      const y = at[i * 3 + 1];
      const z = at[i * 3 + 2];
      pos.push(x, y, z);
      nrm.push(nr[i * 3], nr[i * 3 + 1], nr[i * 3 + 2]);
      c.copy(a)
        .lerp(b, tone[i * 3 + 1])
        .multiplyScalar(tone[i * 3]);
      col.push(c.r, c.g, c.b);
      uv.push((x + z) / GRAIN, y / GRAIN);
    }
    for (const k of piece.index) idx.push(first + k);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  g.userData.shared = true;
  dressed.set(key, g);
  return g;
}
