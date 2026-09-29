// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE MODELLED PROPS (`pwa/src/game/prop-models.ts`, made by `make blender
// KIND=prop` over the skeleton each prop's own code factory lays, published
// packed in `pwa/models/props/`): every kind's file decoding, through
// three's own loader and meshopt decoder, to every id the kind names; every
// face's role one the drawing module dresses (its tint table, `paint`, or
// a colour's own value); the dressed geometry carrying the code's own
// attributes; and every model standing where the code's geometry stands,
// about as big, within its budget.

import { readFileSync } from "node:fs";
import { join } from "node:path";

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { describe, expect, it } from "vitest";

import { MODELS_DIR } from "../pwa/models-plugin.ts";
import { PROP_KIND_LIST, propModelFile, type PropKind } from "../pwa/src/game/prop-kinds.ts";
import {
  PROP_KINDS,
  dressOf,
  piecesOf,
  propModel,
  setPropModel,
  type PropPiece,
} from "../pwa/src/game/prop-models.ts";

/** The driver's data script, reached the way the driver reaches it: it
 * runs each prop's own factory, whose modules touch the page's canvas at
 * draw time and are outside the root program's types — so the specifier is
 * a value, and the import is untyped. */
const PROP_DATA = "../scripts/lib/prop-model-data.mjs";
type PropData = {
  variants: { id: string; tris: number; bounds: { min: number[]; max: number[] } }[];
  paint: Record<string, { rgb: number[] }>;
};
async function dataOf(kind: PropKind): Promise<PropData> {
  const mod = (await import(PROP_DATA)) as { propModelData: (k: string) => Promise<PropData> };
  return mod.propModelData(kind);
}

const root = join(import.meta.dirname, "..");

/** Triangles a kind's whole file may carry: the props are drawn by the
 * dozen (a vehicle a mesh) or by the hundred (a figure's part, a stone),
 * and each has its own room. */
const BUDGET: Record<PropKind, number> = {
  traffic: 60_000,
  train: 24_000,
  farm: 12_000,
  livestock: 8_000,
  energy: 3_000,
  stone: 400,
  crowd: 600,
  roadside: 1_500,
};

async function parse(kind: PropKind): Promise<Map<string, PropPiece[]>> {
  const buf = readFileSync(join(root, MODELS_DIR, propModelFile(kind)));
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const gltf = await new Promise<Parameters<typeof piecesOf>[0]>((done, fail) =>
    new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parse(ab, "", done, fail),
  );
  return piecesOf(gltf, PROP_KINDS[kind]);
}

describe("the modelled props", () => {
  for (const kind of PROP_KIND_LIST) {
    it(`${kind}: every id decodes, in the roles its skeleton was painted in, within budget`, async () => {
      const pieces = await parse(kind);
      const data = await dataOf(kind);
      let tris = 0;
      for (const id of PROP_KINDS[kind]) {
        const got = pieces.get(id);
        expect(got?.length, `${kind}/${id}`).toBeGreaterThan(0);
        for (const p of got ?? []) {
          // A role is a key of the module's tint table, `paint`, or a
          // colour's own value — exactly what the factory's parts were
          // named, so the game's dress knows every one.
          const known = p.role in data.paint || (data.paint.paint && p.role === "paint");
          expect(known, `${kind}/${id}: role "${p.role}"`).toBe(true);
          tris += p.index.length / 3;
        }
      }
      expect(tris, kind).toBeLessThan(BUDGET[kind]);
    });
  }

  it("stand where the code's geometry stands, about as big", async () => {
    for (const kind of PROP_KIND_LIST) {
      const pieces = await parse(kind);
      const data = await dataOf(kind);
      for (const v of data.variants) {
        const box = new THREE.Box3();
        for (const p of pieces.get(v.id) ?? []) {
          for (let i = 0; i < p.position.length; i += 3) {
            box.expandByPoint(
              new THREE.Vector3(p.position[i], p.position[i + 1], p.position[i + 2]),
            );
          }
        }
        const code = new THREE.Box3(
          new THREE.Vector3(...(v.bounds.min as [number, number, number])),
          new THREE.Vector3(...(v.bounds.max as [number, number, number])),
        );
        const size = code.getSize(new THREE.Vector3()).length();
        // A modelled edge stands a little proud of the code's plane (a
        // shoulder on a tyre, a base under a cone), never a part away.
        const slack = 0.08 + size * 0.12;
        for (const k of ["x", "y", "z"] as const) {
          expect(Math.abs(box.min[k] - code.min[k]), `${kind}/${v.id} min ${k}`).toBeLessThan(
            slack,
          );
          expect(Math.abs(box.max[k] - code.max[k]), `${kind}/${v.id} max ${k}`).toBeLessThan(
            slack,
          );
        }
      }
    }
  });

  it("dress into the code's own attributes, the paint where the model says paint", async () => {
    setPropModel("traffic", await parse("traffic"));
    const paint = new THREE.Color(0x123456);
    const tints = { glass: new THREE.Color(0x232c36), tyre: new THREE.Color(0x1a1b1d) };
    const g = propModel("traffic", "hatch", dressOf(tints, paint));
    expect(g).not.toBeNull();
    for (const name of ["position", "normal", "color", "uv"]) {
      expect(g!.getAttribute(name), name).toBeDefined();
    }
    expect(g!.index).toBeNull();
    const col = g!.getAttribute("color");
    let painted = 0;
    for (let i = 0; i < col.count; i++) {
      // A painted vertex is the paint under its shade: the same hue.
      const r = col.getX(i);
      const b = col.getZ(i);
      if (r > 0 && Math.abs(r / b - paint.r / paint.b) < 1e-3) painted++;
    }
    // The painted panels are a few hundred vertices of a body whose wheels
    // are most of its count.
    expect(painted).toBeGreaterThan(100);
    expect(propModel("traffic", "not-a-vehicle", dressOf(tints))).toBeNull();
  });
});
