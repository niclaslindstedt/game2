#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Car preview tool for the design-and-iterate loop: builds the harness
// page (pwa/car-preview.html + the real in-game car builder), renders the
// requested cars from the gaming perspective and a set of turntable
// angles, and writes a labeled contact sheet to previews/. Requires
// `npm i --no-save playwright-core` and a Chromium (CHROMIUM_PATH
// overrides discovery), same as scripts/screenshot.mjs.
//
//   node --experimental-strip-types scripts/car-preview.mjs
//     # previews/cars.png with the shipped catalog bodies
//   ... car-preview.mjs --cars classic
//   ... car-preview.mjs --liveries compact --out liveries
//     # the same body in the field's paint schemes, one row each
//   ... car-preview.mjs --field --out field
//     # R29 — the campaign's fourteen rivals, each in their OWN car and
//     # their own paint, labelled by start number and alias
//   ... car-preview.mjs --wrecks compact --out wrecks
//     # THE WRECK LAB: one body through every accident the damage ledger
//     # can describe, bent by the real damage visual — a row per wreck;
//     # `--scene flank --views side --cell 1320x930` is one of them, close
//   ... car-preview.mjs --crew --out crew
//     # the sixteen characters (car-crew.ts), one row each, close up on the
//     # cabin with the glass off; `--crew blink,diesel` renders a subset
//   ... car-preview.mjs --variants my-candidates.json --out candidates
//     # candidates: { "cars": [{ "id": "...", "spec": { CarBodySpec } }] }
//   ... car-preview.mjs --cars compact --views rear --cell 880x620
//   ... car-preview.mjs --cars compact --views "game,rear,rear 3/4"
//     # only those columns, at full size — an eight-column sheet read at
//     # any width at all shrinks every cell past the point of judging one
//   ... car-preview.mjs --skip-build
//     # reuse the last harness bundle (fast spec-only iterations)
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";
import { aliasEngine } from "./lib/engine-alias.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
// The spec modules under pwa/src/game/ spell the engine `@engine`; plain
// Node does not, so the alias goes in before the first import() of one.
aliasEngine(root);
const buildDir = join(root, "previews", ".car-preview");
const outDir = join(root, "previews");
mkdirSync(outDir, { recursive: true });

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : null;
};
const has = (name) => args.includes(`--${name}`);
/** A flag's value only when it HAS one — `--crew --out crew` passes no list,
 * and the next flag is not it. */
const value = (name) => {
  const v = flag(name);
  return v === null || v.startsWith("--") ? null : v;
};

const outName = flag("out") ?? "cars";
const variantsPath = flag("variants");

const liveryCar = flag("liveries");

