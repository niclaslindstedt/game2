#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Air-camera preview tool: builds the harness page (pwa/air-cam.html + the
// real renderer and camera), throws a car off a stage — once over a designed
// jump, and once off the ledge of an ALPINE stage with the altitude dial at
// the top of its travel, where the green is a mile below the road — and
// photographs the camera through both flights: CONSECUTIVE FRAMES, from a rig
// down behind the car and one flown well over it, on a labeled contact sheet
// at previews/aircam.png.
//
// It is the looking half of the flight read (`flight` in camera-feel.ts), the
// rod the lens stands on the end of turning to lie along the car's own path.
// `tests/camera_test.ts` measures it — that the shot pitches over after a
// falling car, that it never lets the car get further away than the rod is
// long, that the rod comes back through the horizontal with a bounce — and
// nothing but this shows what any of that looks like. `make rollcam` is the
// sheet for the other thing a camera does with a car that is not on the road:
// that one is the accident's HOLD, this one is the flight.
//
// Requires `npm i --no-save playwright-core` and a Chromium (CHROMIUM_PATH
// overrides discovery), same as scripts/screenshot.mjs.
//
//   node scripts/air-cam.mjs
//   node scripts/air-cam.mjs --skip-build   # reuse the last bundle
//   OUT=after node scripts/air-cam.mjs      # previews/after.png
import { existsSync, mkdirSync } from "node:fs";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const buildDir = join(root, "previews", ".air-cam");
const outDir = join(root, "previews");
mkdirSync(outDir, { recursive: true });

const args = process.argv.slice(2);
const has = (name) => args.includes(`--${name}`);
const out = process.env.OUT || "aircam";

if (!has("skip-build") || !existsSync(join(buildDir, "air-cam.html"))) {
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
      rollupOptions: { input: join(root, "pwa", "air-cam.html") },
    },
  });
}

const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
};

const server = createServer(async (req, res) => {
  const path = (req.url ?? "/").split("?")[0];
  const file = join(buildDir, path === "/" ? "air-cam.html" : path.slice(1));
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
page.on("console", (msg) => {
  if (msg.type() === "error") console.error(`[console] ${msg.text()}`);
});
await page.goto(`http://127.0.0.1:${port}/air-cam.html`);
// HOW LONG THE SHEET IS GIVEN TO DRAW ITSELF, ms — and it is sized for the
// machine that has no GPU, not for the one that does.
//
// The page renders four flights in full (two seats x two situations), and on
// a developer's machine that is seconds. In a container Chromium falls back
// to SwiftShader and software-rasterizes every one of those frames, which is
// several minutes — and the failure, when the ceiling is too low, arrives as
// a bare `TimeoutError` with no sheet and nothing said about why. The bot's
// run-in to each staging point is stepped WITHOUT being drawn (air-preview.ts
// says why), which is what keeps this the shorter of the two camera sheets.
//
// So the ceiling belongs to the slow path. It costs a fast machine nothing —
// it is a deadline, not a budget, and the wait ends when `__done` is set.
//
// A string, not a closure — it runs in the page, where `window` exists.
await page.waitForFunction("window.__done === true", undefined, { timeout: 2_400_000 });
const sheet = await page.$("canvas#stage");
const box = await sheet.boundingBox();
await page.setViewportSize({ width: Math.ceil(box.width), height: Math.ceil(box.height) });
await page.screenshot({ path: join(outDir, `${out}.png`), fullPage: true });
console.log(`previews/${out}.png`);

await browser.close();
server.close();
