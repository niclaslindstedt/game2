// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE MODELLED CARS the game ships (`pwa/models/`, made by `make models`,
// packed by `pwa/models-plugin.ts`, poured into the code-built car by
// `car-models.ts`) — and the modelled trees beside them, stamped apart
// (`tests/tree_models_test.ts` holds what is in them): every one committed,
// none older than the sources it is made from, each within its budget; the switch on unless a build turns it
// back; every material a model carries a ROLE the game dresses; every part
// one the game knows; and the model standing where the code-built car
// stands, so the code's own dress — the bands, the lamps, the glass — lands
// on it rather than inside it or beside it.

import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { describe, expect, it } from "vitest";
import { CARS, type DamagePart } from "@engine";

import {
  MODELS_DIR,
  MODEL_SOURCES,
  TREE_SOURCES,
  modelFiles,
  sourcesHash,
} from "../pwa/models-plugin.ts";
import { TREE_KINDS } from "../pwa/src/game/flora-trees.ts";
import { modelSwitch } from "../pwa/src/game/model-switch.ts";
import { CAR_ROLES, dressOf } from "../pwa/src/game/car-dress.ts";
import { SMOOTH_NORMALS, dressPart, modelOf, type CarModel } from "../pwa/src/game/car-models.ts";
import { buildCarBody } from "../pwa/src/game/car-body.ts";
import { bodySpecFor } from "../pwa/src/game/car-styles.ts";
import { turnFaceNormals } from "../pwa/src/game/car/builder.ts";

const root = join(import.meta.dirname, "..");

/** Every part a model may carry: the shell, the deck under the cabin, the
 * breakables the engine's ledger names, and the four wheels. */
const PARTS = new Set<string>([
  "body",
  "cabin_deck",
  "bumperF",
  "bumperR",
  "hood",
  "hatch",
  "doorL",
  "doorR",
  "mirrorL",
  "mirrorR",
  "spoiler",
  "wheel_fl",
  "wheel_fr",
  "wheel_rl",
  "wheel_rr",
] satisfies (DamagePart | string)[]);

function parse(file: string): Promise<GLTF> {
  const buf = readFileSync(join(root, MODELS_DIR, file));
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  return new Promise((done, fail) => new GLTFLoader().parse(ab, "", done, fail));
}

const models = new Map<string, Promise<CarModel>>();
const modelFor = (id: string): Promise<CarModel> => {
  let m = models.get(id);
  if (!m) models.set(id, (m = parse(`${id}.glb`).then((g) => modelOf(id, g))));
  return m;
};

describe("the models the game ships", () => {
  const all = modelFiles({ cars: true, trees: false });

  it("are every catalog car under its id, and none when switched back", () => {
    expect([...all].sort()).toEqual(CARS.map((c) => `${c.id}.glb`).sort());
    expect(modelFiles({ cars: false, trees: false })).toEqual([]);
  });

  it("are every kind of tree under its kind, stamped apart, and none when switched back", () => {
    const trees = modelFiles({ cars: false, trees: true });
    expect(trees).toEqual(TREE_KINDS.map((k) => `trees/${k}.glb`));
    expect(modelFiles({ cars: true, trees: true })).toEqual([...all, ...trees]);
    for (const f of trees) {
      const at = join(root, MODELS_DIR, f);
      expect(existsSync(at), `${MODELS_DIR}/${f} — run \`make models SET=trees\``).toBe(true);
      // A packed kind is tens of kilobytes to a couple of hundred: one grown
      // past this is a builder that lost its budget, or a file unpacked.
      expect(statSync(at).size, f).toBeLessThan(400_000);
    }
    for (const f of TREE_SOURCES) expect(existsSync(join(root, f)), f).toBe(true);
    const stamp = JSON.parse(readFileSync(join(root, MODELS_DIR, "sources.json"), "utf8")) as {
      trees: string;
    };
    expect(
      stamp.trees,
      "a source of the trees moved since they were made — run `make models SET=trees` and commit pwa/models/",
    ).toBe(sourcesHash(root, TREE_SOURCES));
  });

  it("are all committed, each within its budget", () => {
    for (const f of all) {
      const at = join(root, MODELS_DIR, f);
      expect(existsSync(at), `${MODELS_DIR}/${f} — run \`make models\``).toBe(true);
      // A car's LOD0 is ~0.6 MB: one grown past this is a builder that lost
      // its game budget.
      expect(statSync(at).size, f).toBeLessThan(1_600_000);
    }
  });

  it("are no older than the sources they are made from", () => {
    for (const f of MODEL_SOURCES) expect(existsSync(join(root, f)), f).toBe(true);
    const stamp = JSON.parse(readFileSync(join(root, MODELS_DIR, "sources.json"), "utf8")) as {
      sources: string;
    };
    expect(
      stamp.sources,
      "a source of the cars moved since they were made — run `make models` and commit pwa/models/",
    ).toBe(sourcesHash(root));
  });

  it("carry only parts the game knows, dressed only in roles it paints", async () => {
    for (const car of CARS) {
      const model = await modelFor(car.id);
      for (const [name, pieces] of model.parts) {
        expect(PARTS.has(name), `${car.id}: part "${name}"`).toBe(true);
        for (const p of pieces) {
          expect(
            (CAR_ROLES as readonly string[]).includes(p.role),
            `${car.id}/${name}: "${p.role}"`,
          ).toBe(true);
        }
      }
      for (const need of ["body", "wheel_fl", "wheel_fr", "wheel_rl", "wheel_rr"]) {
        expect(model.parts.has(need), `${car.id} has ${need}`).toBe(true);
      }
    }
  });

  it("are within the triangle budget", async () => {
    for (const car of CARS) {
      const model = await modelFor(car.id);
      let tris = 0;
      for (const pieces of model.parts.values())
        for (const p of pieces) tris += p.position.length / 9;
      expect(tris, car.id).toBeLessThan(26_000);
    }
  });
});