let variants;
if (has("crew")) {
  // THE PEOPLE. One body for all of them, in the crew's own paint where the
  // campaign gave them one, so the sixteen characters are compared against
  // each other rather than against sixteen different cabins.
  const { CAR_BODIES } = await import("../pwa/src/game/car-styles.ts");
  const { applyLivery, liveryForCrew } = await import("../pwa/src/game/car-livery.ts");
  const { CREW_CHARACTERS, crewLookFor } = await import("../pwa/src/game/car-crew.ts");
  const { RIVALS } = await import("../engine/index.ts");
  const base = CAR_BODIES[flag("car") ?? "compact"];
  const wanted = value("crew");
  const ids = wanted ? wanted.split(",").map((id) => id.trim()) : null;
  const rivals = new Map(RIVALS.map((crew, i) => [crew.id, i + 1]));
  variants = {
    mode: "crew",
    cars: CREW_CHARACTERS.filter((c) => !ids || ids.includes(c.id)).map((c) => ({
      id: `${c.id} — ${c.name}`,
      spec: rivals.has(c.id) ? applyLivery(base, liveryForCrew(c.id, rivals.get(c.id))) : base,
      crew: crewLookFor(c.id),
    })),
  };
  if (variants.cars.length === 0) throw new Error(`no such character: ${wanted}`);
} else if (has("wrecks")) {
  // THE WRECK LAB. One body, staged through the accidents the ledger can
  // describe — a brush, a head-on at two speeds, a corner into a trunk, a
  // flank into a rock, a rear shunt, a roll, and the car past saving — each
  // written straight into `CarDamage` in the engine's own metres, with the
  // parts the engine's bolt lists say those folds shear. The page bends the
  // real body with the real damage visual, so the sheet is what a player
  // sees and nothing else: no physics, no scenery, no camera in the way.
  const { CAR_BODIES } = await import("../pwa/src/game/car-styles.ts");
  const { shearedParts } = await import("../engine/index.ts");
  const carId = value("wrecks") ?? "compact";
  const base = CAR_BODIES[carId];
  if (!base) throw new Error(`unknown car id: ${carId} (have ${Object.keys(CAR_BODIES)})`);
  /** A ledger from the few numbers a scene is about — zone crush in m,
   * keyed by zone (0 nose, clockwise in map view), plus the faces the
   * ring has no room for. */
  const ledger = ({ zones = {}, belly = 0, roof = 0, wear = 0, wheels = [0, 0, 0, 0] }) => {
    const damage = {
      zones: Array.from({ length: 8 }, (_, i) => zones[i] ?? 0),
      belly,
      roof,
      wear,
      systems: { engine: 0, cooling: 0, suspension: 0, gearbox: 0, steering: 0, brakes: 0 },
      wheels,
      broken: [],
      version: 1,
    };
    damage.broken = shearedParts(damage);
    return damage;
  };
  const scenes = [
    ["pristine", ledger({})],
    ["brush, left flank", ledger({ zones: { 6: 0.07, 7: 0.03 } })],
    ["head-on, 50 km/h", ledger({ zones: { 0: 0.15, 7: 0.08, 1: 0.08 }, wear: 0.3 })],
    ["head-on, 100 km/h", ledger({ zones: { 0: 0.34, 7: 0.2, 1: 0.2 }, wear: 0.7 })],
    [
      "front-right corner into a trunk",
      ledger({ zones: { 1: 0.36, 0: 0.1, 2: 0.14 }, wheels: [0, 0.55, 0, 0], wear: 0.5 }),
    ],
    // The stage's own accident: a slide that finds a trunk with the door.
    ["sideways into a tree, 40 km/h", ledger({ zones: { 2: 0.16 }, wear: 0.2 })],
    [
      "sideways into a tree, 70 km/h",
      ledger({ zones: { 2: 0.32, 3: 0.04 }, wheels: [0, 0.45, 0, 0.3], wear: 0.5 }),
    ],
    [
      "rear quarter into a tree",
      ledger({ zones: { 3: 0.28, 2: 0.05 }, wheels: [0, 0, 0, 0.5], wear: 0.4 }),
    ],
    [
      "right flank into a rock",
      ledger({ zones: { 2: 0.4, 1: 0.12, 3: 0.14 }, wheels: [0, 0.6, 0, 0.45], wear: 0.6 }),
    ],
    ["rear shunt", ledger({ zones: { 4: 0.3, 3: 0.12, 5: 0.12 }, wear: 0.4 })],
    [
      "rolled",
      ledger({
        roof: 0.26,
        zones: { 2: 0.14, 6: 0.1, 1: 0.05 },
        belly: 0.06,
        wheels: [0, 0.5, 0, 0],
      }),
    ],
    [
      "the wreck",
      ledger({
        zones: { 0: 0.4, 1: 0.4, 2: 0.35, 3: 0.25, 4: 0.35, 5: 0.25, 6: 0.3, 7: 0.4 },
        belly: 0.2,
        roof: 0.3,
        wear: 1,
        wheels: [1, 0.7, 0.3, 1],
      }),
    ],
  ];
  // `--scene flank,rolled` keeps the rows whose name contains a word — one
  // accident at a full-size cell is how a fold gets looked at properly.
  const scene = value("scene")?.split(",");
  variants = {
    mode: "wrecks",
    cars: scenes
      .filter(([id]) => !scene || scene.some((word) => id.includes(word)))
      .map(([id, damage]) => ({ id: `${carId} — ${id}`, spec: base, damage })),
  };
  if (variants.cars.length === 0) throw new Error(`no such wreck: ${scene}`);
} else if (has("field")) {
  // R29 — THE ACTUAL START LIST. `--liveries` answers "do these schemes read
  // apart on one body"; this answers the question that decides whether the
  // field works: does the car you are chasing say WHOSE it is, across three
  // different silhouettes, in the order they left the start control.
  const { CAR_BODIES } = await import("../pwa/src/game/car-styles.ts");
  const { applyLivery, liveryForCrew } = await import("../pwa/src/game/car-livery.ts");
  const { rivalField } = await import("../engine/index.ts");
  variants = {
    cars: rivalField(flag("difficulty") ?? "medium").map((entry) => ({
      id: `${entry.number} ${entry.crew.alias}`,
      spec: applyLivery(CAR_BODIES[entry.crew.carId], liveryForCrew(entry.crew.id, entry.number)),
    })),
  };
} else if (variantsPath) {
  variants = JSON.parse(await readFile(resolve(variantsPath), "utf8"));
  if (Array.isArray(variants)) variants = { cars: variants };
} else if (liveryCar !== null) {
  // The field's paint schemes on one body — the sheet that says whether two
  // cars in a start list read as two cars.
  const { CAR_BODIES } = await import("../pwa/src/game/car-styles.ts");
  const { LIVERY_COUNT, applyLivery, liveryFor } = await import("../pwa/src/game/car-livery.ts");
  const base = CAR_BODIES[liveryCar];
  if (!base) throw new Error(`unknown car id: ${liveryCar} (have ${Object.keys(CAR_BODIES)})`);
  const count = Number(flag("count") ?? 12);
  const first = Number(flag("from") ?? 0);
  variants = { cars: [] };
  for (let i = first; i < first + Math.min(count, LIVERY_COUNT); i++) {
    const livery = liveryFor(i);
    variants.cars.push({ id: `${i} ${livery.pattern}`, spec: applyLivery(base, livery) });
  }
} else {
  // The shipped catalog bodies — car-styles.ts is pure data, so Node can
  // import it directly with types stripped.
  const { CAR_BODIES } = await import("../pwa/src/game/car-styles.ts");
  const ids = (flag("cars") ?? Object.keys(CAR_BODIES).join(",")).split(",");
  variants = {
    cars: ids.map((id) => {
      const spec = CAR_BODIES[id.trim()];
      if (!spec) throw new Error(`unknown car id: ${id} (have ${Object.keys(CAR_BODIES)})`);
      return { id: id.trim(), spec };
    }),
  };
}

