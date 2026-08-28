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
//   npm run sim -- --shape circuit       # race a closed lap circuit (R22)
//   npm run sim -- --shape circuit --laps 5
//   npm run sim -- --weather storm       # race in rain/storm wind
//   npm run sim -- --asphalt 0.8         # generator dials, each 0..1:
//                                        # --elevation --water --trees --asphalt --width
//   npm run sim -- --gearbox manual      # drive the bot with a manual box
//   npm run sim -- --sweep               # the ROSTER BALANCE table: every
//                                        # car over five stage archetypes,
//                                        # ranked per archetype
//   npm run sim -- --field               # R29 — the CAMPAIGN FIELD table:
//                                        # the fourteen rival crews driven
//                                        # at all three difficulties, with
//                                        # what each is worth in points and
//                                        # what that does to the clock
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const {
  simulateStage,
  compileStage,
  CARS,
  STAGE_RULES,
  DIFFICULTIES,
  DIFFICULTY_IDS,
  rivalField,
  skillPoints,
} = await import(join(root, "engine/index.ts"));

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
// The generator's dials — anything not passed keeps its default position.
const knobs = {};
for (const dial of ["elevation", "water", "trees", "asphalt", "width"]) {
  const value = flag(dial);
  if (value !== undefined) knobs[dial] = Number(value);
}
const gearbox = flag("gearbox") ?? "auto";
const length = flag("length") ?? "medium";
const shape = flag("shape") ?? "sprint";
const laps = flag("laps") ? Number(flag("laps")) : undefined;
if (shape !== "sprint" && shape !== "circuit") {
  console.error(`unknown shape "${shape}" (sprint, circuit)`);
  process.exit(1);
}
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
    pad("hit", 4),
    pad("resp", 5),
    pad("top", 8),
    "  fin",
  ].join(" "),
);
for (const seed of seeds) {
  for (const carId of cars) {
    const r = simulateStage({ seed, carId, gearbox, length, shape, laps, maxTime, weather, knobs });
    rows.push(r);
    console.log(
      [
        pad(seed, 6),
        carId.padEnd(8),
        pad(r.raceLength.toFixed(0), 6),
        pad(r.time.toFixed(1), 7),
        pad(((r.raceLength / r.time) * 3.6).toFixed(0) + "km/h", 8),
        pad(r.stats.driftCount, 6),
        pad(r.stats.driftTime.toFixed(1), 6),
        pad(r.stats.driftScore.toFixed(0), 6),
        pad(r.stats.jumps, 5),
        pad(r.stats.airTime.toFixed(1), 6),
        pad(r.stats.splashes, 5),
        pad(r.stats.offRoadTime.toFixed(1), 6),
        pad(r.stats.impacts, 4),
        pad(r.stats.respawns, 5),
        pad((r.stats.topSpeed * 3.6).toFixed(0) + "km/h", 8),
        r.finished ? "  yes" : "   NO",
      ].join(" "),
    );
  }
}

if (shape === "circuit") {
  console.log(
    `\ncircuit: ${rows[0].laps} laps of ${(rows[0].trackLength / 1000).toFixed(2)} km — ` +
      `best laps ${rows.map((r) => Math.min(...r.lapTimes).toFixed(1)).join(", ")} s`,
  );
}

const dials = Object.entries(knobs)
  .map(([k, v]) => `${k} ${v}`)
  .join(", ");
if (dials) console.log(`\ndials: ${dials}`);

const finished = rows.filter((r) => r.finished).length;
const avg = (f) => rows.reduce((a, r) => a + f(r), 0) / rows.length;
console.log(
  `\n${finished}/${rows.length} finished · avg pace ${avg((r) => (r.raceLength / r.time) * 3.6).toFixed(0)} km/h · ` +
    `avg drift time ${avg((r) => r.stats.driftTime).toFixed(1)} s · ` +
    `avg air time ${avg((r) => r.stats.airTime).toFixed(1)} s · ` +
    `respawns ${rows.reduce((a, r) => a + r.stats.respawns, 0)}`,
);

