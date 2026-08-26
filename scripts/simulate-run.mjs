#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Simulation CLI: runs the REAL engine headlessly — createGame, step, the
// bot driver — across seeds and cars and prints a balance table. This is
// the measuring stick for handling and generator changes: run it before and
// after a tuning edit and read the diff.
//
//   npm run sim                          # seeds 1..8, both cars
//   npm run sim -- --seeds 42,99         # specific seeds
//   npm run sim -- --car classic         # one car
//   npm run sim -- --count 20            # seeds 1..20
//   npm run sim -- --length long         # stage length band (default medium)
//   npm run sim -- --weather storm       # race in rain/storm wind
//   npm run sim -- --json report.json    # machine-readable dump
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const { simulateStage, CARS, STAGE_RULES } = await import(join(root, "engine/index.ts"));

const args = process.argv.slice(2);
function flag(name) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
}
const seeds = flag("seeds")
  ? flag("seeds").split(",").map(Number)
  : Array.from({ length: Number(flag("count") ?? 8) }, (_, i) => i + 1);
const cars = flag("car") ? [flag("car")] : CARS.map((c) => c.id);
const weather = flag("weather") ?? "clear";
const length = flag("length") ?? "medium";
if (!(length in STAGE_RULES.stageLengths)) {
  console.error(
    `unknown length "${length}" (finite lengths: ${Object.keys(STAGE_RULES.stageLengths).join(", ")})`,
  );
  process.exit(1);
}
// The timeout scales with the band: twice the menu minutes is generous.
const maxTime = Math.max(300, STAGE_RULES.stageLengths[length].minutes * 120);

const pad = (v, n) => String(v).padStart(n);
const rows = [];
console.log(
  [
    "seed".padStart(6),
    "car".padEnd(8),
    pad("len", 6),
    pad("time", 7),
    pad("avg", 8),
    pad("drift", 6),
    pad("dTime", 6),
    pad("score", 6),
    pad("jump", 5),
    pad("air", 6),
    pad("ford", 5),
    pad("off", 6),
    pad("resp", 5),
    pad("top", 8),
    "  fin",
  ].join(" "),
);
for (const seed of seeds) {
  for (const carId of cars) {
    const r = simulateStage({ seed, carId, length, maxTime, weather });
    rows.push(r);
    console.log(
      [
        pad(seed, 6),
        carId.padEnd(8),
        pad(r.trackLength.toFixed(0), 6),
        pad(r.time.toFixed(1), 7),
        pad(((r.trackLength / r.time) * 3.6).toFixed(0) + "km/h", 8),
        pad(r.stats.driftCount, 6),
        pad(r.stats.driftTime.toFixed(1), 6),
        pad(r.stats.driftScore.toFixed(0), 6),
        pad(r.stats.jumps, 5),
        pad(r.stats.airTime.toFixed(1), 6),
        pad(r.stats.splashes, 5),
        pad(r.stats.offRoadTime.toFixed(1), 6),
        pad(r.stats.respawns, 5),
        pad((r.stats.topSpeed * 3.6).toFixed(0) + "km/h", 8),
        r.finished ? "  yes" : "   NO",
      ].join(" "),
    );
  }
}

const finished = rows.filter((r) => r.finished).length;
const avg = (f) => rows.reduce((a, r) => a + f(r), 0) / rows.length;
console.log(
  `\n${finished}/${rows.length} finished · avg pace ${avg((r) => (r.trackLength / r.time) * 3.6).toFixed(0)} km/h · ` +
    `avg drift time ${avg((r) => r.stats.driftTime).toFixed(1)} s · ` +
    `avg air time ${avg((r) => r.stats.airTime).toFixed(1)} s · ` +
    `respawns ${rows.reduce((a, r) => a + r.stats.respawns, 0)}`,
);

const jsonOut = flag("json");
if (jsonOut) {
  const withoutEvents = rows.map((r) => {
    const copy = { ...r };
    delete copy.events;
    return copy;
  });
  writeFileSync(jsonOut, `${JSON.stringify(withoutEvents, null, 2)}\n`);
  console.log(`wrote ${jsonOut}`);
}

if (finished < rows.length) process.exit(1);
