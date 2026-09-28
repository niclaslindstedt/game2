#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE MODELS THE GAME SHIPS, published: the last step of `make models`
// (which first runs `make blender`'s game quality for every car). Copies
// each car's LOD0 glTF out of the gitignored `previews/blender/` into the
// committed `pwa/models/` under the name the build packs it by (`<id>.glb`),
// and writes `pwa/models/sources.json` — the hash of every source a model
// is made from (`MODEL_SOURCES` in `pwa/models-plugin.ts`), which
// `tests/models_test.ts` holds to the tree.
//
//   node scripts/models.mjs                  publish what `make blender` made
//   node scripts/models.mjs --check          only say whether the stamp is fresh
//   node scripts/models.mjs --from previews/blender

import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

import { MODELS_DIR, modelFiles, sourcesHash } from "../pwa/models-plugin.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
if (argv.includes("--help")) {
  console.log("usage: node scripts/models.mjs [--check] [--from previews/blender]");
  process.exit(0);
}
const unknown = argv.find(
  (a, i) => a.startsWith("--") && !["--check", "--from"].includes(a) && argv[i - 1] !== "--from",
);
if (unknown) {
  console.error(
    `unknown flag "${unknown}" — usage: node scripts/models.mjs [--check] [--from dir]`,
  );
  process.exit(2);
}
const from = argv.includes("--from") ? argv[argv.indexOf("--from") + 1] : "previews/blender";

const out = join(root, MODELS_DIR);
const stampAt = join(out, "sources.json");
const hash = sourcesHash(root);

if (argv.includes("--check")) {
  const had = existsSync(stampAt) ? JSON.parse(readFileSync(stampAt, "utf8")) : {};
  const fresh = had.sources === hash;
  console.log(fresh ? "pwa/models/ is fresh" : "pwa/models/ is STALE — run `make models`");
  process.exit(fresh ? 0 : 1);
}

const names = modelFiles({ cars: true });
const made = (name) => join(root, from, name.replace(".glb", "-lod0.glb"));
const missing = names.filter((n) => !existsSync(made(n)));
if (missing.length) {
  console.error(
    `not made: ${missing.map(made).join(", ")} — run make blender's game quality first`,
  );
  process.exit(1);
}
mkdirSync(out, { recursive: true });
for (const n of names) {
  copyFileSync(made(n), join(out, n));
  console.log(
    `${MODELS_DIR}/${n}  ${(readFileSync(join(out, n)).byteLength / 1024).toFixed(0)} KiB`,
  );
}
writeFileSync(stampAt, `${JSON.stringify({ sources: hash, blender: "5.2.2" }, null, 2)}\n`);
console.log(`${MODELS_DIR}/sources.json  ${hash.slice(0, 12)}`);