/** THE ROSTER BALANCE TABLE. One car being fastest on every stage in the
 * game is the failure this exists to catch, and the default sweep above
 * cannot see it: it races one set of dials over one pool of seeds, so it
 * ranks the cars exactly once. A roster is balanced when each car OWNS a
 * kind of stage — which means measuring over the KINDS.
 *
 * An archetype is two things. The generator's dials say what the road is
 * SURFACED and shaped like (rules.ts); the seed says how twisty it is, and
 * no dial moves that — so a `pick` of "tight" or "flowing" measures the
 * whole seed pool's mean curvature and races only the end of it that
 * matches. Nothing here is a special stage type: the generator builds all
 * of them from the same rules. */
const ARCHETYPES = [
  { id: "tarmac", label: "fully sealed", pick: "flowing", knobs: { asphalt: 1, elevation: 0.3 } },
  {
    id: "mountain",
    label: "sealed pass, steep",
    pick: "all",
    knobs: { asphalt: 0.45, elevation: 1 },
  },
  { id: "mixed", label: "half and half", pick: "all", knobs: { asphalt: 0.5, elevation: 0.4 } },
  {
    id: "wet",
    label: "loose, forded",
    pick: "all",
    knobs: { asphalt: 0.25, water: 1, trees: 0.9 },
  },
  { id: "gravel", label: "loose, dry, flat", pick: "all", knobs: { asphalt: 0, elevation: 0.15 } },
];

/** Mean |curvature| over a compiled stage — how twisty the seed built it. */
function twistiness(seed, stageKnobs) {
  const track = compileStage(seed, length, stageKnobs);
  let sum = 0;
  for (const sample of track.samples) sum += Math.abs(sample.curvature);
  return sum / track.samples.length;
}

if (args.includes("--sweep")) {
  // Half the pool, so "tight" and "flowing" are genuinely different roads
  // and neither is one lucky seed.
  const half = Math.max(1, Math.floor(seeds.length / 2));
  console.log(
    `\nROSTER BALANCE — ${length} stages, ${gearbox} box, ` +
      `${seeds.length} seeds (the ${half} tightest/most flowing where an archetype asks)`,
  );
  const wins = new Map(cars.map((c) => [c, 0]));
  for (const arch of ARCHETYPES) {
    const stageKnobs = { ...knobs, ...arch.knobs };
    let pool = seeds;
    if (arch.pick !== "all") {
      const ranked = [...seeds].sort(
        (a, b) => twistiness(a, stageKnobs) - twistiness(b, stageKnobs),
      );
      pool = arch.pick === "tight" ? ranked.slice(-half) : ranked.slice(0, half);
    }
    const paces = new Map();
    const drifts = new Map();
    for (const carId of cars) {
      let pace = 0;
      let drift = 0;
      let dnf = 0;
      for (const seed of pool) {
        const r = simulateStage({
          seed,
          carId,
          gearbox,
          length,
          maxTime,
          weather,
          knobs: stageKnobs,
        });
        // Pace, not time: the seeds in a pool build stages of different
        // lengths, and times across them cannot be added up.
        pace += (r.trackLength / r.time) * 3.6;
        drift += r.stats.driftTime;
        if (!r.finished) dnf += 1;
      }
      paces.set(carId, pace / pool.length);
      drifts.set(carId, drift / pool.length);
      if (dnf) console.log(`  !! ${carId} failed to finish ${dnf} ${arch.id} stage(s)`);
    }
    const ranked = [...paces.entries()].sort((a, b) => b[1] - a[1]);
    wins.set(ranked[0][0], wins.get(ranked[0][0]) + 1);
    const best = ranked[0][1];
    console.log(
      `\n  ${arch.id.padEnd(9)} ${arch.label.padEnd(17)} ` +
        ranked
          .map(
            ([carId, pace]) =>
              `${carId.padEnd(8)} ${pace.toFixed(1)}km/h ` +
              `${(pace === best ? "  —  " : `${(((pace - best) / best) * 100).toFixed(1)}%`).padStart(6)}` +
              ` d${drifts.get(carId).toFixed(0)}s`,
          )
          .join("   "),
    );
  }
  console.log(
    `\narchetypes won: ${[...wins.entries()].map(([carId, n]) => `${carId} ${n}`).join(" · ")}`,
  );
  // A roster where one car takes every archetype is the thing this table is
  // for. Say so loudly rather than leaving it to be read out of the numbers.
  const hog = [...wins.entries()].find(([, n]) => n === ARCHETYPES.length);
  if (hog) console.log(`  !! ${hog[0]} is fastest on EVERY archetype — the roster is not balanced`);
}

