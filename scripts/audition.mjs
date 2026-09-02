#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE EAR — the review surface for everything the game makes a noise with.
//
// A sound cannot be judged from a diff and a two-minute score cannot be judged
// by reading its note tokens, so this builds a single self-contained page that
// plays the ACTUAL shipped audio: the same synth, the same banks, the same
// sequencer, the same beds. Four sections:
//
//   THE SCORES every score in the game, played by the real sequencer, with a
//              per-voice mute so a mix can actually be picked apart.
//   THE ROAD   the continuous beds under sliders — revs, load, speed, surface,
//              how hard it is cornering, how sideways it has gone, the
//              weather — and a row of SEATS, because the mix moves with the
//              camera. The engine, the tyres, the wind, the drift and the
//              weather are functions of those numbers and there is no other
//              honest way to hear them than to move them.
//   THE WORLD  the country: which one, what hour, and how near the crowd, a
//              paddock and a train are — the ambience under sliders.
//   THE BANKS  every discrete sound in the game, one button each, with the
//              description it was written against printed beside it.
//
// The page carries no scripts of its own beyond the wiring: the audio code is
// the repo's own TypeScript, compiled by `tsc` and inlined, so this can never
// drift from what ships. If it sounds right here it sounds right in the game.
//
//   npm run audition            # previews/audition.html
//   npm run audition -- --out other.html

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import process from "node:process";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const outArg = args.indexOf("--out");
const out = outArg >= 0 ? args[outArg + 1] : join(root, "previews", "audition.html");

// The modules the page needs at RUNTIME, in dependency order — and the order
// is load-bearing: concatenation is all the linking there is, so a module has
// to be listed BEFORE the ones that call into it.
//
// `voice.ts` is mostly types, which is exactly the trap: it also holds
// `envelopeShape`, `safeCutoff` and the shaper's arithmetic, which every
// voice the synth plays goes through. Leave it out and `tsc` erases the
// import, the page builds clean, and the first button anyone presses throws.
const RUNTIME = [
  "pwa/src/lib/voice.ts",
  "pwa/src/lib/synth.ts",
  "pwa/src/lib/tracker.ts",
  "pwa/src/game/audio/play.ts",
  "pwa/src/game/audio/rack.ts",
  "pwa/src/game/audio/listener.ts",
  "pwa/src/game/audio/engine-voice.ts",
  "pwa/src/game/audio/road-voice.ts",
  "pwa/src/game/audio/bank-world.ts",
  "pwa/src/game/audio/ambience.ts",
];

