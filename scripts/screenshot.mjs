#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Screenshot tool for the build-and-iterate loop: serves the built app,
// drives it headlessly with scripted keyboard input, and captures frames at
// interesting moments (start grid, full speed, drift, jump if reachable) in
// both landscape and portrait. Screenshots land in the gitignored
// previews/ dir. Requires `npm i --no-save playwright-core` and a Chromium
// (CI/web sessions have one preinstalled at PLAYWRIGHT_BROWSERS_PATH).
//
//   node scripts/screenshot.mjs                # default script
//   node scripts/screenshot.mjs --scene drift  # hold a handbrake drift
//
// The app boots to the pre-race menu; captures pass ?start=1 (plus ?seed=,
// ?tod=, ?weather=) to pin a run and skip the menu.
import { mkdirSync } from "node:fs";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "pwa", "dist");
const outDir = join(root, "previews");
mkdirSync(outDir, { recursive: true });

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
const port = server.address().port;
const url = `http://127.0.0.1:${port}/`;

const { chromium } = await import("playwright-core");
const executablePath = process.env.CHROMIUM_PATH;
const browser = await chromium.launch(executablePath ? { executablePath } : undefined);

async function capture(name, viewport, script, params = "") {
  const page = await browser.newPage({ viewport });
  page.on("pageerror", (err) => console.error(`[pageerror] ${err.message}`));
  await page.goto(`${url}?seed=42&start=1${params}`);
  await page.waitForSelector("canvas.game-canvas");
  await script(page);
  await page.screenshot({ path: join(outDir, `${name}.png`) });
  console.log(`previews/${name}.png`);
  await page.close();
}

const hold = async (page, key, ms) => {
  await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  await page.keyboard.up(key);
};

// Start grid, landscape + portrait.
await capture("shot-grid", { width: 1280, height: 720 }, async (page) => {
  await page.waitForTimeout(800);
});
await capture("shot-grid-portrait", { width: 390, height: 844 }, async (page) => {
  await page.waitForTimeout(800);
});

// Flat out down the opening straight.
await capture("shot-speed", { width: 1280, height: 720 }, async (page) => {
  await page.waitForTimeout(3200); // countdown
  await page.keyboard.down("ArrowUp");
  await page.waitForTimeout(5000);
});

// Handbrake drift: flick at speed, stay on the power through the slide.
await capture("shot-drift", { width: 1280, height: 720 }, async (page) => {
  await page.waitForTimeout(3200);
  await page.keyboard.down("ArrowUp");
  await page.waitForTimeout(4000);
  await page.keyboard.down("ArrowRight");
  await hold(page, "Space", 180);
  await page.waitForTimeout(500);
});

// Portrait at speed (touch HUD hidden on desktop; portrait shows scale).
await capture("shot-speed-portrait", { width: 390, height: 844 }, async (page) => {
  await page.waitForTimeout(3200);
  await page.keyboard.down("ArrowUp");
  await page.waitForTimeout(4500);
});

// Hood cam at speed.
await capture("shot-hood", { width: 1280, height: 720 }, async (page) => {
  await page.keyboard.press("KeyV");
  await page.waitForTimeout(3200);
  await page.keyboard.down("ArrowUp");
  await page.waitForTimeout(4500);
});

// The pre-race menu itself, over the live stage.
await capture(
  "shot-menu",
  { width: 1280, height: 720 },
  async (page) => {
    await page.waitForSelector(".hud-menu");
    await page.waitForTimeout(800);
  },
  "&menu=1",
);

// The conditions: a dawn run, the dusk sun, storm rain at speed, and night
// under the headlights.
await capture(
  "shot-dawn",
  { width: 1280, height: 720 },
  async (page) => {
    await page.waitForTimeout(3200);
    await page.keyboard.down("ArrowUp");
    await page.waitForTimeout(4000);
  },
  "&tod=dawn",
);
await capture(
  "shot-dusk",
  { width: 1280, height: 720 },
  async (page) => {
    await page.waitForTimeout(3200);
    await page.keyboard.down("ArrowUp");
    await page.waitForTimeout(4000);
  },
  "&tod=dusk",
);
await capture(
  "shot-storm",
  { width: 1280, height: 720 },
  async (page) => {
    await page.waitForTimeout(3200);
    await page.keyboard.down("ArrowUp");
    await page.waitForTimeout(4000);
  },
  "&weather=storm",
);
await capture(
  "shot-night",
  { width: 1280, height: 720 },
  async (page) => {
    await page.waitForTimeout(3200);
    await page.keyboard.down("ArrowUp");
    await page.waitForTimeout(4000);
  },
  "&tod=night",
);

await browser.close();
server.close();
