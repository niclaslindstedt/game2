#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Stage preview tool: renders generated stages to PNG (top-down map) so the
// generator's output can be LOOKED at while tuning the rules — part of the
// screenshot-and-iterate workflow. Writes to the gitignored previews/ dir.
//
//   npm run track                      # seeds 1..6 (medium)
//   npm run track -- --seeds 42,99     # specific seeds
//   npm run track -- --count 12        # seeds 1..12
//   npm run track -- --length xlong    # a stage length band
//   npm run track -- --length endless --km 8   # a streamed endless stretch
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

import { createCanvas } from "./lib/png.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const { compileStage } = await import(join(root, "engine/index.ts"));

const args = process.argv.slice(2);
function flag(name) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
}
const seeds = flag("seeds")
  ? flag("seeds").split(",").map(Number)
  : Array.from({ length: Number(flag("count") ?? 6) }, (_, i) => i + 1);
const length = flag("length") ?? "medium";
const endlessKm = Number(flag("km") ?? 6);

const SIZE = 900;
const COLORS = {
  bg: [219, 231, 187], // sunlit grass
  road: [178, 148, 106], // gravel
  edge: [126, 101, 72],
  water: [64, 144, 220],
  jump: [226, 60, 44],
  crest: [240, 196, 60],
  start: [40, 168, 76],
  finish: [30, 30, 34],
};

const outDir = join(root, "previews");
mkdirSync(outDir, { recursive: true });

for (const seed of seeds) {
  const track = compileStage(seed, length);
  if (track.endless) track.extend(endlessKm * 1000);
  const { minX, maxX, minZ, maxZ } = track.bounds;
  const span = Math.max(maxX - minX, maxZ - minZ) + 80;
  const scale = SIZE / span;
  const ox = (SIZE - (maxX - minX) * scale) / 2 - minX * scale;
  const oz = (SIZE - (maxZ - minZ) * scale) / 2 - minZ * scale;
  const px = (x) => ox + x * scale;
  // Screen y grows downward; world z grows "north" — flip so north is up.
  const pz = (z) => SIZE - (oz + z * scale);

  const canvas = createCanvas(SIZE, SIZE, COLORS.bg);
  const roadR = Math.max(2, (track.width / 2) * scale);
  for (const s of track.samples) canvas.disk(px(s.x), pz(s.z), roadR + 1, COLORS.edge);
  for (const s of track.samples) {
    canvas.disk(px(s.x), pz(s.z), roadR, s.surface === "water" ? COLORS.water : COLORS.road);
  }
  for (const s of track.samples) {
    if (s.jump) canvas.disk(px(s.x), pz(s.z), roadR + 2, COLORS.jump);
    else if (s.elevation > 0.4 && s.surface !== "water") {
      canvas.disk(px(s.x), pz(s.z), 2, COLORS.crest);
    }
  }
  const first = track.samples[0];
  const last = track.samples[track.samples.length - 1];
  canvas.disk(px(first.x), pz(first.z), roadR + 4, COLORS.start);
  canvas.disk(px(last.x), pz(last.z), roadR + 4, COLORS.finish);

  const file = join(outDir, `track-${seed}.png`);
  writeFileSync(file, canvas.toPng());
  const turns = track.segments.filter((p) => p.kind === "turn");
  console.log(
    `${file}  ${(track.length / 1000).toFixed(2)} km, ${turns.length} turns ` +
      `(${turns.filter((t) => t.severity === "hard").length} hard), ` +
      `${track.segments.filter((p) => p.feature === "jump").length} jumps, ` +
      `${track.segments.filter((p) => p.feature === "water").length} fords, ` +
      `${track.segments.filter((p) => p.feature === "crest").length} crests`,
  );
}
