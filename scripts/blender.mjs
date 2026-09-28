#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE BLENDER LAB — a game asset MODELLED in Blender off the game's own
// data: `previews/blender/<id>-*.png` (studio renders on a gravel stage),
// `<id>-lod{0,1,2}.glb` (the game budget) and the `.blend` files to open by
// hand. `make models` publishes the game's own (`scripts/models.mjs`).
//
// It never restates the game: it hands Blender the SAME numbers the game's
// builders read — for a car, its CarBodySpec (`bodySpecFor`), the shell's
// own stations and rings, the greenhouse's panels, every bolt-on's plan
// (`bumperPlan`, `spoilerPieces`, `mirrorPlan`, …), the wheel's shape and
// the numbers the game poses it by — as one JSON file, and a builder under
// `scripts/blender/` models the asset from them in the car's own body
// frame. Nothing it writes is committed: every output lands in the
// gitignored `previews/`. The `blender-assets` skill owns the loop, and
// says how a new KIND is added: a row in `KINDS` and a builder beside
// `car.py`.
//
//   node scripts/blender.mjs                                the compact, both qualities
//   node scripts/blender.mjs --id classic --quality game
//   node scripts/blender.mjs --id all --quality game --views none
//   node scripts/blender.mjs --quality render --views three,rear3 --samples 24
//
// Blender is looked for at `BLENDER`, then the macOS app, then `blender` on
// the PATH. It is run with `--python-use-system-env` and
// `PYTHONDONTWRITEBYTECODE=1`: an app copied without its files' times has
// stale bytecode, and on macOS the rewrite inside the signed bundle blocks
// Python's start for ever.

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

import { aliasEngine } from "./lib/engine-alias.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const QUALITIES = ["render", "game"];
aliasEngine(root);

/** THE KINDS OF ASSET: what the game's data for one is, and its builder. */
const KINDS = {
  car: {
    ids: async () => (await import("../engine/index.ts")).CARS.map((c) => c.id),
    data: async (id) => (await import("./lib/car-model-data.mjs")).carModelData(id),
    builder: "car.py",
    fallback: "compact",
  },
};

const USAGE =
  "usage: node scripts/blender.mjs [--kind car] [--id compact|all] [--quality render|game|both]\n" +
  "                                [--views side,three,rear3,chase,detail|none] [--samples n] [--out dir]";
const FLAGS = {
  kind: "the kind of asset (car)",
  id: "which one (a car's catalog id), or all; the kind's default when left out",
  quality: "render (studio stills, subdivided twice), game (the budget and its LODs), or both",
  views: "only these cameras (side,three,rear3,chase,detail), or none; every one when left out",
  samples: "Cycles samples a still (default 24)",
  out: "where everything is written (default previews/blender)",
};
const args = {
  kind: "car",
  id: "",
  quality: "both",
  views: "",
  samples: "24",
  out: "previews/blender",
};
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--help" || a === "-h") {
    console.log(
      `${USAGE}\n\n${Object.entries(FLAGS)
        .map(([k, v]) => `  --${k}  ${v}`)
        .join("\n")}`,
    );
    process.exit(0);
  }
  const m = /^--([\w-]+)(?:=(.*))?$/.exec(a);
  if (!m || !(m[1] in FLAGS)) {
    console.error(`unknown flag "${a}"\n${USAGE}`);
    process.exit(2);
  }
  args[m[1]] = m[2] ?? argv[++i] ?? "";
}

const kind = KINDS[args.kind];
if (!kind) {
  console.error(`unknown kind "${args.kind}" (${Object.keys(KINDS).join(", ")})`);
  process.exit(2);
}
const qualities = args.quality === "both" ? QUALITIES : [args.quality];
if (!qualities.every((q) => QUALITIES.includes(q))) {
  console.error(`unknown quality "${args.quality}" (render, game, both)`);
  process.exit(2);
}

const ids = await kind.ids();
const wanted = args.id === "all" ? ids : [args.id || kind.fallback];
const unknown = wanted.find((id) => !ids.includes(id));
if (unknown) {
  console.error(`unknown ${args.kind} "${unknown}" (${ids.join(", ")}, all)`);
  process.exit(2);
}

const outDir = join(root, args.out);
mkdirSync(outDir, { recursive: true });

const blender =
  [process.env.BLENDER, "/Applications/Blender.app/Contents/MacOS/Blender"].find(
    (c) => c && existsSync(c),
  ) ?? "blender";

for (const id of wanted) {
  const data = join(outDir, `${id}.json`);
  writeFileSync(data, JSON.stringify(await kind.data(id), null, 1));
  for (const quality of qualities) await model(id, data, quality);
}

/** One builder pass over one asset at one quality; a Python error ends the run. */
async function model(id, data, quality) {
  const t0 = Date.now();
  const code = await new Promise((done) => {
    const child = spawn(
      blender,
      [
        "-b",
        "--factory-startup",
        "--python-use-system-env",
        "--python-exit-code",
        "1",
        "-P",
        join(root, "scripts", "blender", kind.builder),
        "--",
        data,
        outDir,
        String(args.samples),
      ],
      {
        env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1", QUALITY: quality, VIEWS: args.views },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    child.on("error", (err) => {
      console.error(`no Blender (${err.message}): install it, or point BLENDER at its executable`);
      done(1);
    });
    // Blender is loud; what is worth a line is what the builder prints,
    // what was saved, and anything that went wrong. A line can straddle two
    // chunks, so each stream keeps its unfinished tail until the rest comes.
    const tails = new Map();
    const echo = (buf, from) => {
      const lines = ((tails.get(from) ?? "") + buf.toString()).split("\n");
      tails.set(from, lines.pop());
      for (const line of lines) {
        if (/^(BONES|PARTS|CLIPS|TRIANGLES|NOTE)|Saved: '|Error|Traceback|File "/.test(line)) {
          console.log(line.replace(/^.*Saved: '(.*)'.*$/, "saved $1").replace(`${root}/`, ""));
        }
      }
    };
    child.stdout.on("data", (b) => echo(b, "out"));
    child.stderr.on("data", (b) => echo(b, "err"));
    child.on("close", (c) => {
      for (const from of ["out", "err"]) echo("\n", from);
      done(c);
    });
  });
  if (code !== 0) {
    console.error(`blender exited ${code} on the ${quality} pass`);
    process.exit(1);
  }
  console.log(`${args.kind} ${id} · ${quality}  (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
}
