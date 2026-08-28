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
//   ... car-preview.mjs --variants my-candidates.json --out candidates
//     # candidates: { "cars": [{ "id": "...", "spec": { CarBodySpec } }] }
//   ... car-preview.mjs --skip-build
//     # reuse the last harness bundle (fast spec-only iterations)
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const buildDir = join(root, "previews", ".car-preview");
const outDir = join(root, "previews");
mkdirSync(outDir, { recursive: true });

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : null;
};
const has = (name) => args.includes(`--${name}`);

const outName = flag("out") ?? "cars";
const variantsPath = flag("variants");

const liveryCar = flag("liveries");

let variants;
if (has("field")) {
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
    build: {
      outDir: buildDir,
      emptyOutDir: true,
      rollupOptions: { input: join(root, "pwa", "car-preview.html") },
    },
  });
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
