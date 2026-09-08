#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Sky preview tool: builds the harness page (pwa/sky-preview.html + the
// real atmosphere modules), renders every weather against every time of
// day — plus a caught lightning strike — and writes a labeled contact
// sheet to previews/sky.png. Requires `npm i --no-save playwright-core`
// and a Chromium (CHROMIUM_PATH overrides discovery), same as
// scripts/screenshot.mjs.
//
//   node scripts/sky-preview.mjs
//   node scripts/sky-preview.mjs --skip-build   # reuse the last bundle
import { existsSync, mkdirSync } from "node:fs";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const buildDir = join(root, "previews", ".sky-preview");
const outDir = join(root, "previews");
mkdirSync(outDir, { recursive: true });

const args = process.argv.slice(2);
const has = (name) => args.includes(`--${name}`);
/** `--rows=storm,rain` / `--hours=5,12,22`, handed to the page as its query
 * string: which slice of the sheet to shoot. Omit both for the whole thing.
 * The page owns what they mean (pwa/src/tools/sky-preview.ts). */
const flag = (name) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);

if (!has("skip-build") || !existsSync(join(buildDir, "sky-preview.html"))) {
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
      rollupOptions: { input: join(root, "pwa", "sky-preview.html") },
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
  const file = join(buildDir, path === "/" ? "sky-preview.html" : path.slice(1));
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
// A page error is fatal here, and it has to SAY so: the harness signals it
// is finished by setting `window.__done`, so a module that threw simply
// never sets it and the wait below burns its whole timeout before failing
// with nothing but "timed out" — which reads as a slow machine and is how
// a one-line crash in the page sat here looking like the software
// rasterizer being slow.
let crashed = null;
page.on("pageerror", (err) => {
  crashed ??= err;
  console.error(`[pageerror] ${err.message}`);
});
const query = new URLSearchParams(
  Object.entries({ rows: flag("rows"), hours: flag("hours") }).filter(([, v]) => v),
).toString();
await page.goto(`http://127.0.0.1:${port}/sky-preview.html${query ? `?${query}` : ""}`);
// How long the sheet is given to draw itself, ms. Ninety-nine cells, each
// warmed for six seconds of simulated weather, plus a row that hunts a
// strike for up to ninety more — on a real GPU that is a minute, and on the
// software rasterizer a headless container falls back to it is many. Ten
// minutes by default, and `SKY_TIMEOUT_MS` for a machine slower still.
const TIMEOUT_MS = Number(process.env.SKY_TIMEOUT_MS ?? 600000);
// A string, not a closure — it runs in the page, where `window` exists.
await Promise.race([
  page.waitForFunction("window.__done === true", undefined, { timeout: TIMEOUT_MS }),
  new Promise((_, fail) => {
    const watch = setInterval(() => {
      if (crashed) {
        clearInterval(watch);
        fail(crashed);
      }
    }, 200);
    watch.unref();
  }),
]);
const sheet = await page.$("canvas#stage");
const box = await sheet.boundingBox();
await page.setViewportSize({ width: Math.ceil(box.width), height: Math.ceil(box.height) });
await page.screenshot({ path: join(outDir, "sky.png"), fullPage: true });
console.log("previews/sky.png");

await browser.close();
server.close();