/** R29 — THE CAMPAIGN FIELD. The tuning loop for the rival difficulties: it
 * drives every crew at every setting through the real engine and prints what
 * the budgets in `engine/sim/skill.ts` actually buy.
 *
 * Everything is quoted as a RATIO to `RALLY_BOT` on the same seed and car,
 * because that profile is the reference every other table in this repo is
 * measured with and the one number here that does not move when a stage
 * changes length. Read the P3 column: it is the podium, and the podium is
 * what a difficulty IS. Above 1.00 the field is slower than the reference
 * bot; below it, quicker.
 *
 * Three seeds by default — fourteen crews at three settings is already 126
 * runs, and a fourth seed buys less than it costs. `--seeds` overrides. */
if (args.includes("--field")) {
  const pool = (flag("seeds") ? seeds : seeds.slice(0, 3)).slice(0, 6);
  console.log(
    `\nCAMPAIGN FIELD — ${length} stages, seeds ${pool.join(",")}, ` +
      `ratios to RALLY_BOT on the same seed and car`,
  );
  const reference = new Map();
  for (const seed of pool) {
    for (const carId of CARS.map((c) => c.id)) {
      const r = simulateStage({ seed, carId, gearbox, length, maxTime, weather, knobs });
      reference.set(`${seed}/${carId}`, r.finished ? r.time : maxTime);
    }
  }
  for (const difficulty of DIFFICULTY_IDS) {
    const { budget, spread } = DIFFICULTIES[difficulty];
    const crews = rivalField(difficulty).map((entry) => ({
      alias: entry.crew.alias,
      points: skillPoints(entry.skill),
      ratios: [],
      dnf: 0,
    }));
    for (const seed of pool) {
      rivalField(difficulty).forEach((entry, i) => {
        const r = simulateStage({
          seed,
          carId: entry.crew.carId,
          gearbox,
          length,
          maxTime,
          weather,
          knobs,
          profile: entry.profile,
        });
        if (r.finished) crews[i].ratios.push(r.time / reference.get(`${seed}/${entry.crew.carId}`));
        else crews[i].dnf += 1;
      });
    }
    for (const crew of crews) {
      crew.mean = crew.ratios.length
        ? crew.ratios.reduce((a, b) => a + b, 0) / crew.ratios.length
        : Infinity;
    }
    const ranked = [...crews].sort((a, b) => a.mean - b.mean);
    const at = (place) => (ranked[place - 1]?.mean ?? Infinity).toFixed(3);
    console.log(
      `\n  ${difficulty.toUpperCase().padEnd(7)} budget ${String(budget).padStart(2)} ` +
        `± ${spread / 2}   P1 ${at(1)}  P3 ${at(3)}  P7 ${at(7)}  last ${at(ranked.length)}`,
    );
    console.log(
      "    " +
        ranked
          .map((c) => `${c.alias} ${c.points.toFixed(0)}p ${c.mean.toFixed(2)}${c.dnf ? "!" : ""}`)
          .join("  ·  "),
    );
  }
  // A podium the reference bot could not reach is a difficulty nobody can
  // clear; one it walks is a difficulty that is not one. Say both out loud.
  console.log(
    "\n  P3 is the podium: over 1.00 a reference-pace run wins it, under 1.00 it does not.",
  );
}

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
