#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE LEVEL MAP — a stage drawn top down and described, from nothing but
// the engine.
//
// This is the tool for reasoning about a stage WITHOUT driving it: "the
// first jump on level 1" is a claim, and this turns it into a picture with
// `J1` on it and a row in a table saying where J1 is, how high its lip is,
// what grade the ramp climbs, which call it lands before, and what is
// standing within reach of the road there. It loads the engine and the
// campaign's level table and nothing else — no three.js, no browser, no
// build — so it runs in a couple of seconds on any stage.
//
//   npm run level -- --level 1                 # campaign stage 1, whole map
//   npm run level -- --level taiga-3           # ...by id
//   npm run level -- --level 1 --focus J1      # close-up around the first jump
//   npm run level -- --level 1 --focus T4 --span 160   # ...a call, at 160 m across
//   npm run level -- --level 1 --focus 1200    # ...around 1200 m along the stage
//   npm run level -- --seed 38 --length short  # any seed, on the default dials
//   npm run level -- --seed 7 --shape circuit --asphalt 0.6 --water 0.9
//   npm run level -- --level 2 --json          # the features as data, too
//   npm run level -- --list                    # the campaign's stages
//
// Writes previews/<name>.png and previews/<name>.txt (the same table the
// run prints), where <name> is the level's id or `seed-<n>-<length>`, with
// `-<focus>` appended for a close-up.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

import { aliasEngine } from "./lib/engine-alias.mjs";
import { renderLevelMap } from "./lib/level-map-render.mjs";
import { describeSolids, indexAtS, stageFeatures, stageSummary } from "./lib/stage-features.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
aliasEngine(root);
const engine = await import(join(root, "engine/index.ts"));
const { compileStage, createTerrain, resolveKnobs } = engine;
const { LOCATIONS, campaignKnobs } = await import(join(root, "pwa/src/game/campaign.ts"));

const args = process.argv.slice(2);
const has = (name) => args.includes(`--${name}`);
function flag(name) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && i + 1 < args.length && !args[i + 1].startsWith("--") ? args[i + 1] : undefined;
}

/** The campaign's stages in ladder order — level 1 is the first stage of
 * the first location, and the count runs on across locations. */
const LEVELS = LOCATIONS.flatMap((location) =>
  location.levels.map((level) => ({ ...level, location: location.name })),
);

if (has("list")) {
  LEVELS.forEach((level, k) => {
    console.log(
      `${String(k + 1).padStart(2)}  ${level.id.padEnd(9)} ${level.name.padEnd(16)} seed ${String(level.seed).padStart(3)}  ` +
        `${level.length.padEnd(6)} ${(level.shape ?? "sprint").padEnd(7)} ${level.timeOfDay}/${level.weather}/${level.season}  ${level.blurb}`,
    );
  });
  process.exit(0);
}

// ── Which stage ─────────────────────────────────────────────────────────
let level = null;
const levelArg = flag("level");
if (levelArg !== undefined) {
  level = /^\d+$/.test(levelArg)
    ? LEVELS[Number(levelArg) - 1]
    : LEVELS.find((l) => l.id === levelArg);
  if (!level) {
    console.error(`no campaign level "${levelArg}" — \`--list\` names them`);
    process.exit(2);
  }
}
const seed = level ? level.seed : Number(flag("seed") ?? 1);
const length = level ? level.length : (flag("length") ?? "medium");
const shape = level ? (level.shape ?? "sprint") : (flag("shape") ?? "sprint");
if (length === "endless") {
  console.error("an endless stage has no map — pick a length band");
  process.exit(2);
}
const knobs = {};
for (const dial of ["elevation", "water", "trees", "asphalt", "width", "steepness"]) {
  const value = flag(dial);
  if (value !== undefined) knobs[dial] = Number(value);
}
if (flag("biome") !== undefined) knobs.biome = flag("biome");
// A campaign stage is built on its location's own dials — the rule book's
// defaults in that location's COUNTRY (R40).
const dials = resolveKnobs(level ? campaignKnobs(level) : knobs);
const size = Number(flag("size") ?? 1200);
const span = Number(flag("span") ?? 240);

// ── Build it ────────────────────────────────────────────────────────────
const track = compileStage(seed, length, dials, shape);
const terrain = createTerrain(track);
terrain.sync(track.length);
const features = stageFeatures(track, terrain);
const summary = stageSummary(track, features);

// ── What to look at ─────────────────────────────────────────────────────
let focus = null;
const focusArg = flag("focus");
if (focusArg !== undefined) {
  const target = /^\d+(\.\d+)?$/.test(focusArg)
    ? { id: `${focusArg} M`, s: Number(focusArg) }
    : features.find((f) => f.id.toUpperCase() === focusArg.toUpperCase());
  if (!target) {
    console.error(
      `nothing called "${focusArg}" on this stage — the ids are ${features.map((f) => f.id).join(" ")}`,
    );
    process.exit(2);
  }
  const at = track.samples[indexAtS(track.samples, target.s)];
  focus = { id: target.id, s: target.s, x: at.x, z: at.z, span };
}

// ── Say it ──────────────────────────────────────────────────────────────
const pct = (v) =>
  `.${Math.round(v * 100)
    .toString()
    .padStart(2, "0")}`;
