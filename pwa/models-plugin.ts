// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE MODELS EVERY BUILD PACKS: every catalog car's game-quality glTF as
// `models/<id>.glb` and every kind of tree's as `models/trees/<kind>.glb`,
// emitted into the bundle (so the service worker precaches them with
// everything else) and served the same way by the dev server. They are COMMITTED, in `pwa/models/`, made there by `make models`
// (Blender, off the game's own numbers — the `blender-assets` skill), with a
// stamp of the sources they were made from (`sources.json`), which
// `tests/models_test.ts` holds to the sources as they stand: a model older
// than its sources fails the suite. The trees are stamped apart
// (`TREE_SOURCES`), so a tree remade never asks for the cars to be, nor the
// other way round.
//
// A build switched back to the code-built cars or trees (`VITE_MODEL_CARS=0`,
// `VITE_MODEL_TREES=0` — `src/game/model-switch.ts`) packs none of that
// side's files.

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { Plugin } from "vite";

import { CARS } from "../engine/game/defs/cars.ts";
import { TREE_KINDS } from "./src/game/flora-trees.ts";

export type ModelSwitches = { cars: boolean; trees: boolean };

/** Where the committed models are, from the repository's root. */
export const MODELS_DIR = "pwa/models";

/** Every file a build with these switches packs, by its published name. */
export function modelFiles(on: ModelSwitches): string[] {
  return [
    ...(on.cars ? CARS.map((c) => `${c.id}.glb`) : []),
    ...(on.trees ? TREE_KINDS.map((k) => `trees/${k}.glb`) : []),
  ];
}

/** WHAT A MODEL IS MADE FROM: the Blender builder, its shelf and its
 * driver, and the game's own modules the driver reads the car out of — the
 * catalog, the bodies, every builder a plan or a ring is taken from, the
 * dress, and the numbers the rig's clips run by. A change to any of these
 * can move a model; the stamp is their hash. */
export const MODEL_SOURCES = [
  "scripts/blender.mjs",
  "scripts/lib/car-model-data.mjs",
  "scripts/blender/lib.py",
  "scripts/blender/car.py",
  "engine/game/defs/cars.ts",
  "engine/game/defs/tuning-body.ts",
  "pwa/src/game/car-styles.ts",
  "pwa/src/game/car-dress.ts",
  "pwa/src/game/car/spec.ts",
  "pwa/src/game/car/shell.ts",
  "pwa/src/game/car/greenhouse.ts",
  "pwa/src/game/car/builder.ts",
  "pwa/src/game/car/fascia.ts",
  "pwa/src/game/car/trim.ts",
  "pwa/src/game/car/wheels.ts",
  "pwa/src/game/car/engine-bay.ts",
  "pwa/src/game/car/cockpit.ts",
  "pwa/src/game/wheel-steer.ts",
];

/** WHAT A TREE IS MADE FROM: the builder, the shelf and the driver, the
 * data it is handed (the rows, and the skeleton the code's own recipes lay
 * — so every recipe file and the builder under them), and the packer the
 * published files go through. */
export const TREE_SOURCES = [
  "scripts/blender.mjs",
  "scripts/lib/tree-model-data.mjs",
  "scripts/blender/lib.py",
  "scripts/blender/tree.py",
  "scripts/lib/glb-pack.mjs",
  "pwa/src/game/flora-trees.ts",
  "pwa/src/game/flora-tree-rows.ts",
  "pwa/src/game/flora-tree-rows-dry.ts",
  "pwa/src/game/flora-build.ts",
  "pwa/src/game/flora-species.ts",
  "pwa/src/game/flora-alpine.ts",
  "pwa/src/game/flora-desert.ts",
];

/** The sources' hash, from the repository's `root` (line endings as
 * committed: `\r` dropped, so a checkout's conversion moves nothing). */
export function sourcesHash(root: string, sources: readonly string[] = MODEL_SOURCES): string {
  const h = createHash("sha256");
  for (const f of sources) {
    h.update(`${f}\n`);
    h.update(readFileSync(join(root, f), "utf8").replaceAll("\r", ""));
  }
  return h.digest("hex");
}

export function carModels(on: ModelSwitches, root: string): Plugin {
  const dir = join(root, MODELS_DIR);
  const files = modelFiles(on);
  return {
    name: "car-models",
    buildStart() {
      const gone = files.filter((f) => !existsSync(join(dir, f)));
      if (gone.length) {
        this.error(
          `${gone.map((f) => `${MODELS_DIR}/${f}`).join(", ")} is missing — run \`make models\` ` +
            "(it needs Blender), or switch the build back to the code-built ones " +
            "(VITE_MODEL_CARS=0 / VITE_MODEL_TREES=0)",
        );
      }
    },
    generateBundle() {
      for (const f of files) {
        this.emitFile({
          type: "asset",
          fileName: `models/${f}`,
          source: readFileSync(join(dir, f)),
        });
      }
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const name = /\/models\/((?:trees\/)?[\w-]+\.glb)$/.exec(req.url ?? "")?.[1];
        if (!name || !files.includes(name) || !existsSync(join(dir, name))) return next();
        res.setHeader("Content-Type", "model/gltf-binary");
        res.end(readFileSync(join(dir, name)));
      });
    },
  };
}
