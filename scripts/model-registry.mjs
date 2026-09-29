#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE MODEL REGISTRY'S PAGE — `docs/models.md`'s table rewritten from
// `pwa/src/game/model-registry.ts` (which assets are Blender models and which
// the code generates). Pure Node, instant.
//
//   make model-registry              rewrite the table
//   make model-registry ARGS=--check exit non-zero when the page is stale
//
// The table sits between two markers and is never hand-edited;
// `tests/model_registry_test.ts` holds the page to the registry.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

import { parseArgs } from "@niclaslindstedt/oss-game-framework/tooling/cli";
import { aliasEngine } from "@niclaslindstedt/oss-game-framework/tooling/alias";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
aliasEngine(root);
const { renderModelRegistry, registryTableIn, sameTable, withRegistryTable } = await import(
  join(root, "pwa/src/game/model-registry.ts")
);

const args = parseArgs(
  process.argv.slice(2),
  { check: { kind: "flag", help: "compare instead of writing; exit 1 on a difference" } },
  "usage: npm run model-registry -- [--check]",
);

const page = join(root, "docs/models.md");
const had = readFileSync(page, "utf8");
const table = renderModelRegistry();
const fresh = sameTable(registryTableIn(had), table);
if (args.check) {
  console.log(
    fresh ? "docs/models.md is fresh" : "docs/models.md is STALE — run `make model-registry`",
  );
  process.exit(fresh ? 0 : 1);
}
if (fresh) {
  console.log("docs/models.md unchanged");
} else {
  writeFileSync(page, withRegistryTable(had, table));
  // The page is committed as prettier leaves it, columns padded.
  execFileSync(join(root, "node_modules", ".bin", "prettier"), ["--write", page], {
    stdio: "ignore",
  });
  console.log("docs/models.md rewritten");
}
