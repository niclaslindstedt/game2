#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Stage preview tool: renders generated stages so the generator's output
// can be LOOKED at while tuning the rules — part of the screenshot-and-
// iterate workflow. Two pictures per seed, written to the gitignored
// previews/ dir:
//
//   track-<seed>.png         the SCHEMATIC — the route as a map: surfaces,
//                            features, junctions and corner guards, read
//                            at a glance while judging the rules
//   track-<seed>-render.png  the PLACE — the shaded landscape with its
//                            water and its forest, and the road drawn
//                            across its full width: wheel tracks, ditches,
//                            markings, bridges, and the branches the route
//                            abandons. What the stage will look like.
//
// The frame fits the road and lets the nature fill the rest, so a long
// stage automatically renders from further up.
//
//   npm run track                      # seeds 1..6 (medium)
//   npm run track -- --seeds 42,99     # specific seeds
//   npm run track -- --count 12        # seeds 1..12
//   npm run track -- --length xlong    # a stage length band
//   npm run track -- --length endless --km 8   # a streamed endless stretch
//   npm run track -- --asphalt 0.6 --water 0.9 --elevation 1 --trees 0.2
//   npm run track -- --only render     # skip the other picture
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

import { createCanvas } from "./lib/png.mjs";
import { renderStage } from "./lib/stage-render.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const engine = await import(join(root, "engine/index.ts"));
const { compileStage, createTerrain } = engine;

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
const only = flag("only");
const knobs = {};
for (const dial of ["elevation", "water", "trees", "asphalt"]) {
  const value = flag(dial);
  if (value !== undefined) knobs[dial] = Number(value);
}

const SIZE = 900;
const COLORS = {
  bg: [219, 231, 187], // sunlit grass
  road: [178, 148, 106], // gravel
  asphalt: [64, 64, 70],
  edge: [126, 101, 72],
  water: [64, 144, 220],
  deck: [183, 179, 168],
  spur: [92, 92, 100],
  jump: [226, 60, 44],
  crest: [240, 196, 60],
  mound: [150, 108, 60],
  grove: [46, 96, 44],
  start: [40, 168, 76],
  finish: [30, 30, 34],
};

const outDir = join(root, "previews");
mkdirSync(outDir, { recursive: true });

/** The route as a MAP: what the rules engine decided, in colors that can be
 * told apart at a glance — which surface, which feature, where the corner
 * guards went, and where the tarmac forks off into a taped branch. */
function schematic(track, terrain) {
  const { minX, maxX, minZ, maxZ } = track.bounds;
  const span = Math.max(maxX - minX, maxZ - minZ) + 80;
  const scale = SIZE / span;
  const ox = (SIZE - (maxX - minX) * scale) / 2 - minX * scale;
  const oz = (SIZE - (maxZ - minZ) * scale) / 2 - minZ * scale;
  const px = (x) => ox + x * scale;
  // Screen y grows downward; world z grows "north" — flip so north is up.
  const pz = (z) => SIZE - (oz + z * scale);

  const canvas = createCanvas(SIZE, SIZE, COLORS.bg);
  // The corner guards first, under everything: they are ground, not road.
  for (const guard of terrain.guards) {
    canvas.disk(
      px(guard.x),
      pz(guard.z),
      Math.max(1.5, guard.radius * scale),
      guard.kind === "mound" ? COLORS.mound : COLORS.grove,
    );
  }
  const roadR = Math.max(2, (track.width / 2) * scale);
  for (const spur of track.spurs) {
    for (const s of spur.samples) {
      canvas.disk(px(s.x), pz(s.z), Math.max(1.5, (spur.width / 2) * scale), COLORS.spur);
    }
  }
  for (const s of track.samples) canvas.disk(px(s.x), pz(s.z), roadR + 1, COLORS.edge);
  for (const s of track.samples) {
    const color =
      s.deck != null
        ? COLORS.deck
        : s.surface === "water"
          ? COLORS.water
          : s.surface === "asphalt"
            ? COLORS.asphalt
            : COLORS.road;
    canvas.disk(px(s.x), pz(s.z), roadR, color);
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
  return canvas;
}

for (const seed of seeds) {
  const track = compileStage(seed, length, knobs);
  if (track.endless) track.extend(endlessKm * 1000);
  const terrain = createTerrain(track);
  terrain.sync(track.length);

  const written = [];
  if (only !== "render") {
    const file = join(outDir, `track-${seed}.png`);
    writeFileSync(file, schematic(track, terrain).toPng());
    written.push(file);
  }
  if (only !== "schematic") {
    const file = join(outDir, `track-${seed}-render.png`);
    const canvas = renderStage({ track, terrain, engine, width: 1280, height: 800 });
    writeFileSync(file, canvas.toPng());
    written.push(file);
  }

  const turns = track.segments.filter((p) => p.kind === "turn");
  const paved = track.samples.filter((s) => s.surface === "asphalt").length;
  const crossings = (kind) => track.segments.filter((p) => p.crossing === kind).length;
  console.log(
    `${written.join("  ")}\n  ${(track.length / 1000).toFixed(2)} km, ${turns.length} turns ` +
      `(${turns.filter((t) => t.severity === "hard").length} hard), ` +
      `${track.segments.filter((p) => p.feature === "jump").length} jumps, ` +
      `${crossings("ford")} fords, ${crossings("timber")} timber + ${crossings("concrete")} concrete bridges, ` +
      `${track.segments.filter((p) => p.feature === "crest").length} crests, ` +
      `${((paved / track.samples.length) * 100).toFixed(0)}% asphalt in ${track.spurs.length} junctions, ` +
      `${terrain.guards.filter((g) => g.kind === "mound").length} mounds + ` +
      `${terrain.guards.filter((g) => g.kind === "grove").length} groves guarding corners`,
  );
}
