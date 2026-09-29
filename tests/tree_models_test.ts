// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE MODELLED TREES (`pwa/src/game/tree-models.ts`, made by `make blender
// KIND=tree` off `flora-tree-rows.ts` and the skeleton the code's recipes
// lay, published packed in `pwa/models/trees/`): every tree row a flora
// variant and every kind a species with rows; every row's skeleton laid in
// colours the paint box names; every paint a model's faces name one the
// game can dress, dressed in the season's colours; and every committed kind
// decoding, through three's own loader and meshopt decoder, to every one of
// its variants in both bands — standing where the code's shape stands, as
// tall, and within the budget.

import { readFileSync } from "node:fs";
import { join } from "node:path";

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { createRng } from "@engine";
import { describe, expect, it } from "vitest";

import { GeoBuilder, PAINT_BOX, floraPalette, shapeSeed } from "../pwa/src/game/flora-build.ts";
import { VARIANTS } from "../pwa/src/game/flora-species.ts";
import { TREE_ROWS, treeRowsOf } from "../pwa/src/game/flora-tree-rows.ts";
import { TREE_KINDS, type TracedPart, type TreeKind } from "../pwa/src/game/flora-trees.ts";
import {
  paintColours,
  piecesOf,
  setTreeModel,
  treeModel,
  type TreePiece,
} from "../pwa/src/game/tree-models.ts";

const root = join(import.meta.dirname, "..");
const names = new Map(Object.entries(PAINT_BOX).map(([n, c]) => [c, n]));

/** A variant's code-built shape (shape 0, a season's colours) and its
 * skeleton, as the Blender driver takes it. */
function codeOf(id: string, season: "summer" | "autumn" = "summer") {
  const rng = createRng(shapeSeed(id, 0));
  const b = new GeoBuilder(() => rng.next(), floraPalette(season));
  const parts: TracedPart[] = [];
  b.trace = { parts, names };
  VARIANTS[id].build(b);
  const g = b.build();
  g.computeBoundingBox();
  return { box: g.boundingBox as THREE.Box3, parts, tris: g.getAttribute("position").count / 3 };
}

/** A one-triangle piece in one paint, with one tone. */
function piece(paint: string, tone: [number, number, number]): TreePiece {
  return {
    paint,
    position: Float32Array.from([0, 1, 0, 1, 1, 0, 0, 1, 1]),
    normal: Float32Array.from([0, 1, 0, 0, 1, 0, 0, 1, 0]),
    tone: Float32Array.from([...tone, ...tone, ...tone]),
    index: Uint32Array.from([0, 1, 2]),
  };
}

describe("the tree rows", () => {
  it("are every one a flora variant, and every kind has some", () => {
    for (const r of TREE_ROWS) expect(VARIANTS[r.id], r.id).toBeDefined();
    expect(new Set(TREE_ROWS.map((r) => r.id)).size).toBe(TREE_ROWS.length);
    for (const k of TREE_KINDS) expect(treeRowsOf(k).length, k).toBeGreaterThan(0);
  });

  it("lay a skeleton in colours the paint box names, with a stem out of the ground", () => {
    for (const r of TREE_ROWS) {
      const { parts } = codeOf(r.id);
      expect(parts.length, r.id).toBeGreaterThan(0);
      const low = Math.min(...parts.map((p) => Math.min(p.a[1], p.b[1])));
      expect(low, `${r.id} stands on the ground`).toBeLessThan(0.35);
      for (const p of parts) {
        const [a, b] = typeof p.paint === "string" ? [p.paint, p.paint] : p.paint;
        expect(paintColours(`${a}>${b}`), `${r.id}: ${a}>${b}`).not.toBeNull();
      }
    }
  });
});

describe("a tree model's dress", () => {
  it("names only paints the game can dress", () => {
    expect(paintColours("SPRUCE")).toEqual([PAINT_BOX.SPRUCE, PAINT_BOX.SPRUCE]);
    expect(paintColours("TRUNK_DARK>PINE_BARK")).toEqual([
      PAINT_BOX.TRUNK_DARK,
      PAINT_BOX.PINE_BARK,
    ]);
    expect(paintColours("paint")).toBeNull();
    expect(paintColours("SPRUCE>nothing")).toBeNull();
  });

  it("paints a vertex its paint's colours in the season, blended and shaded", () => {
    setTreeModel("birch", new Map([["birch", [piece("BIRCH_LEAF>BIRCH_BARK", [0.5, 0.25, 0])]]]));
    for (const season of ["summer", "autumn"] as const) {
      const g = treeModel("birch", season)!;
      const pal = floraPalette(season);
      const want = (pal.get(PAINT_BOX.BIRCH_LEAF) ?? PAINT_BOX.BIRCH_LEAF)
        .clone()
        .lerp(pal.get(PAINT_BOX.BIRCH_BARK) ?? PAINT_BOX.BIRCH_BARK, 0.25)
        .multiplyScalar(0.5);
      const col = g.getAttribute("color");
      expect(col.getX(0)).toBeCloseTo(want.r, 5);
      expect(col.getY(0)).toBeCloseTo(want.g, 5);
      expect(col.getZ(0)).toBeCloseTo(want.b, 5);
      // The flora's speckle map is laid across it by position.
      expect(g.getAttribute("uv")).toBeDefined();
    }
  });

  it("leaves a plant that is no modelled tree, or a kind with no model, to the code", () => {
    expect(treeModel("fern", "summer")).toBeNull();
    setTreeModel("oak", new Map());
    expect(treeModel("oak", "summer")).toBeNull();
  });
});

describe("the committed tree models", () => {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const parse = async (kind: TreeKind) => {
    const b = readFileSync(join(root, "pwa", "models", "trees", `${kind}.glb`));
    const g = await loader.parseAsync(
      b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer,
      "",
    );
    return piecesOf(g);
  };

  it("decode to every variant of every kind, in both bands, where and as tall as the code's, in the budget", async () => {
    for (const kind of TREE_KINDS) {
      const pieces = await parse(kind);
      setTreeModel(kind, pieces);
      for (const r of treeRowsOf(kind)) {
        const code = codeOf(r.id);
        const full = treeModel(r.id, "summer");
        const far = treeModel(r.id, "summer", true);
        expect(full, `${r.id}`).not.toBeNull();
        expect(far, `${r.id} far`).not.toBeNull();
        for (const p of pieces.get(r.id) ?? [])
          expect(paintColours(p.paint), p.paint).not.toBeNull();
        const tris = (g: THREE.BufferGeometry) => (g.index as THREE.BufferAttribute).count / 3;
        // The full band's budget and the sketch's (`tree.py`'s header).
        expect(tris(full!), r.id).toBeLessThan(2000);
        expect(tris(far!), `${r.id} far`).toBeLessThan(600);
        expect(tris(far!), `${r.id} far`).toBeLessThan(tris(full!));
        for (const g of [full!, far!]) {
          g.computeBoundingBox();
          const box = g.boundingBox as THREE.Box3;
          // Its foot in the ground, its top where the code's is.
          expect(box.min.y, r.id).toBeLessThan(0.05);
          expect(box.max.y, r.id).toBeGreaterThan(code.box.max.y * 0.85);
          expect(box.max.y, r.id).toBeLessThan(code.box.max.y * 1.12 + 0.3);
        }
      }
    }
  });
});
