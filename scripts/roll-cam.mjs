#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Roll-camera preview tool: builds the harness page (pwa/roll-preview.html +
// the real renderer and camera), trips a car off a stage, and photographs the
// shot it goes over in — CONSECUTIVE FRAMES, from each end of the camera
// ladder, on a labeled contact sheet at previews/rollcam.png.
//
// It is the looking half of camera-roll.ts's loop. `tests/camera_test.ts`
// measures the shot — that it comes to rest, that it keeps the car in frame
// and a readable size, that it climbs to see over a bank, that it flies home
// rather than cutting — and nothing but this shows what any of that looks
// like. `make roll` is the other picture of the same event and answers a
// different question: that one is the CAR going over, drawn from behind;
// this one is the CAMERA, from where a person would be standing.
//
// Requires `npm i --no-save playwright-core` and a Chromium (CHROMIUM_PATH
// overrides discovery), same as scripts/screenshot.mjs.
//
//   node scripts/roll-cam.mjs
//   node scripts/roll-cam.mjs --skip-build   # reuse the last bundle
//   OUT=after node scripts/roll-cam.mjs      # previews/after.png
import { existsSync, mkdirSync } from "node:fs";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const buildDir = join(root, "previews", ".roll-cam");
const outDir = join(root, "previews");
mkdirSync(outDir, { recursive: true });

const args = process.argv.slice(2);
const has = (name) => args.includes(`--${name}`);
const out = process.env.OUT || "rollcam";

if (!has("skip-build") || !existsSync(join(buildDir, "roll-preview.html"))) {
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
      rollupOptions: { input: join(root, "pwa", "roll-preview.html") },
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
  const file = join(buildDir, path === "/" ? "roll-preview.html" : path.slice(1));
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
await page.goto(`http://127.0.0.1:${port}/roll-preview.html`);
// HOW LONG THE SHEET IS GIVEN TO DRAW ITSELF, ms — and it is sized for the
// machine that has no GPU, not for the one that does.
//
// The page renders four accidents in full (two seats x two runs), and on a
// developer's machine that is seconds. In a container Chromium falls back to
// SwiftShader and software-rasterizes every frame of every one of them, which
// is a quarter of an hour and was fifteen minutes' worth of ceiling for half
// the work: adding the caught runs walked the default straight into its own
// timeout, and the failure arrives as a bare `TimeoutError` with no sheet and
// nothing said about why.
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
