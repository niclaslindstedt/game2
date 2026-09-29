// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE MODELLED CARS the game draws: glTFs made in Blender off the game's own
// numbers (`make models`, committed in `pwa/models/` and held fresh against
// their sources by `tests/models_test.ts`) and packed by every build
// (`pwa/models-plugin.ts`) — unless a build is switched back to the
// code-built ones (`VITE_MODEL_CARS=0`, `model-switch.ts`).
//
// A model is not hung BESIDE the code car: it is poured INTO it. The code
// car is still built, part for part (`car-body.ts`), and every mesh the rest
// of the game knows — the shell the crumple bends, each breakable the ledger
// tears off, the wheels car-mesh.ts steers and spins — is still there; what
// changes is the GEOMETRY in the ones a model carries. Each of those gets the
// model's FORMS for that part, dressed here in the livery the code car
// would have worn (`car-dress.ts`), with the code's own DRESS laid over them
// (`MeshBuilder.form`: the bands, the numbers, the lamps and grilles, the
// plate, the handles). So everything the damage model does to a car it does
// to the model — the fold re-derived from rest positions, the paint scuffed
// and chipped, the dirt, a door's hole painted into the flank, a bumper
// thrown down the road as the model's own bumper — and the glass, the lamps,
// the cabin, the crew and the cockpit are the code's, as they always were.
//
// What a model carries is its parts by NAME (the Blender builder's
// `part()`, written into each node's extras): `body`, `cabin_deck` (the
// deck under the greenhouse, dropped on the car that is sat in), the
// breakables the engine names, and the four wheels. A material's name is a
// ROLE (`CAR_ROLES`), and a model keeps no colour of its own.

import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { CARS } from "@engine";

import type { CarBodySpec } from "./car/spec.ts";
import { dressOf, shineOf } from "./car-dress.ts";
import { modelSwitch } from "./model-switch.ts";

/** The build's environment — Vite's, where this runs in the app; none
 * where the suite reads the module (the root program knows no Vite). */
const ENV = (import.meta as { env?: Record<string, string | boolean | undefined> }).env ?? {};

/** Whether this build draws the modelled cars (a build-time switch, ON
 * unless turned off — `model-switch.ts`). */
export const MODELS = { cars: modelSwitch(ENV.VITE_MODEL_CARS) };

/** One material's worth of a part: its role and its triangles, unindexed,
 * in the car's body frame (the chassis's, which is the model's). */
export type ModelPiece = { role: string; position: Float32Array; normal: Float32Array };

/** A loaded model: every part's pieces by the part's name. The wheels are
 * in the body frame too, each at its own corner. */
export type CarModel = { id: string; parts: Map<string, ModelPiece[]> };

const loaded = new Map<string, CarModel>();
let loading: Promise<void> | null = null;

/** Fetch every car's model, once; resolves when all are in (or given up
 * on — a model that does not load leaves its car to the code). */
export function loadCarModels(): Promise<void> {
  if (loading) return loading;
  if (!MODELS.cars) return (loading = Promise.resolve());
  const loader = new GLTFLoader();
  const at = (file: string): string => `${String(ENV.BASE_URL ?? "/")}models/${file}`;
  loading = Promise.all(
    CARS.map((car) =>
      loader.loadAsync(at(`${car.id}.glb`)).then(
        (gltf) => void loaded.set(car.id, modelOf(car.id, gltf)),
        () => undefined,
      ),
    ),
  ).then(() => undefined);
  return loading;
}

/** A car's model, if this build draws them and it has arrived. */
export function carModel(id: string): CarModel | null {
  return MODELS.cars ? (loaded.get(id) ?? null) : null;
}

/** A parsed glTF as a model: every mesh baked into the body frame and filed
 * under the part its node (or an ancestor) names. Exported for the lab,
 * which loads a model the build does not pack. */
export function modelOf(id: string, gltf: GLTF): CarModel {
  const parts = new Map<string, ModelPiece[]>();
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    let holder: THREE.Object3D | null = obj;
    while (holder && typeof holder.userData.part !== "string") holder = holder.parent;
    const name = holder ? (holder.userData.part as string) : "body";
    const geo = (obj.geometry as THREE.BufferGeometry).index
      ? (obj.geometry as THREE.BufferGeometry).toNonIndexed()
      : (obj.geometry as THREE.BufferGeometry).clone();
    geo.applyMatrix4(obj.matrixWorld);
    if (!geo.getAttribute("normal")) geo.computeVertexNormals();
    const material = Array.isArray(obj.material) ? obj.material[0] : obj.material;
    const piece: ModelPiece = {
      role: (material as THREE.Material).name,
      position: new Float32Array(geo.getAttribute("position").array),
      normal: new Float32Array(geo.getAttribute("normal").array),
    };
    geo.dispose();
    const list = parts.get(name) ?? [];
    list.push(piece);
    parts.set(name, list);
  });
  return { id, parts };
}

/** The geometry key a MODELLED mesh carries in `userData`: its REST
 * normals are the model's own smooth ones, which car-damage.ts turns with
 * each fold rather than replacing with the face's. */
export const SMOOTH_NORMALS = "smoothNormals";

/** One part of a model, dressed on this body: the car's own four
 * attributes (car/builder.ts — position, albedo, normal, gloss), unindexed,
 * so everything that paints, bends or throws a code-built part takes it as
 * it is. `offset` moves it (a wheel onto its own axle). Null for a part the
 * model does not carry. */
export function dressPart(
  model: CarModel,
  names: readonly string[],
  spec: CarBodySpec,
  offset?: THREE.Vector3,
): THREE.BufferGeometry | null {
  const pieces = names.flatMap((n) => model.parts.get(n) ?? []);
  if (pieces.length === 0) return null;
  let count = 0;
  for (const p of pieces) count += p.position.length / 3;
  const pos = new Float32Array(count * 3);
  const nrm = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const shn = new Float32Array(count);
  const c = new THREE.Color();
  let at = 0;
  for (const p of pieces) {
    const n = p.position.length / 3;
    pos.set(p.position, at * 3);
    nrm.set(p.normal, at * 3);
    // Linear, the way the builder's `THREE.Color.set` writes the code car.
    c.set(dressOf(p.role, spec) ?? 0x808080);
    const shine = shineOf(p.role);
    for (let i = 0; i < n; i++) {
      col[(at + i) * 3] = c.r;
      col[(at + i) * 3 + 1] = c.g;
      col[(at + i) * 3 + 2] = c.b;
      shn[at + i] = shine;
    }
    at += n;
  }
  if (offset) {
    for (let i = 0; i < count; i++) {
      pos[i * 3] -= offset.x;
      pos[i * 3 + 1] -= offset.y;
      pos[i * 3 + 2] -= offset.z;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(nrm, 3));
  geo.setAttribute("aShine", new THREE.Float32BufferAttribute(shn, 1));
  geo.userData[SMOOTH_NORMALS] = true;
  return geo;
}
