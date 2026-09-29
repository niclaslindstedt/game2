// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE MODEL REGISTRY (`pwa/src/game/model-registry.ts`) against the tree:
// its Blender rows are EXACTLY the files the build packs, every path it
// names exists, every Blender row's switch is one the game reads, every
// flora id the game can plant is on exactly one of its rows, and
// `docs/models.md` carries its table as `make model-registry` writes it.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { MODELS_DIR, modelFiles } from "../pwa/models-plugin.ts";
import { VARIANTS } from "../pwa/src/game/flora-species.ts";
import { TREE_ROWS } from "../pwa/src/game/flora-tree-rows.ts";
import {
  MODEL_REGISTRY,
  registryTableIn,
  renderModelRegistry,
  sameTable,
} from "../pwa/src/game/model-registry.ts";

const root = join(import.meta.dirname, "..");
const read = (f: string): string => readFileSync(join(root, f), "utf8");

describe("the model registry", () => {
  it("names every asset once, each with ids", () => {
    const assets = MODEL_REGISTRY.map((r) => r.asset);
    expect(new Set(assets).size).toBe(assets.length);
    for (const r of MODEL_REGISTRY) {
      expect(r.ids.length, r.asset).toBeGreaterThan(0);
      expect(new Set(r.ids).size, r.asset).toBe(r.ids.length);
      expect(r.source === "blender", r.asset).toBe(!!r.blender);
    }
  });

  it("lists as Blender models exactly the files the build ships", () => {
    const listed = MODEL_REGISTRY.flatMap((r) => r.blender?.files ?? []);
    const shipped = modelFiles({ cars: true, trees: true, props: true });
    expect([...listed].sort()).toEqual([...shipped].sort());
    for (const f of listed) {
      expect(existsSync(join(root, MODELS_DIR, f)), `${MODELS_DIR}/${f}`).toBe(true);
    }
  });

  it("puts every plant the flora can plant on one row: a tree's kind, the undergrowth, the dead wood", () => {
    const row = (asset: string) => MODEL_REGISTRY.find((r) => r.asset.startsWith(asset))!.ids;
    const listed = [...TREE_ROWS.map((r) => r.id), ...row("Undergrowth"), ...row("Dead wood")];
    expect(new Set(listed).size, "a plant on two rows").toBe(listed.length);
    expect([...listed].sort()).toEqual(Object.keys(VARIANTS).sort());
  });

  it("points at code, builders and drawers that exist", () => {
    for (const r of MODEL_REGISTRY) {
      for (const f of [...r.code, r.drawnBy, ...(r.blender ? [r.blender.builder] : [])]) {
        expect(existsSync(join(root, f)), `${r.asset}: ${f}`).toBe(true);
      }
    }
  });

  it("names only switches the game reads", () => {
    const readers =
      read("pwa/src/game/car-models.ts") +
      read("pwa/src/game/tree-models.ts") +
      read("pwa/src/game/prop-models.ts");
    for (const r of MODEL_REGISTRY) {
      if (r.blender) expect(readers, r.asset).toContain(`ENV.${r.blender.switch}`);
    }
  });

  it("is the table docs/models.md carries — `make model-registry` rewrites it", () => {
    const table = registryTableIn(read("docs/models.md"));
    expect(sameTable(table, renderModelRegistry()), "run `make model-registry`").toBe(true);
  });
});
