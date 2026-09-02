#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// High-traffic preview tool: builds the harness page (pwa/traffic-preview.html
// + the real ambient-life and atmosphere modules), photographs the sky at
// four moments of the same race under five skies, and writes a labeled
// contact sheet to previews/traffic.png. Requires `npm i --no-save
// playwright-core` and a Chromium (CHROMIUM_PATH overrides discovery), same
// as scripts/screenshot.mjs.
//
//   node scripts/traffic-preview.mjs
//   node scripts/traffic-preview.mjs --skip-build   # reuse the last bundle
import { existsSync, mkdirSync } from "node:fs";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const buildDir = join(root, "previews", ".traffic-preview");
const outDir = join(root, "previews");
mkdirSync(outDir, { recursive: true });

const args = process.argv.slice(2);
const has = (name) => args.includes(`--${name}`);

if (!has("skip-build") || !existsSync(join(buildDir, "traffic-preview.html"))) {
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
      rollupOptions: { input: join(root, "pwa", "traffic-preview.html") },
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
  const file = join(buildDir, path === "/" ? "traffic-preview.html" : path.slice(1));
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
await page.goto(`http://127.0.0.1:${port}/traffic-preview.html`);
// A string, not a closure — it runs in the page, where `window` exists. The
// sheet drives five two-minute races before it is on screen, so it is given
// longer than the sky sheet's own wait.
await page.waitForFunction("window.__done === true", undefined, { timeout: 240000 });
const sheet = await page.$("canvas#stage");
const box = await sheet.boundingBox();
await page.setViewportSize({ width: Math.ceil(box.width), height: Math.ceil(box.height) });
await page.screenshot({ path: join(outDir, "traffic.png"), fullPage: true });
console.log("previews/traffic.png");

await browser.close();
server.close();
