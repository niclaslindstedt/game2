#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// View-change preview tool: builds the harness page (pwa/views-preview.html +
// the real renderer and camera), drives a bot up a stage, and photographs the
// camera key being pressed at every step of the ladder — CONSECUTIVE FRAMES,
// on a labeled contact sheet at previews/views.png.
//
// It is the looking half of camera-change.ts's loop. `tests/camera_test.ts`
// measures the move; nothing but this shows what it looks like, and the
// failure it exists to catch — a frame that does not belong beside the one
// before it — is invisible to a single screenshot.
//
// Requires `npm i --no-save playwright-core` and a Chromium (CHROMIUM_PATH
// overrides discovery), same as scripts/screenshot.mjs.
//
//   node scripts/views-preview.mjs
//   node scripts/views-preview.mjs --skip-build   # reuse the last bundle
//   OUT=after node scripts/views-preview.mjs      # previews/after.png
import { existsSync, mkdirSync } from "node:fs";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const buildDir = join(root, "previews", ".views-preview");
const outDir = join(root, "previews");
mkdirSync(outDir, { recursive: true });

const args = process.argv.slice(2);
const has = (name) => args.includes(`--${name}`);
const out = process.env.OUT || "views";

if (!has("skip-build") || !existsSync(join(buildDir, "views-preview.html"))) {
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
      rollupOptions: { input: join(root, "pwa", "views-preview.html") },
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
  const file = join(buildDir, path === "/" ? "views-preview.html" : path.slice(1));
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
await page.goto(`http://127.0.0.1:${port}/views-preview.html`);
// A string, not a closure — it runs in the page, where `window` exists.
await page.waitForFunction("window.__done === true", undefined, { timeout: 900000 });
const sheet = await page.$("canvas#stage");
const box = await sheet.boundingBox();
await page.setViewportSize({ width: Math.ceil(box.width), height: Math.ceil(box.height) });
await page.screenshot({ path: join(outDir, `${out}.png`), fullPage: true });
console.log(`previews/${out}.png`);

await browser.close();
server.close();