/** Compile the runtime modules to plain JS and return one concatenated blob. */
function compileRuntime() {
  const dir = mkdtempSync(join(tmpdir(), "audition-"));
  try {
    // Run from the temp directory with absolute paths: `tsc` refuses to load a
    // tsconfig.json that sits in the working directory when files are named on
    // the command line (TS5112), and the repo root has one.
    try {
      execFileSync(
        join(root, "node_modules", ".bin", "tsc"),
        [
          ...RUNTIME.map((rel) => join(root, rel)),
          "--outDir",
          dir,
          "--rootDir",
          root,
          "--target",
          "es2022",
          "--module",
          "esnext",
          "--moduleResolution",
          "bundler",
          // The repo writes its imports with explicit `.ts` extensions; this is
          // the emit-time flag that rewrites them, and the only one compatible
          // with actually producing JavaScript.
          "--rewriteRelativeImportExtensions",
          // Emit only. The modules are typechecked by `make lint`; here the
          // `@engine` type imports would fail to resolve without the repo's
          // tsconfig paths, and they are erased from the emit anyway.
          "--noCheck",
          "--skipLibCheck",
        ],
        { cwd: dir, stdio: ["ignore", "pipe", "pipe"] },
      );
    } catch (err) {
      // tsc writes its diagnostics to stdout, which a thrown ExecFileSync
      // error buries under a hex dump of the buffer.
      process.stderr.write(String(err.stdout ?? "") + String(err.stderr ?? ""));
      throw new Error("tsc failed to compile the audio runtime", { cause: err });
    }
    // EACH MODULE GETS ITS OWN SCOPE, wrapped in an IIFE that returns its
    // exports; those are destructured into the shared scope for the modules
    // that follow. Private names stay private, which is what the module
    // system was doing.
    return RUNTIME.map((rel) => {
      const js = readFileSync(join(dir, rel.replace(/\.ts$/, ".js")), "utf8");
      const names = [
        ...js.matchAll(/^export (?:async )?(?:function|const|let|var|class)\s+([A-Za-z0-9_$]+)/gm),
      ].map((m) => m[1]);
      const body = js
        .split("\n")
        .filter((line) => !/^\s*import[\s{]/.test(line))
        .map((line) => line.replace(/^export (?!default)/, ""))
        .join("\n");
      return `const { ${names.join(", ")} } = (() => {\n${body}\nreturn { ${names.join(", ")} };\n})();`;
    }).join("\n");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const { RUN_BANK } = await import(join(root, "pwa/src/game/audio/bank.ts"));
const { UI_BANK } = await import(join(root, "pwa/src/game/audio/bank-ui.ts"));
const { WORLD_BANK } = await import(join(root, "pwa/src/game/audio/bank-world.ts"));
const { trackSeconds } = await import(join(root, "pwa/src/lib/tracker.ts"));

/** Every score, its title, and where the game plays it. */
const SCORE_FILES = [
  ["menu", "SERVICE PARK", "Behind every menu page", "MENU_TRACK"],
  ["taiga", "TAIGA, FLAT OUT", "The taiga on a clear day", "TAIGA_TRACK"],
  ["spruce", "BLACK SPRUCE", "The taiga in rain or a storm", "SPRUCE_TRACK"],
  ["polar", "MIDNIGHT SUN", "The taiga at dawn, dusk or night", "POLAR_TRACK"],
  ["desert", "SALT PAN", "The desert, whatever the sky", "DESERT_TRACK"],
  ["circuit", "SHORT CIRCUIT", "Any circuit stage", "CIRCUIT_TRACK"],
  ["endless", "LONG HAUL", "Any endless stage", "ENDLESS_TRACK"],
];
const scores = {};
for (const [id, title, where, name] of SCORE_FILES) {
  const mod = await import(join(root, `pwa/src/game/audio/scores/${id}.ts`));
  scores[id] = { title, where, track: mod[name] };
}

const runtime = compileRuntime();
const data = JSON.stringify({
  banks: { "THE CAR AND THE STAGE": RUN_BANK, "THE WORLD": WORLD_BANK, "THE INTERFACE": UI_BANK },
  scores,
});

const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Service Park</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link
  rel="stylesheet"
  href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&family=Barlow:wght@400;500&family=IBM+Plex+Mono:wght@400;500&display=swap"
/>
<style>
  /* ONE VISUAL WORLD, DELIBERATELY: a service park at first light. Cold blue
     dark, birch-white ink, and the sodium amber of the lights they work
     under. It does not follow the viewer's theme because the thing it is
     imitating — a timing board in a tent in a forest — only exists at night. */
  :root {
    color-scheme: dark;
    --ground: #12161b;
    --panel: #191f26;
    --panel-2: #1f2731;
    --line: #2b3743;
    --ink: #e7ecf0;
    --dim: #8a99a7;
    --amber: #f2a33c;
    --live: #5fd39a;
    --display: "Barlow Condensed", "Arial Narrow", system-ui, sans-serif;
    --body: "Barlow", system-ui, -apple-system, sans-serif;
    --mono: "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
  }
  * { box-sizing: border-box; }
  html { -webkit-text-size-adjust: 100%; }
  body {
    margin: 0;
    background: var(--ground);
    color: var(--ink);
    font: 400 16px/1.6 var(--body);
    padding: 0 20px 72px;
  }
  .wrap { max-width: 1100px; margin: 0 auto; }

  header { padding: 40px 0 22px; border-bottom: 2px solid var(--amber); }
  h1 {
    font: 700 clamp(30px, 6vw, 52px)/0.98 var(--display);
    letter-spacing: 0.02em;
    text-transform: uppercase;
    text-wrap: balance;
    margin: 0;
  }
  h1 small {
    display: block;
    font: 600 13px/1.4 var(--display);
    letter-spacing: 0.34em;
    color: var(--amber);
    margin-bottom: 10px;
  }
  header p { color: var(--dim); max-width: 62ch; margin: 14px 0 0; }

  h2 {
    font: 600 13px/1 var(--display);
    letter-spacing: 0.3em;
    text-transform: uppercase;
    color: var(--dim);
    margin: 46px 0 4px;
  }
  h2 + .sub { color: var(--dim); font-size: 14px; margin: 0 0 16px; max-width: 62ch; }

  .transport {
    position: sticky; top: 0; z-index: 5;
    display: flex; gap: 14px; align-items: center; flex-wrap: wrap;
    background: color-mix(in srgb, var(--ground) 92%, transparent);
    backdrop-filter: blur(6px);
    border-bottom: 1px solid var(--line);
    padding: 12px 0; margin-top: 6px;
  }
  .status {
    font: 500 12px/1 var(--mono); letter-spacing: 0.08em; text-transform: uppercase;
    display: inline-flex; align-items: center; gap: 8px; color: var(--dim);
  }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--dim); }
  .status.live { color: var(--live); }
  .status.live .dot { background: var(--live); box-shadow: 0 0 0 3px color-mix(in srgb, var(--live) 22%, transparent); }

  button {
    font: 600 13px/1 var(--display);
    letter-spacing: 0.16em; text-transform: uppercase;
    background: var(--panel-2); color: var(--ink);
    border: 1px solid var(--line); border-radius: 3px;
    padding: 9px 16px; cursor: pointer;
    transition: border-color 120ms, color 120ms, background 120ms;
  }
  button:hover { border-color: var(--amber); color: var(--amber); }
  button:focus-visible { outline: 2px solid var(--amber); outline-offset: 2px; }
  button.on { background: var(--amber); border-color: var(--amber); color: #14181d; }
  button.primary { border-color: var(--amber); color: var(--amber); }
  button.primary.on { color: #14181d; }

  .grid { display: grid; gap: 12px; grid-template-columns: repeat(auto-fill, minmax(310px, 1fr)); }
  .panel { background: var(--panel); border: 1px solid var(--line); border-radius: 4px; padding: 16px; }

  .sound { display: grid; gap: 10px; align-content: start; }
  .sound .top { display: flex; gap: 10px; align-items: center; justify-content: space-between; }
  .id { font: 500 13px/1 var(--mono); letter-spacing: 0.02em; color: var(--ink); }
  .layers { display: flex; gap: 4px; flex-wrap: wrap; }
  .chip {
    font: 500 10px/1 var(--mono); letter-spacing: 0.06em; text-transform: uppercase;
    padding: 4px 7px; border-radius: 2px; border: 1px solid var(--line); color: var(--dim);
  }
  .chip.tone { border-color: color-mix(in srgb, var(--amber) 45%, var(--line)); color: var(--amber); }
  .desc { color: var(--dim); font-size: 14px; line-height: 1.55; margin: 0; }

  .score .spec {
    display: grid; grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px 18px; margin: 14px 0 6px;
  }
  .score .spec div { display: grid; gap: 3px; }
  .score .spec .k {
    font: 600 10px/1 var(--display); letter-spacing: 0.22em; text-transform: uppercase; color: var(--dim);
  }
  .score .spec .v { font: 500 17px/1 var(--mono); font-variant-numeric: tabular-nums; }
  .score h3 { font: 700 22px/1.05 var(--display); letter-spacing: 0.04em; text-transform: uppercase; margin: 0; }
  .score .where { color: var(--amber); font: 600 11px/1.4 var(--display); letter-spacing: 0.2em; text-transform: uppercase; margin: 6px 0 0; }
  .order { font: 400 12px/1.5 var(--mono); color: var(--dim); word-break: break-word; }
  .rack { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 14px; }
  .rack button { padding: 5px 10px; font-size: 11px; letter-spacing: 0.1em; }
  .rack button.on { background: transparent; color: var(--amber); border-color: color-mix(in srgb, var(--amber) 55%, var(--line)); }
  .rack button:not(.on) { color: var(--dim); text-decoration: line-through; text-decoration-color: color-mix(in srgb, var(--dim) 60%, transparent); }

  .sl { display: grid; grid-template-columns: 108px 1fr 52px; gap: 14px; align-items: center; margin: 10px 0; }
  .sl .k { font: 600 11px/1 var(--display); letter-spacing: 0.22em; text-transform: uppercase; color: var(--dim); }
  .sl .v { font: 500 14px/1 var(--mono); font-variant-numeric: tabular-nums; text-align: right; }
  input[type="range"] { width: 100%; accent-color: var(--amber); }
  input[type="range"]:focus-visible { outline: 2px solid var(--amber); outline-offset: 3px; }
  .switches { display: flex; gap: 6px; flex-wrap: wrap; margin: 16px 0 4px; align-items: center; }
  .switches .k { font: 600 11px/1 var(--display); letter-spacing: 0.22em; text-transform: uppercase; color: var(--dim); margin-right: 6px; }

  footer { color: var(--dim); font-size: 13px; margin-top: 52px; border-top: 1px solid var(--line); padding-top: 16px; }
  @media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <h1><small>Scandinavian Flick</small>Service park</h1>
    <p>
      Everything the game makes a noise with, played by the game's own code. Nothing here is a
      recording — every effect and every note is synthesized from a handful of numbers, which is
      why it can all be read as well as heard. A browser will not make a sound until you press
      the button below.
    </p>
  </header>

  <div class="transport">
    <button id="unlock" class="primary" type="button">Start audio</button>
    <span class="status" id="state"><span class="dot"></span><span id="stateText">Waiting for a gesture</span></span>
  </div>

  <h2>The scores</h2>
  <p class="sub">
    Seven looping tracker arrangements — one for the menu and one for each kind of stage the
    game can put a car on. Mute the voices one at a time: it is the only way to hear what any
    single line is contributing to a mix.
  </p>
  <div class="grid" id="scores"></div>

  <h2>The road</h2>
  <p class="sub">
    The continuous beds: the engine, the tyres, the wind, the drift and the weather. None of it
    is a clip — every layer is built once and STEERED by the numbers below, so the only honest
    way to judge them is to move them. <b>Rain</b> changes what a surface IS: take gravel up to 1
    and the stones stop rattling and start squelching. And the <b>seat</b> moves the whole mix.
  </p>
  <div class="panel">
    <div class="switches"><button id="road" class="primary" type="button">Start the car</button></div>
    <div id="sliders"></div>
  </div>

  <h2>The world</h2>
  <p class="sub">
    The country the road runs through: birds in the spruce, cicadas on the flats, an owl at dusk,
    the crowd at the line, a paddock, a train. All of it thins with speed — at the top of fourth
    the wind is the only thing outside the car anyone can hear.
  </p>
  <div class="panel">
    <div class="switches"><button id="world" class="primary" type="button">Open the window</button></div>
    <div id="worldSliders"></div>
  </div>

  <div id="banks"></div>

  <footer>
    Built by <span class="id">make audition</span> from the repository's own synth, banks, sequencer
    and beds. If it sounds right here, it sounds right in the game.
  </footer>
</div>

<script type="module">
${runtime}

const DATA = ${data};
const synth = createSynth();
const player = createTrackPlayer(synth);

const stateEl = document.getElementById("state");
const stateText = document.getElementById("stateText");
function refreshState() {
  const live = synth.now() !== null;
  stateEl.className = live ? "status live" : "status";
  stateText.textContent = live ? "Audio running" : "Still locked — press again";
}
document.getElementById("unlock").addEventListener("click", () => {
  synth.unlock();
  refreshState();
});

/** Build an element in one call — the page is all DOM, no innerHTML. */
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** A row of exclusive switches; \`onPick\` gets the chosen value. */
function switchRow(parent, label, choices, initial, onPick) {
  const row = el("div", "switches");
  row.append(el("span", "k", label));
  const buttons = [];
  for (const choice of choices) {
    const b = el("button", choice === initial ? "on" : null, choice);
    b.type = "button";
    b.addEventListener("click", () => {
      for (const other of buttons) other.className = "";
      b.className = "on";
      onPick(choice);
    });
    buttons.push(b);
    row.append(b);
  }
  parent.append(row);
}

/** A slider row bound to \`store[id]\`. */
function sliderRow(parent, store, id, label, initial) {
  store[id] = initial;
  const row = el("label", "sl");
  const input = document.createElement("input");
  Object.assign(input, { type: "range", min: 0, max: 1, step: 0.01, value: initial });
  const read = el("span", "v", initial.toFixed(2));
  input.addEventListener("input", () => {
    store[id] = Number(input.value);
    read.textContent = store[id].toFixed(2);
  });
  row.append(el("span", "k", label), input, read);
  parent.append(row);
}

// ── The scores ─────────────────────────────────────────────────────────────
const scores = document.getElementById("scores");
let playing = null;
const transports = [];
for (const [id, entry] of Object.entries(DATA.scores)) {
  const track = entry.track;
  const card = el("div", "panel score");
  card.append(el("h3", null, entry.title), el("p", "where", entry.where));

  const seconds = (flattenTrack(track).totalSteps * 60) / track.bpm / track.stepsPerBeat;
  const spec = el("div", "spec");
  const facts = [
    ["Tempo", track.bpm + " bpm"],
    ["Loop", seconds.toFixed(0) + " s"],
    ["Sections", String(Object.keys(track.patterns).length)],
    ["Voices", String(Object.keys(track.instruments).length)],
  ];
  for (const [k, v] of facts) {
    const cell = el("div");
    cell.append(el("span", "k", k), el("span", "v", v));
    spec.append(cell);
  }
  card.append(spec, el("div", "order", track.order.join("  ›  ")));

  const muted = new Set();
  const play = el("button", null, "Play");
  play.type = "button";
  transports.push({ id, button: play });
  play.addEventListener("click", () => {
    synth.unlock();
    refreshState();
    if (playing === id) {
      player.stop();
      playing = null;
      play.textContent = "Play";
      play.className = "";
      return;
    }
    playing = id;
    for (const t of transports) {
      t.button.textContent = t.id === id ? "Stop" : "Play";
      t.button.className = t.id === id ? "on" : "";
    }
    player.play(withMutes(track, muted));
  });
  const bar = el("div", "switches");
  bar.append(play);
  card.append(bar);

  const rack = el("div", "rack");
  for (const name of Object.keys(track.instruments)) {
    const sw = el("button", "on", name);
    sw.type = "button";
    sw.addEventListener("click", () => {
      if (muted.has(name)) muted.delete(name);
      else muted.add(name);
      sw.className = muted.has(name) ? "" : "on";
      if (playing === id) player.play(withMutes(track, muted));
    });
    rack.append(sw);
  }
  card.append(rack);
  scores.append(card);
}

/** A copy of the track with the muted voices silenced. */
function withMutes(track, muted) {
  if (muted.size === 0) return track;
  const instruments = {};
  for (const [name, patch] of Object.entries(track.instruments))
    instruments[name] = muted.has(name) ? { ...patch, volume: 0 } : patch;
  return { ...track, instruments };
}

// ── The road ───────────────────────────────────────────────────────────────
const road = { surface: "gravel", airborne: false, seat: "chase" };
const sliders = document.getElementById("sliders");
for (const [id, label, initial] of [
  ["rev", "Revs", 0.5],
  ["load", "Load", 0.7],
  ["air", "Speed", 0.5],
  ["corner", "Cornering", 0],
  ["slide", "Sideways", 0],
  ["spin", "Wheelspin", 0],
  ["wear", "Damage", 0],
  ["wet", "Rain", 0],
  ["squall", "Squall", 0.5],
  ["gale", "Wind", 0],
]) {
  sliderRow(sliders, road, id, label, initial);
}
switchRow(sliders, "Surface", ["gravel", "sand", "asphalt", "nature", "water"], "gravel", (s) => {
  road.surface = s;
});
switchRow(sliders, "Seat", Object.keys(LISTENERS), "chase", (s) => {
  road.seat = s;
});
const airRow = el("div", "switches");
const airBtn = el("button", null, "In the air");
airBtn.type = "button";
airBtn.addEventListener("click", () => {
  road.airborne = !road.airborne;
  airBtn.className = road.airborne ? "on" : "";
});
airRow.append(airBtn);
sliders.append(airRow);

let car = null;
const roadBtn = document.getElementById("road");
roadBtn.addEventListener("click", () => {
  synth.unlock();
  refreshState();
  if (car !== null) {
    clearInterval(car.timer);
    car.engine.stop();
    car.road.stop();
    car = null;
    roadBtn.className = "primary";
    roadBtn.textContent = "Start the car";
    return;
  }
  roadBtn.className = "primary on";
  roadBtn.textContent = "Stop the car";
  const engine = createRack(synth, ENGINE_LAYERS, ENGINE_GLIDE);
  const roadRack = createRack(synth, ROAD_LAYERS, ROAD_GLIDE);
  // Steered thirty times a second, exactly as the game's frame does it: the
  // layers hold between calls, so nothing here is booked ahead.
  const timer = setInterval(() => {
    if (synth.now() === null) return;
    const ear = listenerFor(road.seat);
    engine.apply(
      engineTargets(
        { rpm: rpmAt(road.rev), rev: road.rev, load: road.load, wear: road.wear },
        { engine: ear.engine, exhaust: ear.exhaust, tone: ear.tone },
      ),
    );
    roadRack.apply(
      roadTargets(
        {
          speed: road.air * 60,
          air: road.air,
          surface: road.surface,
          corner: road.corner,
          slide: road.slide,
          spin: road.spin,
          sideways: -road.slide * 10,
          airborne: road.airborne,
          wet: road.wet,
          squall: road.squall,
          gale: road.gale,
        },
        { tyres: ear.tyres, scrub: ear.scrub, wind: ear.wind, weather: ear.weather },
      ),
    );
  }, 33);
  car = { timer, engine, road: roadRack };
});

// ── The world ──────────────────────────────────────────────────────────────
const world = { biome: "taiga", timeOfDay: "day", stock: "none", train: "none" };
const worldSliders = document.getElementById("worldSliders");
for (const [id, label, initial] of [
  ["air", "Speed", 0],
  ["wet", "Rain", 0],
  ["gale", "Wind", 0],
  ["crowd", "Crowd", 0],
  ["near", "How near", 0.6],
]) {
  sliderRow(worldSliders, world, id, label, initial);
}
switchRow(worldSliders, "Country", ["taiga", "desert"], "taiga", (b) => (world.biome = b));
switchRow(worldSliders, "Hour", ["dawn", "day", "dusk", "night"], "day", (t) => (world.timeOfDay = t));
switchRow(worldSliders, "Paddock", ["none", "cows", "sheep"], "none", (s) => (world.stock = s));
switchRow(worldSliders, "Train", ["none", "on the line", "at the crossing"], "none", (t) => (world.train = t));

let window_ = null;
const worldBtn = document.getElementById("world");
worldBtn.addEventListener("click", () => {
  synth.unlock();
  refreshState();
  if (window_ !== null) {
    clearInterval(window_.timer);
    window_.world.stop();
    window_ = null;
    worldBtn.className = "primary";
    worldBtn.textContent = "Open the window";
    return;
  }
  worldBtn.className = "primary on";
  worldBtn.textContent = "Close the window";
  const w = createWorld(synth);
  const timer = setInterval(() => {
    const now = synth.now();
    if (now === null) return;
    const ear = listenerFor(road.seat);
    w.update(
      {
        biome: world.biome,
        timeOfDay: world.timeOfDay,
        wet: world.wet,
        gale: world.gale,
        air: world.air,
        crowd: world.crowd,
        stock: world.stock === "none" ? null : { kind: world.stock, near: world.near, pan: 0.5 },
        train:
          world.train === "none"
            ? null
            : { near: world.near, pan: -0.4, horn: true, bell: world.train === "at the crossing" },
        world: ear.world,
      },
      now,
    );
  }, 100);
  window_ = { timer, world: w };
});

// ── The banks ──────────────────────────────────────────────────────────────
const banks = document.getElementById("banks");
for (const [title, bank] of Object.entries(DATA.banks)) {
  banks.append(el("h2", null, title));
  banks.append(
    el(
      "p",
      "sub",
      "Every voice is listed before you press it: what a sound is MADE of is most of what it is.",
    ),
  );
  const grid = el("div", "grid");
  for (const [id, def] of Object.entries(bank)) {
    const card = el("div", "panel sound");
    const top = el("div", "top");
    const play = el("button", null, "Play");
    play.type = "button";
    play.addEventListener("click", () => {
      synth.unlock();
      refreshState();
      playDef(synth, def);
    });
    top.append(el("span", "id", id), play);

    const layers = el("div", "layers");
    for (const voice of def.voices) {
      const kind = voice.call === "tone" ? voice.type || "square" : (voice.color || "white") + " noise";
      layers.append(el("span", voice.call === "tone" ? "chip tone" : "chip", kind));
    }
    card.append(top, layers, el("p", "desc", def.description));
    grid.append(card);
  }
  banks.append(grid);
}
</script>
</body>
</html>
`;

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, page);
const loops = Object.entries(scores)
  .map(([id, s]) => `${id} ${trackSeconds(s.track).toFixed(0)}s`)
  .join(", ");
console.log(
  `wrote ${out} — ${Object.keys(RUN_BANK).length} run sounds, ` +
    `${Object.keys(WORLD_BANK).length} world sounds, ` +
    `${Object.keys(UI_BANK).length} interface sounds; ${loops}`,
);
