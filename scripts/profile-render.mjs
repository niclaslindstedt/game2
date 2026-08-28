#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Render-cost meter for the build-and-iterate loop: serves the built app,
// drives it headlessly, and reports what one frame actually costs the
// renderer — draw calls, triangles, program and texture binds, and the
// JavaScript time the frame spends before it hands over to the GPU.
//
//   node scripts/profile-render.mjs              # every scene below
//   node scripts/profile-render.mjs drift        # only matching scenes
//   node scripts/profile-render.mjs --seed=7     # a different stage
//
// Requires `npm i --no-save playwright-core` and a Chromium (CI/web
// sessions have one preinstalled; CHROMIUM_PATH overrides discovery).
//
// READ THE DRAW CALLS FIRST. Headless Chromium rasterizes in software, so
// the frame RATE here says nothing about a real machine — but draw calls,
// triangles and binds are the same numbers the GPU would see, and they are
// what decides how many cars a stage can carry. A change that moves fps
// and not draws has bought nothing.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "pwa", "dist");

const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json",
  ".ico": "image/x-icon",
  ".txt": "text/plain",
  ".xml": "application/xml",
};

const server = createServer(async (req, res) => {
  const path = (req.url ?? "/").split("?")[0];
  const file = join(dist, path === "/" ? "index.html" : path.slice(1));
  try {
    const body = await readFile(file);
    res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end("not found");
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const url = `http://127.0.0.1:${server.address().port}/`;

const args = process.argv.slice(2);
const seed = (args.find((a) => a.startsWith("--seed=")) ?? "--seed=42").slice(7);
const only = args.filter((a) => !a.startsWith("--"));

const { chromium } = await import("playwright-core");
const executablePath = process.env.CHROMIUM_PATH;
const browser = await chromium.launch(executablePath ? { executablePath } : undefined);

/** Counts every draw the page makes, installed before any page script runs
 * so it catches the context three.js creates. `clear` is the frame cursor:
 * three clears once per `render()`, which no other code in the app does —
 * counting requestAnimationFrame callbacks instead would count the HUD's
 * own loops as frames and divide the cost by three. */
const METER = `
window.__meter = { draws: 0, tris: 0, frames: 0, programs: 0, textures: 0, cpu: 0 };
// Cumulative since page load, never reset between windows: what BUILDING
// the stage cost, as opposed to what drawing it costs every frame.
window.__built = { textures: 0, bytes: 0 };
const patch = (proto) => {
  if (!proto) return;
  const m = window.__meter;
  const wrap = (name, count) => {
    const inner = proto[name];
    if (!inner) return;
    proto[name] = function (...a) { m.draws++; m.tris += count(a); return inner.apply(this, a); };
  };
  wrap("drawElements", (a) => a[1] / 3);
  wrap("drawArrays", (a) => a[2] / 3);
  wrap("drawElementsInstanced", (a) => (a[1] / 3) * a[4]);
  wrap("drawArraysInstanced", (a) => (a[2] / 3) * a[3]);
  const clear = proto.clear;
  proto.clear = function (...a) { m.frames++; return clear.apply(this, a); };
  const useProgram = proto.useProgram;
  proto.useProgram = function (...a) { m.programs++; return useProgram.apply(this, a); };
  const bindTexture = proto.bindTexture;
  proto.bindTexture = function (...a) { m.textures++; return bindTexture.apply(this, a); };
  // Three uploads a canvas through whichever of these the context has, so
  // all of them count — a texture the app paints once and shares is a
  // texture that only lands here once.
  for (const name of ["texImage2D", "texSubImage2D", "texStorage2D"]) {
    const inner = proto[name];
    if (!inner) continue;
    proto[name] = function (...a) { window.__built.textures++; return inner.apply(this, a); };
  }
  const bufferData = proto.bufferData;
  proto.bufferData = function (...a) {
    const src = a[1];
    window.__built.bytes += typeof src === "number" ? src : (src?.byteLength ?? 0);
    return bufferData.apply(this, a);
  };
};
patch(window.WebGL2RenderingContext && window.WebGL2RenderingContext.prototype);
patch(window.WebGLRenderingContext && window.WebGLRenderingContext.prototype);
const raf = window.requestAnimationFrame.bind(window);
window.requestAnimationFrame = (cb) => raf((t) => {
  const t0 = performance.now();
  cb(t);
  window.__meter.cpu += performance.now() - t0;
});
`;

/** The race clock, read off the HUD — the only honest cursor into how far
 * a drive has got under software rendering, where wall time and stage time
 * come apart completely. */
const READ_CLOCK = `(() => {
  const t = document.querySelector(".hud-clock-total")?.textContent;
  if (!t) return null;
  const m = /^(\\d+)'(\\d\\d)"(\\d\\d)$/.exec(t);
  return m ? Number(m[1]) * 60 + Number(m[2]) + Number(m[3]) / 100 : null;
})()`;

/** How long each scene is metered for, ms. Long enough that a build slice
 * landing in the window does not dominate it. */
const WINDOW = 6000;

const rows = [];

async function scene(name, params, settle) {
  if (only.length > 0 && !only.some((f) => name.includes(f))) return;
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on("pageerror", (err) => console.error(`[pageerror] ${err.message}`));
  await page.addInitScript(METER);
  await page.goto(`${url}?${new URLSearchParams({ seed, ...params })}`, { waitUntil: "load" });
  await page.waitForSelector("canvas.game-canvas");
  await settle(page);
  await page.evaluate(`
    for (const k of Object.keys(window.__meter)) window.__meter[k] = 0;
    window.__meterFrom = performance.now();
  `);
  await page.waitForTimeout(WINDOW);
  const m = await page.evaluate(
    "({ ...window.__meter, built: { ...window.__built }, wall: performance.now() - window.__meterFrom })",
  );
  await page.close();
  const frames = Math.max(1, m.frames);
  rows.push({
    name,
    frames: m.frames,
    fps: m.frames / (m.wall / 1000),
    draws: m.draws / frames,
    tris: m.tris / frames,
    programs: m.programs / frames,
    textures: m.textures / frames,
    cpu: m.cpu / frames,
    built: m.built,
  });
  console.log(`  ${name}: ${m.frames} frames metered`);
}

/** Wait until the run is actually ticking. The HUD is not in the DOM while
 * the world builds, so an absent clock must read as "not started" rather
 * than as zero. */
async function racing(page) {
  await page.waitForFunction(`${READ_CLOCK} > 0`, null, { timeout: 120000 });
}

async function atStageTime(page, seconds) {
  await page.waitForFunction(`${READ_CLOCK} >= ${seconds}`, null, { timeout: 300000 });
}

console.log(`profiling seed ${seed} at 1280x720`);

// Out on the stage at pace, with the world fully streamed in behind the
// car: the frame the game is actually played at, and the one every bot
// added later has to fit inside.
await scene("driving", { start: "1", bot: "1" }, async (page) => {
  await racing(page);
  await atStageTime(page, 12);
});

// The start grid — every car, the gantry, the crowd and the start gate in
// one frame, which is the densest the stage ever gets.
await scene("grid", { start: "1" }, async (page) => {
  await page.waitForSelector(".hud-lights", { timeout: 120000 });
});

// The menu's backdrop: the same world under the drone camera, which is
// what the player looks at for as long as they are choosing a car.
await scene("menu", { menu: "1", splash: "0" }, async (page) => {
  await page.waitForSelector(".menu-card", { timeout: 120000 });
  await page.waitForTimeout(6000);
});

// The Roam page's map view, where the whole stage is on screen at once
// and the fog cull has nothing to hide. `splash=0` retires the studio
// card, which otherwise sits over the menu swallowing the click.
await scene("map", { menu: "1", splash: "0" }, async (page) => {
  await page.waitForSelector(".menu-card", { timeout: 120000 });
  await page.getByText("ROAM", { exact: false }).first().click();
  await page.waitForSelector(".roam", { timeout: 120000 });
  await page.waitForTimeout(14000);
});

const num = (v, d = 0) => v.toLocaleString("en-US", { maximumFractionDigits: d });
const COLS = [
  ["scene", (r) => r.name, 10],
  ["draws", (r) => num(r.draws), 8],
  ["tris", (r) => num(r.tris), 10],
  ["useProg", (r) => num(r.programs), 8],
  ["bindTex", (r) => num(r.textures), 8],
  ["cpu ms", (r) => num(r.cpu, 1), 8],
  ["fps", (r) => num(r.fps, 1), 6],
];
console.log(`\n${COLS.map(([h, , w]) => h.padStart(w)).join("")}`);
for (const r of rows) console.log(COLS.map(([, get, w]) => get(r).padStart(w)).join(""));
console.log("\nbuilding one stage, cumulative since the page loaded:");
for (const r of rows) {
  console.log(
    `  ${r.name.padEnd(8)} ${num(r.built.textures).padStart(6)} texture uploads` +
      `  ${num(r.built.bytes / 1e6, 1).padStart(7)} MB of geometry`,
  );
}
console.log("\ndraws/tris/binds are per frame and hardware-independent — judge a change on those.");
console.log("fps is software rasterization and comparable only against another run here.");

await browser.close();
server.close();
