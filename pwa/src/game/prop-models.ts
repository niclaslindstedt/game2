// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE MODELLED PROPS the world draws: the things beside the road that are
// neither a car of the catalog nor a plant — the public traffic, the train,
// a farm's gear, its bales and its livestock, the wind turbines' machines
// and the solar farm's tables, the wild's stones, the crowd's figure, the
// road's markers and cones — each MODELLED in Blender over the skeleton its
// own code builder lays (`make blender KIND=prop`, `scripts/blender/prop.py`
// off `scripts/lib/prop-model-data.mjs`), committed as one glTF a kind in
// `pwa/models/props/` by `make models` and packed by every build — unless a
// build is switched back to the code-built props (`VITE_MODEL_PROPS=0`;
// `model-switch.ts`). A kind whose file did not load is drawn by its code,
// as every prop is under the switch.
//
// A MODEL CARRIES NO COLOUR: every face's material is NAMED for its ROLE
// — a key of the builder's own tint table (`glass`, `tyre`, `hub`, …),
// `paint` for the part a vehicle is painted in, or a colour's own value
// (`#8a6a48`) where a builder tinted a one-off — and every vertex a SHADE.
// `propModel` dresses it here through the caller's own table, in the code
// geometry's own frame and attributes (position, normal, colour, uv, not
// indexed), so the mesh, the instancing and the material take it in the
// code's place without knowing the difference.
//
// WHICH kinds there are is `prop-kinds.ts` (read by the build that packs
// them and by the labs' scripts, without the engine); which ids each
// carries is `PROP_KINDS` below, read by the driver and the registry; the
// factories they are traced off are each kind's own module, reached by the
// driver alone.

import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { TRAFFIC_MODELS } from "@engine";

import { modelSwitch } from "./model-switch.ts";
import { PROP_KIND_LIST, propModelFile, type PropKind } from "./prop-kinds.ts";

export { PROP_KIND_LIST, propModelFile, type PropKind };

/** The build's environment — Vite's in the app; none in the suite. */
const ENV = (import.meta as { env?: Record<string, string | boolean | undefined> }).env ?? {};

/** Whether this build draws the modelled props (ON unless turned off). */
export const PROP_MODELS = modelSwitch(ENV.VITE_MODEL_PROPS);

/** EVERY KIND OF PROP, and every id of it a model carries as a mesh of that
 * name (`<id>` in the kind's glTF). The ids are the code's own: a traffic
 * model's, a train car's kind, a machine's kind, a breed in a pose, a
 * turbine's part, a table, a stone, a figure's limb, a marker's style. */
export const PROP_KINDS: Record<PropKind, readonly string[]> = {
  traffic: TRAFFIC_MODELS.map((m) => m.id),
  train: ["railbus", "loco", "timber", "box", "tank"],
  farm: ["tractor", "trailer", "plough", "harrow", "baler", "bale", "baleWrapped"],
  livestock: ["srbGraze", "srbStand", "holsteinGraze", "holsteinStand", "sheepGraze", "sheepStand"],
  energy: ["nacelle", "rotor", "solarTable", "solarCabin"],
  stone: ["stone"],
  crowd: ["leg", "torso", "head", "arm"],
  roadside: ["stake", "snowpole", "block", "cone", "tallCone"],
};

/** One primitive of a model's mesh, read out of its glTF in the code's own
 * frame and metres (through its node, which carries the packed file's
 * quantization step): three numbers a vertex each, the tone's first the
 * shade. */
export type PropPiece = {
  role: string;
  position: Float32Array;
  normal: Float32Array;
  tone: Float32Array;
  index: Uint32Array;
};

/** Every kind's meshes, by id. */
const loaded = new Map<PropKind, Map<string, PropPiece[]>>();
let loading: Promise<void> | null = null;

