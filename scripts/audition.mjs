#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE EAR — the review surface for everything the game makes a noise with.
//
// A sound cannot be judged from a diff and a two-minute score cannot be judged
// by reading its note tokens, so this builds a single self-contained page that
// plays the ACTUAL shipped audio: the same synth, the same bank, the same
// sequencer, the same road bed. Three sections:
//
//   THE BANK   every sound in the game, one button each, with the description
//              it was written against printed beside it.
//   THE SCORES the menu and stage themes, played by the real sequencer, with
//              a per-voice mute so a mix can actually be picked apart.
//   THE ROAD   the continuous bed under sliders — revs, load, speed, surface,
//              how sideways, in the air. The engine, the tyres, the wind and
//              the drift are functions of those numbers and there is no other
//              honest way to hear them than to move them.
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

// The modules the page needs at RUNTIME, in dependency order. Every one of
// them imports only types from the others, so once `tsc` has erased those the
// emitted files have no imports left and can simply be concatenated.
const RUNTIME = [
  "pwa/src/lib/synth.ts",
  "pwa/src/lib/tracker.ts",
  "pwa/src/game/audio/play.ts",
  "pwa/src/game/audio/engine-bed.ts",
  "pwa/src/game/audio/road-grain.ts",
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
          // road-grain imports a constant from engine-bed, so that one edge is
          // real; everything else is types. Stripping the import lines below is
          // safe because the concatenation order above already satisfies it.
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
    // EACH MODULE GETS ITS OWN SCOPE. Concatenating them flat put two
    // private `TICK_MS` constants in one scope and the page died on load, so
    // every file is wrapped in an IIFE that returns its exports and those are
    // destructured into the shared scope for the modules that follow. Private
    // names stay private, which is what the module system was doing.
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
const { MENU_TRACK } = await import(join(root, "pwa/src/game/audio/scores/menu.ts"));
const { TAIGA_TRACK } = await import(join(root, "pwa/src/game/audio/scores/taiga.ts"));
const { trackSeconds } = await import(join(root, "pwa/src/lib/tracker.ts"));

const runtime = compileRuntime();
const data = JSON.stringify({
  banks: { "THE CAR AND THE STAGE": RUN_BANK, "THE INTERFACE": UI_BANK },
  scores: {
    menu: { title: "SERVICE PARK, FIRST LIGHT", track: MENU_TRACK },
    taiga: { title: "TAIGA, FLAT OUT", track: TAIGA_TRACK },
  },
});

const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Scandinavian Flick — audition</title>
<style>
  :root { color-scheme: dark; --bg:#0d1013; --card:#161b20; --line:#26313a;
          --ink:#e8eef2; --dim:#8fa3b0; --hot:#7fd4a0; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--ink); font:14px/1.5 ui-monospace,
         SFMono-Regular, Menlo, monospace; padding:24px; }
  h1 { font-size:18px; letter-spacing:.14em; margin:0 0 4px; }
  h2 { font-size:13px; letter-spacing:.18em; color:var(--dim); margin:32px 0 10px;
       border-bottom:1px solid var(--line); padding-bottom:6px; }
  p.lede { color:var(--dim); margin:0 0 8px; max-width:70ch; }
  .cards { display:grid; gap:10px; grid-template-columns:repeat(auto-fill,minmax(300px,1fr)); }
  .card { background:var(--card); border:1px solid var(--line); border-radius:8px; padding:12px; }
  .card b { display:block; letter-spacing:.08em; margin-bottom:6px; }
  .card .desc { color:var(--dim); font-size:12px; }
  button { font:inherit; background:#1e2932; color:var(--ink); border:1px solid var(--line);
           border-radius:6px; padding:6px 12px; cursor:pointer; }
  button:hover { border-color:var(--hot); color:var(--hot); }
  button.on { background:var(--hot); color:#0d1013; border-color:var(--hot); }
  .row { display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin:8px 0; }
  label.sl { display:grid; grid-template-columns:120px 1fr 56px; gap:10px; align-items:center;
             margin:6px 0; color:var(--dim); }
  label.sl span:last-child { color:var(--ink); text-align:right; }
  input[type=range] { width:100%; accent-color:var(--hot); }
  .voices { display:flex; gap:6px; flex-wrap:wrap; margin-top:8px; }
  .voices button { padding:3px 9px; font-size:12px; }
  .locked { color:#f0a; }
</style>
</head>
<body>
<h1>SCANDINAVIAN FLICK — AUDITION</h1>
<p class="lede">Every sound below is produced by the game's own code, compiled straight out of
the repository. Nothing here is a recording.</p>
<div class="row"><button id="unlock">START AUDIO</button><span id="state" class="locked">
browsers will not make a sound until you press this</span></div>

<h2>THE SCORES</h2>
<div class="cards" id="scores"></div>

<h2>THE ROAD — the continuous bed</h2>
<div class="card">
  <div class="row"><button id="road">START THE CAR</button>
    <span class="desc">the engine, the tyres, the wind and the slide, live</span></div>
  <div id="sliders"></div>
</div>

<h2>THE BANK</h2>
<div id="banks"></div>

<script type="module">
${runtime}

const DATA = ${data};
const synth = createSynth();
const player = createTrackPlayer(synth);

document.getElementById("unlock").addEventListener("click", () => {
  synth.unlock();
  const el = document.getElementById("state");
  el.textContent = synth.now() === null ? "still locked — try again" : "audio running";
  el.className = synth.now() === null ? "locked" : "";
});

// ── The scores ─────────────────────────────────────────────────────────────
const scores = document.getElementById("scores");
let playing = null;
for (const [id, entry] of Object.entries(DATA.scores)) {
  const card = document.createElement("div");
  card.className = "card";
  const seconds = (flattenTrack(entry.track).totalSteps * 60) / entry.track.bpm /
    entry.track.stepsPerBeat;
  card.innerHTML = \`<b>\${entry.title}</b><div class="desc">\${entry.track.bpm} bpm ·
    \${seconds.toFixed(0)} s a loop · \${Object.keys(entry.track.patterns).length} sections ·
    order: \${entry.track.order.join(" ")}</div>\`;
  const row = document.createElement("div");
  row.className = "row";
  const play = document.createElement("button");
  play.textContent = "PLAY";
  const muted = new Set();
  play.addEventListener("click", () => {
    synth.unlock();
    if (playing === id) { player.stop(); playing = null; play.textContent = "PLAY"; return; }
    playing = id;
    for (const b of scores.querySelectorAll("button")) if (b !== play && b.dataset.play)
      b.textContent = "PLAY";
    play.textContent = "STOP";
    player.play(withMutes(entry.track, muted));
  });
  play.dataset.play = id;
  row.append(play);
  card.append(row);
  const voices = document.createElement("div");
  voices.className = "voices";
  for (const name of Object.keys(entry.track.instruments)) {
    const b = document.createElement("button");
    b.textContent = name;
    b.className = "on";
    b.addEventListener("click", () => {
      if (muted.has(name)) muted.delete(name); else muted.add(name);
      b.className = muted.has(name) ? "" : "on";
      if (playing === id) player.play(withMutes(entry.track, muted));
    });
    voices.append(b);
  }
  card.append(voices);
  scores.append(card);
}

/** A copy of the track with the muted voices silenced — the only way to hear
 * what one line is actually contributing to a mix. */
function withMutes(track, muted) {
  if (muted.size === 0) return track;
  const instruments = {};
  for (const [name, patch] of Object.entries(track.instruments))
    instruments[name] = muted.has(name) ? { ...patch, volume: 0 } : patch;
  return { ...track, instruments };
}

// ── The road ───────────────────────────────────────────────────────────────
const CONTROLS = [
  { id: "rev", label: "REVS", min: 0, max: 1, step: 0.01, value: 0.5 },
  { id: "load", label: "LOAD", min: 0, max: 1, step: 0.01, value: 0.7 },
  { id: "air", label: "SPEED", min: 0, max: 1, step: 0.01, value: 0.5 },
  { id: "slide", label: "SIDEWAYS", min: 0, max: 1, step: 0.01, value: 0 },
  { id: "wear", label: "DAMAGE", min: 0, max: 1, step: 0.01, value: 0 },
];
const value = {};
const sliders = document.getElementById("sliders");
for (const c of CONTROLS) {
  value[c.id] = c.value;
  const label = document.createElement("label");
  label.className = "sl";
  label.innerHTML = \`<span>\${c.label}</span>\`;
  const input = document.createElement("input");
  Object.assign(input, { type: "range", min: c.min, max: c.max, step: c.step, value: c.value });
  const read = document.createElement("span");
  read.textContent = c.value.toFixed(2);
  input.addEventListener("input", () => {
    value[c.id] = Number(input.value);
    read.textContent = value[c.id].toFixed(2);
  });
  label.append(input, read);
  sliders.append(label);
}
const surfRow = document.createElement("div");
surfRow.className = "row";
value.surface = "gravel";
value.airborne = false;
for (const s of ["gravel", "asphalt", "nature", "water"]) {
  const b = document.createElement("button");
  b.textContent = s.toUpperCase();
  if (s === "gravel") b.className = "on";
  b.addEventListener("click", () => {
    value.surface = s;
    for (const other of surfRow.children) other.className = "";
    b.className = "on";
  });
  surfRow.append(b);
}
const airBtn = document.createElement("button");
airBtn.textContent = "IN THE AIR";
airBtn.addEventListener("click", () => {
  value.airborne = !value.airborne;
  airBtn.className = value.airborne ? "on" : "";
});
surfRow.append(airBtn);
sliders.append(surfRow);

let bed = null;
document.getElementById("road").addEventListener("click", (e) => {
  synth.unlock();
  if (bed !== null) {
    clearInterval(bed);
    bed = null;
    e.target.className = "";
    e.target.textContent = "START THE CAR";
    return;
  }
  e.target.className = "on";
  e.target.textContent = "STOP THE CAR";
  let nextAt = 0;
  let tickMs = 0;
  let lastHz = 0;
  bed = setInterval(() => {
    const now = synth.now();
    if (now === null) return;
    if (nextAt === 0 || nextAt < now - 0.5) nextAt = now + 0.05;
    while (nextAt < now + 0.24) {
      const rpm = rpmAt(value.rev);
      const hz = noteHz(rpm);
      const toHz = lastHz > 0 ? Math.max(hz * 0.75, Math.min(hz * 1.35, hz + (hz - lastHz))) : hz;
      lastHz = hz;
      tickMs = playEngineGrain(
        synth,
        { hz, toHz, rpm, rev: value.rev, load: value.load, wear: value.wear },
        nextAt,
        tickMs,
      );
      playRoadGrain(
        synth,
        {
          speed: value.air * 60,
          air: value.air,
          surface: value.surface,
          slide: value.slide,
          sideways: -value.slide * 10,
          airborne: value.airborne,
        },
        nextAt,
      );
      nextAt += GRAIN_MS / 1000;
    }
  }, 60);
});

// ── The bank ───────────────────────────────────────────────────────────────
const banks = document.getElementById("banks");
for (const [title, bank] of Object.entries(DATA.banks)) {
  const h = document.createElement("h2");
  h.textContent = title;
  const grid = document.createElement("div");
  grid.className = "cards";
  for (const [id, def] of Object.entries(bank)) {
    const card = document.createElement("div");
    card.className = "card";
    const b = document.createElement("button");
    b.textContent = id;
    b.addEventListener("click", () => {
      synth.unlock();
      playDef(synth, def);
    });
    const desc = document.createElement("div");
    desc.className = "desc";
    desc.textContent = def.description;
    card.append(b, document.createElement("br"), desc);
    grid.append(card);
  }
  banks.append(h, grid);
}
</script>
</body>
</html>
`;

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, page);
console.log(
  `wrote ${out} — ${Object.keys(RUN_BANK).length} run sounds, ` +
    `${Object.keys(UI_BANK).length} interface sounds, ` +
    `menu ${trackSeconds(MENU_TRACK).toFixed(0)}s, taiga ${trackSeconds(TAIGA_TRACK).toFixed(0)}s`,
);