if (!has("skip-build") || !existsSync(join(buildDir, "car-preview.html"))) {
  const { build } = await import("vite");
  await build({
    configFile: false,
    logLevel: "warn",
    root: join(root, "pwa"),
    base: "./",
    resolve: { alias: { "@engine": join(root, "engine", "index.ts") } },
    build: {
      outDir: buildDir,
      emptyOutDir: true,
      rollupOptions: { input: join(root, "pwa", "car-preview.html") },
    },
  });
}
// Narrow the sheet to named columns — `--views "game,rear"` — so the cells
// a change is about come back full size instead of scaled to fit.
const viewList = value("views");
if (viewList) variants.views = viewList.split(",").map((v) => v.trim());
// `--cell 880x620` doubles a cell. A narrowed sheet at a bigger cell is how
// one panel gets looked at properly rather than squinted at.
const cellArg = value("cell");
if (cellArg) {
  const [w, h] = cellArg.split("x").map(Number);
  variants.cell = { w, h };
}
writeFileSync(join(buildDir, "variants.json"), JSON.stringify(variants));

const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
};

const server = createServer(async (req, res) => {
  const path = (req.url ?? "/").split("?")[0];
  const file = join(buildDir, path === "/" ? "car-preview.html" : path.slice(1));
  try {
    const body = await readFile(file);
    res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end("not found");
  }
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const port = server.address().port;

const { chromium } = await import("playwright-core");
const executablePath = process.env.CHROMIUM_PATH;
const browser = await chromium.launch(executablePath ? { executablePath } : undefined);
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on("pageerror", (err) => console.error(`[pageerror] ${err.message}`));
await page.goto(`http://127.0.0.1:${port}/car-preview.html`);
// A string, not a closure — it runs in the page, where `window` exists.
await page.waitForFunction("window.__done === true", undefined, { timeout: 20000 });
const sheet = await page.$("canvas#stage");
const box = await sheet.boundingBox();
await page.setViewportSize({ width: Math.ceil(box.width), height: Math.ceil(box.height) });
await page.screenshot({ path: join(outDir, `${outName}.png`), fullPage: true });
console.log(`previews/${outName}.png (${variants.cars.map((c) => c.id).join(", ")})`);

await browser.close();
server.close();