/** The pieces of a loaded glTF scene, by mesh name (the id). */
export function piecesOf(
  gltf: Pick<GLTF, "scene">,
  ids: readonly string[],
): Map<string, PropPiece[]> {
  const out = new Map<string, PropPiece[]>();
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse((o) => {
    if (!ids.includes(o.name)) return;
    const meshes: THREE.Mesh[] = [];
    if (o instanceof THREE.Mesh) meshes.push(o);
    else o.traverse((c) => c instanceof THREE.Mesh && meshes.push(c));
    const pieces: PropPiece[] = [];
    for (const m of meshes) {
      const g = m.geometry as THREE.BufferGeometry;
      const pos = g.getAttribute("position");
      const nrm = g.getAttribute("normal");
      const tone = g.getAttribute("color");
      if (!pos || !nrm || !g.index) continue;
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
        tones[i * 3] = tone ? tone.getX(i) : 1;
        tones[i * 3 + 1] = tone ? tone.getY(i) : 0;
        tones[i * 3 + 2] = tone ? tone.getZ(i) : 0;
      }
      pieces.push({
        role: mat.name,
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

/** Fetch every kind's model, once (`base` where the site's `models/` is);
 * resolves when all are in or given up on. */
export function loadPropModels(base = String(ENV.BASE_URL ?? "/")): Promise<void> {
  if (loading) return loading;
  if (!PROP_MODELS) return (loading = Promise.resolve());
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  loading = Promise.all(
    PROP_KIND_LIST.map((kind) =>
      loader.loadAsync(`${base}models/${propModelFile(kind)}`).then(
        (g) => void loaded.set(kind, piecesOf(g, PROP_KINDS[kind])),
        () => undefined,
      ),
    ),
  ).then(() => undefined);
  return loading;
}

/** Hand a kind's parsed model in directly (a lab, the suite). */
export function setPropModel(kind: PropKind, pieces: Map<string, PropPiece[]>): void {
  loaded.set(kind, pieces);
}

/** Whether a kind's model has arrived. */
export function hasPropModel(kind: PropKind, id: string): boolean {
  return PROP_MODELS && !!loaded.get(kind)?.get(id)?.length;
}

/** How many metres of a surface one repeat of the speckle map spans: the
 * code's parts each take it about once over their own size. */
const GRAIN = 1.5;

/** A role's colour: the caller's table, `paint` and a tinted one-off. */
export type Dress = (role: string) => THREE.Color | null;

/** A dress off a tint table, with `paint` for the painted part. */
export function dressOf(tints: Record<string, THREE.Color>, paint?: THREE.Color): Dress {
  return (role) => (role === "paint" ? (paint ?? null) : (tints[role] ?? null));
}

/**
 * ONE PROP'S MODEL, dressed, in the code geometry's own frame: a FRESH
 * unindexed geometry with the code's attributes, the caller's to keep and
 * dispose exactly as it keeps the code's own; or null when this build
 * draws the code's, or the kind's model has not arrived (the code draws
 * it). A role the dress does not know is taken as a colour's own value
 * (`#rrggbb`), else left grey.
 */
export function propModel(kind: PropKind, id: string, dress: Dress): THREE.BufferGeometry | null {
  const pieces = PROP_MODELS ? loaded.get(kind)?.get(id) : undefined;
  if (!pieces || pieces.length === 0) return null;
  const pos: number[] = [];
  const nrm: number[] = [];
  const col: number[] = [];
  const uv: number[] = [];
  const c = new THREE.Color();
  const grey = new THREE.Color(0x888888);
  for (const piece of pieces) {
    const base =
      dress(piece.role) ?? (piece.role.startsWith("#") ? new THREE.Color(piece.role) : grey);
    const { position: at, normal: nr, tone, index } = piece;
    for (const k of index) {
      const x = at[k * 3];
      const y = at[k * 3 + 1];
      const z = at[k * 3 + 2];
      pos.push(x, y, z);
      nrm.push(nr[k * 3], nr[k * 3 + 1], nr[k * 3 + 2]);
      c.copy(base).multiplyScalar(tone[k * 3]);
      col.push(c.r, c.g, c.b);
      uv.push((x + z) / GRAIN, y / GRAIN);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.computeBoundingSphere();
  return g;
}
