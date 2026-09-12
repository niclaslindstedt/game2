#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE SNOW-TRACK LAB: builds the harness page (pwa/snow-tracks.html + the
// real renderer), puts a car through a handful of staged manoeuvres on snow
// and photographs what each one wrote into the ground FROM DIRECTLY ABOVE,
// at a fixed metres-per-pixel, with the chase camera's view of the same
// instant beside it — on a labelled contact sheet at previews/tracks.png.
//
// What a car leaves in snow is a PLAN — four paths crossing each other —
// and the chase camera is the one angle that cannot show a plan. Overhead,
// at a scale two cells share, "are all four wheels there", "does a band get
// wider when the tyre goes sideways" and "is the snow between the ruts
// still untouched" are one glance each. The page itself
// (pwa/src/tools/snow-tracks.ts) says what every manoeuvre is asking.
//
// REQUIRED before and after any change to the snow track, the tyre band, the
// belly gate (R47, `snowBelly`) or the tread shader — keep both sheets and
// put them in the PR.
//
// Requires `npm i --no-save playwright-core` and a Chromium (CHROMIUM_PATH
// overrides discovery), same as scripts/screenshot.mjs.
//
//   node scripts/snow-tracks-lab.mjs
//   node scripts/snow-tracks-lab.mjs --skip-build   # reuse the last bundle
//   OUT=after node scripts/snow-tracks-lab.mjs      # previews/after.png
import { existsSync, mkdirSync } from "node:fs";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const buildDir = join(root, "previews", ".snow-tracks-lab");
const outDir = join(root, "previews");
mkdirSync(outDir, { recursive: true });

const args = process.argv.slice(2);
const has = (name) => args.includes(`--${name}`);
const out = process.env.OUT || "tracks";

if (!has("skip-build") || !existsSync(join(buildDir, "snow-tracks.html"))) {
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
      rollupOptions: { input: join(root, "pwa", "snow-tracks.html") },
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
  const file = join(buildDir, path === "/" ? "snow-tracks.html" : path.slice(1));
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
// MOVES= shoots only the named manoeuvres and HOLD= shortens each one: a
// whole sheet is five stages of real driving and takes the better part of
// half an hour on a machine with no GPU, where a question about one of them
// is a couple of minutes. `MOVES=drift HOLD=1.6 make tracks OUT=peek`.
const query = new URLSearchParams();
if (process.env.MOVES) query.set("moves", process.env.MOVES);
if (process.env.HOLD) query.set("hold", process.env.HOLD);
const search = query.size > 0 ? `?${query}` : "";
await page.goto(`http://127.0.0.1:${port}/snow-tracks.html${search}`);
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