describe("a model poured into the code-built car", () => {
  it("stands where the code car stands, to a few centimetres", async () => {
    for (const car of CARS) {
      const spec = bodySpecFor(car);
      const model = await modelFor(car.id);
      const code = buildCarBody(spec, { interior: "off", screens: "off" });
      const poured = buildCarBody(spec, { interior: "off", screens: "off", model });
      const a = new THREE.Box3().setFromObject(code.body);
      const b = new THREE.Box3().setFromObject(poured.body);
      for (const k of ["x", "y", "z"] as const) {
        expect(Math.abs(a.min[k] - b.min[k]), `${car.id} min ${k}`).toBeLessThan(0.04);
        expect(Math.abs(a.max[k] - b.max[k]), `${car.id} max ${k}`).toBeLessThan(0.04);
      }
      code.dispose();
      poured.dispose();
    }
  });

  it("keeps every breakable the code car has, the model's own where it carries one", async () => {
    for (const car of CARS) {
      const spec = bodySpecFor(car);
      const model = await modelFor(car.id);
      const code = buildCarBody(spec);
      const poured = buildCarBody(spec, { model });
      expect(Object.keys(poured.breakables).sort()).toEqual(Object.keys(code.breakables).sort());
      for (const [name, mesh] of Object.entries(poured.breakables)) {
        const smooth = Boolean(mesh.geometry.userData[SMOOTH_NORMALS]);
        expect(smooth, `${car.id}/${name}`).toBe(model.parts.has(name));
      }
      // The deck under the greenhouse goes on the car that is sat in.
      const sat = buildCarBody(spec, { model, cockpit: true });
      expect(sat.body.geometry.getAttribute("position").count).toBeLessThan(
        poured.body.geometry.getAttribute("position").count,
      );
      for (const b of [code, poured, sat]) b.dispose();
    }
  });

  it("is dressed in the livery the code car wears", async () => {
    const car = CARS[0];
    const spec = bodySpecFor(car);
    const model = await modelFor(car.id);
    const geo = dressPart(model, ["body"], spec) as THREE.BufferGeometry;
    const col = geo.getAttribute("color");
    const paint = new THREE.Color(spec.colors.paint);
    let hit = false;
    for (let i = 0; i < col.count && !hit; i++) {
      hit =
        Math.abs(col.getX(i) - paint.r) < 1e-6 &&
        Math.abs(col.getY(i) - paint.g) < 1e-6 &&
        Math.abs(col.getZ(i) - paint.b) < 1e-6;
    }
    expect(hit).toBe(true);
    expect(geo.getAttribute("aShine").count).toBe(col.count);
  });
});

describe("the model switch", () => {
  it("is on unless a build turns it back", () => {
    for (const on of [undefined, "", "1", "on", "true", "yes"]) expect(modelSwitch(on)).toBe(true);
    for (const off of ["0", "off", "OFF", "false", "no", " 0 "])
      expect(modelSwitch(off)).toBe(false);
  });
});

describe("a model's dress", () => {
  it("names a colour for every role on every body", () => {
    for (const car of CARS) {
      const spec = bodySpecFor(car);
      for (const role of CAR_ROLES) expect(dressOf(role, spec), `${car.id}/${role}`).not.toBeNull();
      expect(dressOf("paint", spec)).toBe(spec.colors.paint);
      expect(dressOf("not-a-role", spec)).toBeNull();
    }
  });

  it("names every role the builder paints with (car.py and its data read as text)", () => {
    // The two files cannot import the game's table; every role is spelled in
    // one of them, or composed there from a base and an end.
    const text = ["scripts/blender/car.py", "scripts/lib/car-model-data.mjs"]
      .map((f) => readFileSync(join(root, f), "utf8"))
      .join("\n");
    const composed: Record<string, string> = {
      paint_tail: '"_tail"',
      lower_tail: '"_tail"',
      hood_edge: '"_edge"',
      hatch_edge: '"_edge"',
      bumper_f: "bumper_{end}",
      bumper_r: "bumper_{end}",
      strip_f: "strip_{end}",
      strip_r: "strip_{end}",
    };
    for (const role of CAR_ROLES) {
      const spelled = text.includes(`"${role}"`) || text.includes(composed[role] ?? "\0");
      expect(spelled, `the builder paints "${role}"`).toBe(true);
    }
  });
});

describe("a fold on a smooth panel", () => {
  it("keeps the model's own normals where nothing moved, and turns them with the face", () => {
    const rest = new Float32Array([0, 0, 0, 1, 0, 0, 0, 0, -1]); // a face looking up
    const nrm = new Float32Array([0.3, 0.95, 0, 0, 1, 0, -0.3, 0.95, 0]);
    const out = new Float32Array(9);
    turnFaceNormals(rest, rest, nrm, out, 0);
    for (let i = 0; i < 9; i++) expect(out[i]).toBeCloseTo(nrm[i], 6);
    // The same face stood up to look along +z: every normal turns a right
    // angle about −x.
    const bent = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    turnFaceNormals(rest, bent, nrm, out, 0);
    expect(out[1]).toBeCloseTo(0, 5);
    expect(out[2]).toBeCloseTo(0.95, 5);
    expect(out[0]).toBeCloseTo(0.3, 5);
  });
});
