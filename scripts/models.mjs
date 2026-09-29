#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE MODELS THE GAME SHIPS, published: the last step of `make models`
// (which first runs `make blender`'s game quality for every car and every
// kind of tree). Copies each car's LOD0 glTF out of the gitignored
// `previews/blender/` into the committed `pwa/models/` under the name the
// build packs it by (`<id>.glb`), PACKS every kind of tree's and plant's
// (`scripts/lib/glb-pack.mjs`: quantized and meshopt-compressed) into
// `pwa/models/trees/<kind>.glb` and `pwa/models/flora/<kind>.glb`, and
// every kind of prop's into `pwa/models/props/<kind>.glb`, and writes
// `pwa/models/sources.json` — the hash of every source each set is made
// from (`MODEL_SOURCES`, `TREE_SOURCES` and `PROP_SOURCES` in
// `pwa/models-plugin.ts`), which `tests/models_test.ts` holds to the tree.
// A set not published keeps its stamp: it was not remade.
//
//   node scripts/models.mjs                  publish what `make blender` made
//   node scripts/models.mjs --set trees      the trees and plants only (cars, props: those)
//   node scripts/models.mjs --check          only say whether the stamps are fresh
//   node scripts/models.mjs --from previews/blender

import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

import { parseArgs } from "@niclaslindstedt/oss-game-framework/tooling/cli";
import { packGlb } from "./lib/glb-pack.mjs";
import {
  MODELS_DIR,
  PROP_SOURCES,
  TREE_SOURCES,
  modelFiles,
  sourcesHash,
} from "../pwa/models-plugin.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = parseArgs(
  process.argv.slice(2),
  {
    check: { kind: "flag", help: "only report whether pwa/models/ is fresh against its sources" },
    set: {
      kind: "string",
      default: "all",
      help: "which set to publish: cars, trees (every plant), props, or all",
    },
    from: {
      kind: "string",
      default: "previews/blender",
      help: "where make blender left the glTFs",
    },
  },
  "usage: node scripts/models.mjs [--check] [--set all|cars|trees|props] [--from previews/blender]",
);
if (!["all", "cars", "trees", "props"].includes(args.set)) {
  console.error(`unknown set "${args.set}" (all, cars, trees, props)`);
  process.exit(2);
}

const out = join(root, MODELS_DIR);
const stampAt = join(out, "sources.json");
const hashes = {
  sources: sourcesHash(root),
  trees: sourcesHash(root, TREE_SOURCES),
  props: sourcesHash(root, PROP_SOURCES),
};
const had = existsSync(stampAt) ? JSON.parse(readFileSync(stampAt, "utf8")) : {};

if (args.check) {
  const stale = Object.keys(hashes).filter((k) => had[k] !== hashes[k]);
  console.log(
    stale.length === 0
      ? "pwa/models/ is fresh"
      : `pwa/models/ is STALE (${stale.join(", ")}) — run \`make models\``,
  );
  process.exit(stale.length === 0 ? 0 : 1);
}

const cars = args.set === "all" || args.set === "cars";
const trees = args.set === "all" || args.set === "trees";
const props = args.set === "all" || args.set === "props";
/** Each published name and the file `make blender` wrote it as. */
const made = (name) =>
  join(
    root,
    args.from,
    /^(trees|flora|props)\//.test(name)
      ? name.replace(/^\w+\//, "")
      : name.replace(".glb", "-lod0.glb"),
  );
const names = modelFiles({ cars, trees, props });
const missing = names.filter((n) => !existsSync(made(n)));
if (missing.length) {
  console.error(
    `not made: ${missing.map(made).join(", ")} — run make blender's game quality first`,
  );
  process.exit(1);
}
for (const dir of ["trees", "flora", "props"]) mkdirSync(join(out, dir), { recursive: true });
for (const n of names) {
  if (/^(trees|flora|props)\//.test(n)) {
    writeFileSync(join(out, n), await packGlb(readFileSync(made(n))));
  } else {
    copyFileSync(made(n), join(out, n));
  }
  console.log(
    `${MODELS_DIR}/${n}  ${(readFileSync(join(out, n)).byteLength / 1024).toFixed(0)} KiB`,
  );
}
const stamp = {
  sources: cars ? hashes.sources : had.sources,
  trees: trees ? hashes.trees : had.trees,
  props: props ? hashes.props : had.props,
  blender: "5.2.2",
};
writeFileSync(stampAt, `${JSON.stringify(stamp, null, 2)}\n`);
console.log(
  `${MODELS_DIR}/sources.json  ${stamp.sources?.slice(0, 12)} · trees ${stamp.trees?.slice(0, 12)} · props ${stamp.props?.slice(0, 12)}`,
);
