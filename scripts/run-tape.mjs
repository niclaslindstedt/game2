#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// RUN TAPES: record a drive, and drive it again.
//
// A run tape is one whole run written down as the controls that drove it
// (engine/sim/tape.ts) — JSONL, one object a line, small enough to read and
// exact enough to replay, because the engine is deterministic. This CLI is
// the half of it that lives outside the browser.
//
//   npm run tape -- record --seed 42 --car compact --difficulty hard
//   npm run tape -- replay runs/my-run.jsonl
//   npm run tape -- replay runs/my-run.jsonl --difficulty easy,medium,hard
//   npm run tape -- show runs/my-run.jsonl
//
// WHY THIS EXISTS. "Is hard hard?" cannot be answered by a bot lap: a bot
// lap only says what the bot would do, and the bot is not who the difficulty
// is for. Drive a stage in the game with COLLECT RACE DATA on (developer
// menu), save the file at the finish, and replay it here against all three
// difficulties. The same driving, three fields, three places — which is the
// difficulty curve, measured rather than asserted.
//
// A recorded BOT run is the other end of the same tool: a reference lap that
// costs one command, for the times you want a tape and have nobody to drive
// one.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const {
  CARS,
  DEFAULT_KNOBS,
  DIFFICULTY_IDS,
  FIELD_SIZE,
  STAGE_RULES,
  fieldAt,
  gridSize,
  parseTape,
  placeAmongField,
  playerSlot,
  race,
} = await import(join(root, "engine/index.ts"));

const args = process.argv.slice(2);
const verb = args[0];
function flag(name, fallback) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : fallback;
}
function has(name) {
  return args.includes(`--${name}`);
}

const USAGE = `usage:
  npm run tape -- record [--seed N] [--car ID] [--gearbox auto|manual]
                         [--length short|medium|long] [--shape sprint|circuit] [--laps N]
                         [--weather clear|rain|storm|fog] [--time day|dusk|night] [--season …]
                         [--difficulty easy|medium|hard] [--cars N] [--mass-start] [--alone]
                         [--elevation|--water|--trees|--asphalt|--width|--steepness 0..1]
                         [--out FILE]
  npm run tape -- replay FILE [--difficulty easy,medium,hard] [--splits]
  npm run tape -- show FILE`;

