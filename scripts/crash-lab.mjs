// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE CRASH LAB — one accident, in sequence, drawn as a diagram.
//
// `make roll` shows a car going over from behind and `make sim` counts how
// often one does; neither can answer the question a crash actually raises,
// which is what the car was DOING at each moment of it. A crash is four
// motions running at once — travel, roll, yaw, pitch — punctuated by
// contacts that trade between them, and watching it in the game shows a car
// at speed, mostly off screen, for about a second.
//
// So this stages one crash, isolates it from everything that is not the
// physics (no renderer, no browser, no assets, no scenery — the engine and
// a PNG canvas), and draws it as an accident is drawn on paper: the PLAN,
// the PROFILE, and then every sixth of a second as its own cell with the
// numbers that decide the next step printed beside it.
//
//   make crash                              the whole set
//   make crash CRASH=carry                  one scenario
//   node scripts/crash-lab.mjs carry        ...the same, direct
//   node scripts/crash-lab.mjs --car=coupe --seed=3 --every=8
//
// Writes previews/crash-<scenario>.png and prints the frame table, which is
// the half that survives being pasted into a PR.

import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

import { TUNING } from "../engine/index.ts";
import { createCanvas } from "./lib/png.mjs";
import { SCENARIOS, stageCrash } from "./lib/crash-stage.mjs";
import { INK, drawFrames, drawPlan, drawProfile } from "./lib/crash-draw.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "previews");
mkdirSync(outDir, { recursive: true });

const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const bare = process.argv.slice(2).filter((a) => !a.startsWith("--"));

const CAR = arg("car", "classic");
const SEED = Number(arg("seed", "1"));
/** Samples per second to DRAW. Six is the roll lab's rate and reads as a
 * sequence; raise it to pick a single contact apart. */
const EVERY = Number(arg("every", "6"));

const WIDTH = 1180;
const PAD = 16;

function render(run) {
  const stride = Math.max(1, Math.round(TUNING.physicsHz / EVERY));
  const shown = run.frames.filter((_, i) => i % stride === 0);
  run.shownCount = shown.length;
  const cols = Math.floor((WIDTH - PAD * 2) / 168);
  const rows = Math.ceil(shown.length / cols);
  const plan = { x: PAD, y: 90, w: WIDTH - PAD * 2, h: 250, pad: 18 };
  const profile = { x: PAD, y: plan.y + plan.h + 26, w: WIDTH - PAD * 2, h: 220, pad: 18 };
  const frames = { x: PAD, y: profile.y + profile.h + 26, w: WIDTH - PAD * 2 };
  const canvas = createCanvas(WIDTH, frames.y + rows * 128 + 18, INK.paper);

  canvas.text(`THE CRASH LAB — ${run.name.toUpperCase()}`, PAD, 10, INK.label, 2);
  canvas.text(run.scenario.note.toUpperCase(), PAD, 26, INK.dim, 1);
  canvas.text(
    `${run.carId.toUpperCase()}  SEED ${run.seed}  ENTRY ${Math.round(run.entry.u * 3.6)}KM/H ` +
      `${run.entry.w.toFixed(0)}M/S ACROSS`,
    PAD,
    38,
    INK.dim,
    1,
  );
  canvas.text(summary(run), PAD, 50, INK.dim, 1);
  canvas.text(rollLine(run), PAD, 62, run.rolled ? INK.late : INK.dim, 1);

  drawPlan(canvas, run, plan, shown);
  drawProfile(canvas, run, profile, shown);
  drawFrames(canvas, run, frames, shown);

  const file = join(outDir, `crash-${run.name}.png`);
  writeFileSync(file, canvas.toPng());
  return file;
}

function summary(run) {
  return (
    `${run.turns.toFixed(2)} TURNS  ${run.along.toFixed(1)}M ALONG  ` +
    `${run.across.toFixed(1)}M ACROSS  ` +
    `${run.parts} PARTS  ROOF ${(run.roof * 100).toFixed(0)}CM  ` +
    `WEAR ${(run.wear * 100).toFixed(0)}%  ${run.upright ? "ON ITS WHEELS" : "LYING"}`
  );
}

/** THE ROLL, as its own line. What the whole-crash summary cannot say: how
 * far the car went WHILE IT WAS OVER, how much speed it still had when the
 * roll handed it back, and the retardation those two make — which is the
 * one figure a rollover can be checked against the world with. */
function rollLine(run) {
  if (!run.roll) return "DID NOT GO OVER";
  const r = run.roll;
  return (
    `OVER FOR ${r.seconds.toFixed(2)}S  ${r.along.toFixed(1)}M ALONG  ` +
    `${Math.round(r.into * 3.6)} INTO IT, ${Math.round(r.outOf * 3.6)}KM/H OUT  ` +
    `${r.drag.toFixed(2)}G`
  );
}

/** THE BUDGET, as its own line. A crash is one store of energy being run
 * down — what the car was travelling with, what it was turning with, and how
 * high its weight still was — and NOTHING in the model may add to it except
 * the flight's turbulence, which is bounded and averages to nothing. So the
 * gain here is not a tuning figure: any of it is a term making energy out of
 * nothing, which is what every rotational fault this module has had turned
 * out to be. Read per STEP, because that is the rate such a term works at. */
