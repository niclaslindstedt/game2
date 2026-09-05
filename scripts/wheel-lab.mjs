#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE WHEEL LAB: builds the harness page (pwa/wheel-preview.html + the real
// renderer), tears a wheel off a car at rally pace, and photographs what the
// wheel does — CONSECUTIVE FRAMES from three seats, on a labeled contact
// sheet at previews/wheel.png.
//
// It is the looking half of loose-wheel.ts's loop. `tests/loose_wheel_test.ts`
// measures the wheel — that it rolls on at the speed it left at, bounces
// lower each time, keels over once it is slow and settles flat — and nothing
// but this shows what any of that looks like next to the car it came off,
// from where the player is sitting.
//
// Requires `npm i --no-save playwright-core` and a Chromium (CHROMIUM_PATH
// overrides discovery), same as scripts/screenshot.mjs.
//
//   node scripts/wheel-lab.mjs
//   node scripts/wheel-lab.mjs --skip-build   # reuse the last bundle
//   OUT=after node scripts/wheel-lab.mjs      # previews/after.png
import { existsSync, mkdirSync } from "node:fs";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const buildDir = join(root, "previews", ".wheel-lab");
const outDir = join(root, "previews");
mkdirSync(outDir, { recursive: true });

const args = process.argv.slice(2);
const has = (name) => args.includes(`--${name}`);
const out = process.env.OUT || "wheel";

if (!has("skip-build") || !existsSync(join(buildDir, "wheel-preview.html"))) {
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
      rollupOptions: { input: join(root, "pwa", "wheel-preview.html") },
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
  const file = join(buildDir, path === "/" ? "wheel-preview.html" : path.slice(1));
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
await page.goto(`http://127.0.0.1:${port}/wheel-preview.html`);
// HOW LONG THE SHEET IS GIVEN TO DRAW ITSELF, ms — sized for the machine
// with no GPU, where Chromium software-rasterizes every frame of three
// runs. A deadline rather than a budget: the wait ends when `__done` is set.
// A string, not a closure — it runs in the page, where `window` exists.
await page.waitForFunction("window.__done === true", undefined, { timeout: 2_400_000 });
const sheet = await page.$("canvas#stage");
const box = await sheet.boundingBox();
await page.setViewportSize({ width: Math.ceil(box.width), height: Math.ceil(box.height) });
await page.screenshot({ path: join(outDir, `${out}.png`), fullPage: true });
console.log(`previews/${out}.png`);

await browser.close();
server.close();