const pad = (v, n) => String(v).padStart(n);
const padr = (v, n) => String(v).padEnd(n);
const secs = (v) => (v === null || v === undefined ? "—" : `${v.toFixed(2)}`);
/** Signed, so a gap reads as the thing it is: minus is ahead. */
const gap = (v) => (v === null ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(2)}`);

function ordinal(n) {
  const rest = n % 100;
  if (rest >= 11 && rest <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
}

/** The stage a tape names, in one line. */
function stageLine(header) {
  const s = header.stage;
  const dials = Object.keys(DEFAULT_KNOBS)
    .filter((k) => s.knobs[k] !== DEFAULT_KNOBS[k])
    .map((k) => `${k} ${s.knobs[k]}`)
    .join(", ");
  return [
    `seed ${s.seed}`,
    `${s.length} ${s.shape}${s.laps > 1 ? ` ×${s.laps}` : ""}`,
    `${header.car.id} (${header.car.gearbox})`,
    `${s.timeOfDay}/${s.weather}/${s.season}`,
    dials || null,
  ]
    .filter(Boolean)
    .join(" · ");
}

function describe(tape, file) {
  const h = tape.header;
  console.log(`tape    ${file}`);
  console.log(`        ${h.mode} · ${stageLine(h)}`);
  console.log(
    `        ${h.source}, engine ${h.engine}, ${h.recorded.slice(0, 19).replace("T", " ")}`,
  );
  console.log(
    `        ${tape.steps} steps, ${tape.inputs.length} control lines, ${tape.samples.length} samples`,
  );
  if (h.field) {
    console.log(
      `        field: ${h.field.cars} cars, ${h.field.difficulty}, ${
        h.field.massStart ? "mass start" : "rally start"
      }, ${h.field.contact === false ? "ghosts" : "solid"}`,
    );
  } else {
    console.log("        field: nobody entered");
  }
  const r = tape.result;
  if (r) {
    const placed = r.place !== null ? `, ${ordinal(r.place)} of ${r.of}` : "";
    console.log(
      `        as driven: ${r.finished ? `${secs(r.time)} s` : `DNF at ${secs(r.time)} s`}${placed}`,
    );
  }
}

/** What one race was worth, as the calibration reads it: where the drive
 * placed, how far off the win, and how far off the podium — the cut that
 * decides whether a campaign stage opens the next one. */
function verdict(outcome) {
  const others = outcome.rows.filter((row) => !row.you && row.time !== null);
  const times = others.map((row) => row.time).sort((a, b) => a - b);
  const winner = outcome.rows.find((row) => row.place === 1) ?? null;
  // Third place among EVERYBODY ELSE is the time that has to be beaten to
  // stand on the podium: beating it puts the drive third at worst.
  const cut = times[2] ?? null;
  return {
    time: outcome.time,
    finished: outcome.finished,
    place: outcome.place,
    of: outcome.of,
    winner: winner && !winner.you ? winner.alias : "YOU",
    toWin: times.length > 0 ? outcome.time - times[0] : null,
    toPodium: cut !== null ? outcome.time - cut : null,
    drift: outcome.drift,
  };
}

function cmdRecord() {
  const car = flag("car", "compact");
  if (!CARS.some((c) => c.id === car)) {
    console.error(`unknown car "${car}" (${CARS.map((c) => c.id).join(", ")})`);
    process.exit(1);
  }
  const length = flag("length", "medium");
  if (!(length in STAGE_RULES.stageLengths)) {
    console.error(
      `unknown length "${length}" (${Object.keys(STAGE_RULES.stageLengths).join(", ")})`,
    );
    process.exit(1);
  }
  const difficulty = flag("difficulty", "medium");
  if (!DIFFICULTY_IDS.includes(difficulty)) {
    console.error(`unknown difficulty "${difficulty}" (${DIFFICULTY_IDS.join(", ")})`);
    process.exit(1);
  }
  const knobs = { ...DEFAULT_KNOBS };
  for (const dial of Object.keys(DEFAULT_KNOBS)) {
    const value = flag(dial);
    if (value !== undefined) knobs[dial] = Number(value);
  }
  const seed = Number(flag("seed", 42));
  const shape = flag("shape", "sprint");
  const massStart = has("mass-start");
  const cars = massStart ? gridSize(Number(flag("cars", 8))) : FIELD_SIZE;
  const stage = {
    seed,
    length,
    shape,
    laps: Number(flag("laps", shape === "circuit" ? STAGE_RULES.circuit.laps : 1)),
    knobs,
    timeOfDay: flag("time", "day"),
    weather: flag("weather", "clear"),
    season: flag("season", "summer"),
  };
  // The game's own two fields: a rally start is the campaign's, and the
  // campaign's crews are ghosts; a mass start is heads-up's, and solid.
  const field = has("alone") ? null : { difficulty, cars, massStart, contact: massStart };
  const outcome = race({
    stage,
    car: { id: car, gearbox: flag("gearbox", "auto") },
    field,
    start: {
      // A recorded bot run has nobody to watch the ceremony, so it starts on
      // the green — and the tape says so, which is what keeps a replay of it
      // stepping in lockstep with the run it recorded.
      skipCountdown: true,
      grid: field && massStart ? playerSlot(Number(flag("cars", 8))) : null,
    },
    driver: { kind: "bot" },
    record: { source: "bot", mode: "sim" },
  });
  const out = flag("out", join("runs", `bot-${seed}-${car}-${difficulty}.jsonl`));
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, outcome.tape);
  const v = verdict(outcome);
  console.log(
    `recorded ${out} — ${outcome.finished ? `${secs(outcome.time)} s` : "DNF"}${
      v.place !== null ? `, ${ordinal(v.place)} of ${v.of}` : ""
    }`,
  );
}

function cmdReplay() {
  const file = args[1];
  if (!file || file.startsWith("--")) {
    console.error(USAGE);
    process.exit(2);
  }
  const tape = parseTape(readFileSync(file, "utf8"));
  describe(tape, file);
  const asked = flag("difficulty");
  const plans = asked ? asked.split(",") : [tape.header.field?.difficulty ?? null];
  for (const difficulty of plans) {
    if (difficulty !== null && !DIFFICULTY_IDS.includes(difficulty)) {
      console.error(`unknown difficulty "${difficulty}" (${DIFFICULTY_IDS.join(", ")})`);
      process.exit(1);
    }
  }

  // FIRST, THE REPRODUCTION: the tape put back in exactly the run it came out
  // of, contact and all. Its drift is the number to read before any of the
  // rest — how far the replayed car ended up from where the recording says it
  // was, at the worst sample. Zero means this build drives the tape the way
  // it was driven; anything else means the handling has moved underneath the
  // recording, and every place below is a place somebody else's car took.
  const same = race({
    stage: tape.header.stage,
    car: tape.header.car,
    field: fieldAt(tape.header),
    start: tape.header.start,
    driver: { kind: "tape", tape },
  });
  const asDriven = verdict(same);
  console.log("");
  console.log(
    `reproduced   ${asDriven.finished ? `${secs(asDriven.time)} s` : "DNF"}${
      asDriven.place === null ? "" : `, ${ordinal(asDriven.place)} of ${asDriven.of}`
    }` +
      (tape.samples.length === 0
        ? "   (no samples on this tape — nothing to check against)"
        : `   drift ${same.drift ? same.drift.worst.toFixed(2) : "?"} m over ${
            same.drift?.samples ?? 0
          } samples`),
  );

  // THEN THE CALIBRATION. The drive is NOT re-driven against the other
  // fields — see `placeAmongField` for why that measures nothing — so what
  // happens instead is the exact version of the same question: race each
  // field with nobody on the road with them, and slot this time into the
  // result. The time is the one that was actually driven, and the PLACE is
  // the answer.
  const drive = same.finished ? same.time : (tape.result?.time ?? null);
  if (drive === null || !same.finished) {
    console.log("\nthe run never reached the line — there is no time to place");
    return;
  }
  if (!tape.header.field && !asked) {
    console.log(
      "\nnobody was entered on this run — placing it against the campaign field; --difficulty picks another",
    );
  }
  const base = tape.header.field ?? {
    difficulty: "medium",
    cars: FIELD_SIZE,
    massStart: false,
  };
  console.log("");
  console.log(`${secs(drive)} s, placed against each field:`);
  console.log(
    [padr("  field", 10), pad("place", 8), pad("to win", 8), pad("podium", 8), "  winner"].join(
      " ",
    ),
  );
  for (const difficulty of plans) {
    const placed = placeAmongField({
      stage: tape.header.stage,
      field: { ...base, difficulty: difficulty ?? base.difficulty },
      time: drive,
      carId: tape.header.car.id,
    });
    const times = placed.rows
      .filter((row) => !row.you && row.time !== null)
      .map((row) => row.time)
      .sort((a, b) => a - b);
    const winner = placed.rows.find((row) => row.place === 1);
    console.log(
      [
        padr(`  ${difficulty ?? base.difficulty}`, 10),
        pad(`${placed.place}/${placed.of}`, 8),
        pad(times.length > 0 ? gap(drive - times[0]) : "—", 8),
        pad(times[2] !== undefined ? gap(drive - times[2]) : "—", 8),
        `  ${winner?.you ? "YOU" : (winner?.alias ?? "—")}`,
      ].join(" "),
    );
    if (has("splits")) printSplits(tape, placed);
  }
}

/** R28 — where the drive stood at every board against this field: the column
 * that says WHERE a difficulty is actually won and lost, rather than only by
 * how much. */
function printSplits(tape, placed) {
  const leaders = [];
  for (const [id, splits] of Object.entries(placed.splits)) {
    const alias = placed.rows.find((row) => row.id === id)?.alias ?? id;
    splits.forEach((at, i) => {
      if (leaders[i] === undefined || at < leaders[i].at) leaders[i] = { at, alias };
    });
  }
  (tape.result?.splits ?? []).forEach((at, i) => {
    const leader = leaders[i];
    console.log(
      `      split ${pad(i + 1, 2)}  ${pad(secs(at), 8)}  ${
        leader ? `${gap(at - leader.at)} on ${leader.alias}` : "leading"
      }`,
    );
  });
}

function cmdShow() {
  const file = args[1];
  if (!file) {
    console.error(USAGE);
    process.exit(2);
  }
  const tape = parseTape(readFileSync(file, "utf8"));
  describe(tape, file);
  if (tape.rivals.length > 0) {
    console.log("\nthe field it was driven against:");
    for (const rival of [...tape.rivals].sort((a, b) => a.place - b.place)) {
      console.log(
        `  ${pad(rival.place, 3)}  ${padr(rival.alias, 12)} ${padr(rival.carId, 10)} ${pad(
          secs(rival.time),
          8,
        )}`,
      );
    }
  }
}

if (verb === "record") cmdRecord();
else if (verb === "replay") cmdReplay();
else if (verb === "show") cmdShow();
else {
  console.error(USAGE);
  process.exit(2);
}
