#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE TREE LAB (`make trees`): every kind of tree the flora plants, every
// variant of it, as one labelled contact sheet (previews/trees*.png) — a
// row a kind, a column a variant, each seen from a car's seat through the
// flora's own geometry and material. With `--models` the MODELLED trees
// (`tree-models.ts`) instead, and with `--compare` each kind's code-built
// row over its modelled one, the triangles under every cell: the verdict
// on a `make blender KIND=tree` run, before `make models` publishes it.
// Builds its own one-off bundle from the harness page
// (`pwa/trees-preview.html`), so it needs no `make build`. Requires
// `npm i --no-save playwright-core` (or a global one) and a Chromium
// (CHROMIUM_PATH).
//
//   node scripts/trees-preview.mjs                    # the code's trees
//   node scripts/trees-preview.mjs --kinds pine,birch --season autumn
//   node scripts/trees-preview.mjs --models           # the committed models (pwa/models/trees/)
//   node scripts/trees-preview.mjs --models --from previews/blender --compare
//                                   # a lab run's models, each kind's code row above them
//   node scripts/trees-preview.mjs --models --sketch  # the models' far sketches

import { copyFileSync, existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

import { findChromium } from "@niclaslindstedt/oss-game-framework/tooling/chromium";
import { parseArgs } from "@niclaslindstedt/oss-game-framework/tooling/cli";
import { serveDir } from "@niclaslindstedt/oss-game-framework/tooling/serve-dist";

import { FLORA_KINDS, floraModelFile } from "../pwa/src/game/flora-trees.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const buildDir = join(root, "previews", ".trees-preview");
const outDir = join(root, "previews");

const args = parseArgs(
  process.argv.slice(2),
  {
    kinds: {
      kind: "string",
      default: "",
      help: "only these kinds (spruce,pine,…); every one when left out",
    },
    season: {
      kind: "string",
      default: "summer",
      help: "whose colours: spring, summer, autumn, winter",
    },
    sketch: { kind: "flag", help: "with --models: the far sketches the wild draws" },
    models: { kind: "flag", help: "draw the MODELLED trees (every <kind>.glb in --from)" },
    from: {
      kind: "string",
      default: "pwa/models/trees",
      help: "where --models finds them (previews/blender: a make blender run's)",
    },
    compare: { kind: "flag", help: "with --models: each kind's code-built row above its models" },
    "skip-build": { kind: "flag", help: "reuse the bundle from the last run" },
    timeout: { kind: "number", default: 600, help: "how long the sheet may take to draw, s" },
    out: { kind: "string", default: "", help: "where the sheet is written" },
  },
  "usage: node scripts/trees-preview.mjs [--kinds a,b] [--season s] [--models] [--from dir] [--compare] [--sketch] [--skip-build] [--out path]",
);

mkdirSync(outDir, { recursive: true });
if (!args["skip-build"] || !existsSync(join(buildDir, "trees-preview.html"))) {
  const { build } = await import("vite");
  await build({
    configFile: false,
    logLevel: "warn",
    root: join(root, "pwa"),
    base: "./",
    resolve: { alias: { "@engine": join(root, "engine", "index.ts") } },
    build: {
      outDir: buildDir,
      emptyOutDir: true,
      chunkSizeWarningLimit: 4000,
      rollupOptions: { input: join(root, "pwa", "trees-preview.html") },
    },
  });
}

// The models go beside the page, where the harness fetches them from.
const models = args.models ? args.from : "";
if (models) {
  // The committed models sit in two folders (`pwa/models/trees/`,
  // `pwa/models/flora/`), a lab run's all in one: each kind's file goes
  // where the page asks for it (`floraModelFile`).
  const dirs =
    args.from === "pwa/models/trees" ? ["pwa/models/trees", "pwa/models/flora"] : [models];
  for (const dir of dirs) {
    if (!existsSync(join(root, dir))) continue;
    for (const f of readdirSync(join(root, dir))) {
      const kind = /^([a-z]+)\.glb$/.exec(f)?.[1];
      if (!kind || !FLORA_KINDS.includes(kind)) continue;
      const to = join(buildDir, "models", floraModelFile(kind));
      mkdirSync(dirname(to), { recursive: true });
      copyFileSync(join(root, dir, f), to);
    }
  }
}

const found = await findChromium();
if (!found) process.exit(1);
const server = await serveDir(buildDir);
const browser = await found.chromium.launch({ executablePath: found.executablePath });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const failures = [];
page.on("pageerror", (err) => {
  failures.push(err.message);
  console.error(`[pageerror] ${err.message}`);
});
const params = new URLSearchParams({ season: args.season });
if (args.kinds) params.set("kinds", args.kinds);
if (args.sketch) params.set("sketch", "1");
if (models) params.set("models", args.compare ? "compare" : "1");
const out =
  args.out ||
  join(
    outDir,
    `trees${models ? (args.compare ? "-compare" : "-models") : ""}${args.sketch ? "-sketch" : ""}${args.season === "summer" ? "" : `-${args.season}`}.png`,
  );
console.log(
  `trees — ${args.kinds || "every kind"}, ${args.season}${args.sketch ? ", sketches" : ""}${models ? `, models from ${models}` : ""}`,
);
await page.goto(`${server.url}trees-preview.html?${params}`);
await page.waitForFunction("window.__done === true", undefined, { timeout: args.timeout * 1000 });
const png = await page.evaluate("window.__png");
writeFileSync(out, Buffer.from(png, "base64"));
console.log(out.replace(`${root}/`, ""));
await browser.close();
await server.close();
if (failures.length > 0) process.exitCode = 1;