function budgetLine(run) {
  const b = run.budget;
  const pc = (x) => `${((100 * x) / b.into).toFixed(1)}%`;
  // BY REGIME, whenever there is anything to explain. A gain read as one
  // percentage is a number to argue about; read as `air->air` / `air->grd` /
  // `grd->grd` it names the term at fault, because the three are different
  // physics — a flight, a touchdown, and the grounded model, which is exactly
  // conservative and must read nothing.
  const split = Object.entries(b.regimes)
    .sort((a, c) => c[1].gained - a[1].gained)
    .map(([regime, r]) => `${regime} ${pc(r.gained)} on ${r.steps}`)
    .join(", ");
  return (
    `BUDGET ${b.into.toFixed(0)} -> ${b.outOf.toFixed(0)} J/KG  ` +
    `GAINED ${pc(b.gained)} ON ${b.steps} STEPS, WORST +${b.worst.toFixed(2)}` +
    (split === "" ? "" : `\n   ${split}`)
  );
}

/** THE FRAME TABLE. The picture is for seeing the shape of a crash; this is
 * what a claim about one gets made out of, and what a before/after diff is
 * read off. One row per drawn frame, plus every event in order. */
function report(run, stride) {
  console.log(`\n── ${run.name.toUpperCase()} — ${run.scenario.note}`);
  console.log(
    `   entry ${Math.round(run.entry.u * 3.6)} km/h, ${run.entry.w} m/s across` +
      `   ${run.carId}, seed ${run.seed}`,
  );
  console.log(
    "     t     km/h       u       w      vy    roll   r/s     yaw   r/s   pitch    bed  state    wear  parts",
  );
  run.frames.forEach((f, i) => {
    if (i % stride !== 0) return;
    // ROLL and SLIDE are the two halves of one accident and the table has
    // to tell them apart: a body turning over its corners, and one lying
    // flat on a face still going somewhere.
    const state = `${f.airborne ? "air" : "down"}${f.sliding ? "/SLIDE" : f.rolling ? "/roll" : ""}`;
    console.log(
      `  ${f.t.toFixed(2)}  ${(f.speed * 3.6).toFixed(0).padStart(5)}  ` +
        `${f.u.toFixed(1).padStart(6)}  ${f.w.toFixed(1).padStart(6)}  ` +
        `${f.vy.toFixed(1).padStart(6)}  ${deg(f.tilt).padStart(6)}  ` +
        `${f.rollRate.toFixed(1).padStart(4)}  ${deg(f.yaw).padStart(6)}  ` +
        `${f.yawRate.toFixed(1).padStart(4)}  ${deg(f.pitch).padStart(6)}  ` +
        `${deg(f.bed).padStart(5)}  ` +
        `${state.padEnd(9)}${(f.wear * 100).toFixed(0).padStart(4)}%  ${String(f.parts).padStart(5)}`,
    );
  });
  const notable = run.log.filter((e) => e.type !== "shift" && e.type !== "offRoad");
  if (notable.length > 0) {
    console.log("   events:");
    for (const e of notable) console.log(`     ${e.t.toFixed(2)}s  ${describe(e)}`);
  }
  console.log(`   ${summary(run).toLowerCase()}`);
  console.log(`   ${rollLine(run).toLowerCase()}`);
  console.log(`   ${budgetLine(run).toLowerCase()}`);
}

const deg = (rad) => ((rad * 180) / Math.PI).toFixed(0);

function describe(e) {
  const n = (v) => (typeof v === "number" ? v.toFixed(1) : String(v));
  switch (e.type) {
    case "rollover":
      return `ROLLOVER at ${n(e.rate)} rad/s, carrying ${n(e.speed)} m/s`;
    case "impact":
      return `impact ${n(e.speed)} m/s at ${n((e.angle * 180) / Math.PI)}°${e.belly ? " (flat)" : ""}`;
    case "landing":
      return `landing slam ${n(e.slam)} m/s after ${n(e.airTime)}s${e.clean ? " clean" : ""}`;
    case "partBreak":
      return `PART OFF: ${e.part}`;
    case "systemFail":
      return `${e.system} → ${e.stage}`;
    case "wheelHurt":
      return `wheel ${e.wheel}${e.off ? " OFF" : " hurt"}`;
    case "spin":
      return `spin at ${n((e.slip * 180) / Math.PI)}°, ${n(e.speed)} m/s`;
    case "takeoff":
      return `takeoff at ${n(e.vy)} m/s up`;
    default:
      return e.type;
  }
}

const wanted = bare.length > 0 ? bare : Object.keys(SCENARIOS);
for (const name of wanted) {
  if (!SCENARIOS[name]) {
    console.error(`no such scenario: ${name}\n  try: ${Object.keys(SCENARIOS).join(", ")}`);
    process.exitCode = 1;
    continue;
  }
  const run = stageCrash(name, { car: CAR, seed: SEED });
  const file = render(run);
  report(run, Math.max(1, Math.round(TUNING.physicsHz / EVERY)));
  console.log(`   ${file}`);
}
