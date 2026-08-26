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
//   node scripts/screenshot.mjs                # every scene below
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

/** Every scene runs the same pinned stage in the same conditions unless it
 * overrides them — `?start=1` skips the menu. Overrides go through
 * URLSearchParams rather than string concatenation: a repeated key resolves
 * to the FIRST one, so an appended `&seed=` would silently do nothing. */
const SCENE_DEFAULTS = { seed: "42", start: "1" };

async function capture(name, viewport, script, params = {}) {
  const page = await browser.newPage({ viewport });
  page.on("pageerror", (err) => console.error(`[pageerror] ${err.message}`));
  await page.goto(`${url}?${new URLSearchParams({ ...SCENE_DEFAULTS, ...params })}`);
  await page.waitForSelector("canvas.game-canvas");
  await script(page);
  await page.screenshot({ path: join(outDir, `${name}.png`) });
  console.log(`previews/${name}.png`);
  await page.close();
}

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

// The drift: no flick, no handbrake — just a committed turn at pace, which
// is the whole entry now. Held on the power so the slide is at its angle.
await capture("shot-drift", { width: 1280, height: 720 }, async (page) => {
  await page.waitForTimeout(3200);
  await page.keyboard.down("ArrowUp");
  await page.waitForTimeout(4000);
  await page.keyboard.down("ArrowRight");
  await page.waitForTimeout(520);
});

// In the air, straight and crossed up. Seed 28 opens with a long straight
// into a lip, so both are a matter of holding the throttle; the sideways one
// turns into the launch, which is what puts roll in the body. The camera has
// to hold its frame through both — a jump that pulls the camera back reads
// as small, and it is the biggest moment in the stage.
for (const [name, steer] of [
  ["shot-air", null],
  ["shot-air-sideways", "ArrowRight"],
]) {
  await capture(
    name,
    { width: 1280, height: 720 },
    async (page) => {
      await page.waitForTimeout(3200);
      await page.keyboard.down("ArrowUp");
      if (steer) {
        // A flick just before the lip, not a held turn: the car has to be
        // crossed up AT the launch, and still on the road when it gets there.
        await page.waitForTimeout(7900);
        await page.keyboard.down(steer);
        await page.waitForTimeout(260);
        await page.keyboard.up(steer);
      }
      try {
        await page.waitForSelector(".hud-air", { timeout: 30000 });
        await page.waitForTimeout(260);
      } catch {
        console.log(`  (${name}: never left the ground)`);
      }
    },
    { seed: "28" },
  );
}

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
  { menu: "1" },
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
  { tod: "dawn" },
);
await capture(
  "shot-dusk",
  { width: 1280, height: 720 },
  async (page) => {
    await page.waitForTimeout(3200);
    await page.keyboard.down("ArrowUp");
    await page.waitForTimeout(4000);
  },
  { tod: "dusk" },
);
await capture(
  "shot-storm",
  { width: 1280, height: 720 },
  async (page) => {
    await page.waitForTimeout(3200);
    await page.keyboard.down("ArrowUp");
    await page.waitForTimeout(4000);
  },
  { weather: "storm" },
);
await capture(
  "shot-night",
  { width: 1280, height: 720 },
  async (page) => {
    await page.waitForTimeout(3200);
    await page.keyboard.down("ArrowUp");
    await page.waitForTimeout(4000);
  },
  { tod: "night" },
);

await browser.close();
server.close();