const heading = level
  ? `LEVEL ${LEVELS.indexOf(level) + 1} · ${level.name} (${level.id}) — seed ${seed}, ${length} ${shape}, ` +
    `${level.timeOfDay}/${level.weather}/${level.season}`
  : `SEED ${seed} — ${length} ${shape}`;
const dialLine =
  `dials: elevation ${dials.elevation} water ${dials.water} trees ${dials.trees} ` +
  `asphalt ${dials.asphalt} width ${dials.width} steepness ${dials.steepness}`;
const tarmac = summary.tarmac.map((r) => `${r.fromS.toFixed(0)}–${r.toS.toFixed(0)} m`).join(", ");
const statLine =
  `${(summary.lengthM / 1000).toFixed(2)} km to the line` +
  (summary.circuit ? " per lap" : ` (${(summary.roadM / 1000).toFixed(2)} km of road)`) +
  `, ${summary.turns} calls (${summary.hard} hard, ${summary.medium} medium, ${summary.soft} easy), ` +
  `${summary.jumps} jump${summary.jumps === 1 ? "" : "s"}, ${summary.crests} crest${summary.crests === 1 ? "" : "s"}, ` +
  `${summary.fords} ford${summary.fords === 1 ? "" : "s"}, ${summary.bridges} bridge${summary.bridges === 1 ? "" : "s"}, ` +
  `${summary.checkpoints} split${summary.checkpoints === 1 ? "" : "s"}, ${summary.junctions} junction${summary.junctions === 1 ? "" : "s"}, ` +
  `${summary.homesteads} homestead${summary.homesteads === 1 ? "" : "s"}, ` +
  `${summary.towns} town${summary.towns === 1 ? "" : "s"}, ` +
  `${(summary.tarmacShare * 100).toFixed(0)}% tarmac${tarmac ? ` (${tarmac})` : ""}, ` +
  `climb ${summary.climb.toFixed(0)} m, road ${summary.widthM.toFixed(1)} m wide`;
const rows = features.map((f) => {
  const at = `${f.s.toFixed(0)}${f.endS != null && f.kind !== "jump" ? `–${f.endS.toFixed(0)}` : ""} m`;
  const solids = f.solids?.length ? ` · ${describeSolids(f.solids)}` : "";
  return `  ${f.id.padEnd(7)} ${at.padEnd(12)} ${f.detail}${solids}`;
});
const text = [
  heading,
  dialLine,
  statLine,
  focus ? `focus: ${focus.id} at ${focus.s.toFixed(0)} m, ${span} m across` : null,
  "",
  "  ID      AT           WHAT",
  ...rows,
]
  .filter((line) => line !== null)
  .join("\n");
console.log(text);
if (has("json")) {
  console.log(
    JSON.stringify(
      {
        level: level ? { id: level.id, name: level.name, number: LEVELS.indexOf(level) + 1 } : null,
        seed,
        length,
        shape,
        dials,
        summary,
        features: features.map(({ solids, ...f }) => ({
          ...f,
          solids: solids?.map((p) => ({
            kind: p.ob.kind,
            group: p.group,
            x: p.ob.x,
            z: p.ob.z,
            radius: p.ob.radius,
            s: p.s,
            side: p.side,
            edge: p.edge,
          })),
        })),
      },
      null,
      1,
    ),
  );
}

// ── Draw it ─────────────────────────────────────────────────────────────
const outDir = join(root, "previews");
mkdirSync(outDir, { recursive: true });
const base = level ? level.id : `seed-${seed}-${length}${shape === "circuit" ? "-circuit" : ""}`;
const name =
  flag("out") ?? `level-${base}${focus ? `-${focus.id.replace(/\s+/g, "").toLowerCase()}` : ""}`;
writeFileSync(join(outDir, `${name}.txt`), text + "\n");
if (!has("no-image")) {
  const title = level
    ? `LEVEL ${LEVELS.indexOf(level) + 1}  ${level.name.toUpperCase()}${focus ? `  -  ${focus.id}` : ""}`
    : `SEED ${seed}  ${length.toUpperCase()} ${shape.toUpperCase()}${focus ? `  -  ${focus.id}` : ""}`;
  const lines = [
    level
      ? `${level.id.toUpperCase()}  SEED ${seed}  ${length.toUpperCase()} ${shape.toUpperCase()}`
      : `${length.toUpperCase()} ${shape.toUpperCase()}`,
    level
      ? `${level.timeOfDay} ${level.weather} ${level.season}`.toUpperCase()
      : "DEFAULT CONDITIONS",
    `ELEV ${pct(dials.elevation)} WATER ${pct(dials.water)} TREES ${pct(dials.trees)}`,
    `TARMAC ${pct(dials.asphalt)} WIDTH ${pct(dials.width)} STEEP ${pct(dials.steepness)}`,
    focus
      ? `FOCUS ${focus.id} AT ${focus.s.toFixed(0)} M  ${span} M ACROSS`
      : `${(summary.lengthM / 1000).toFixed(2)} KM TO THE LINE`,
  ];
  const canvas = renderLevelMap({ track, terrain, features, title, lines, size, focus });
  const file = join(outDir, `${name}.png`);
  writeFileSync(file, canvas.toPng());
  console.log(`\n${file}  ${join(outDir, `${name}.txt`)}`);
}
