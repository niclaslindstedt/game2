#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Screenshot tool for the build-and-iterate loop: serves the built app,
// drives it headlessly with scripted keyboard input, and captures frames at
// interesting moments (start grid, full speed, drift, jump if reachable) in
// both landscape and portrait. Screenshots land in the gitignored
// previews/ dir. Requires `npm i --no-save playwright-core` and a Chromium
// (CI/web sessions have one preinstalled at PLAYWRIGHT_BROWSERS_PATH).
//
//   node scripts/screenshot.mjs                # every scene below
//   node scripts/screenshot.mjs pause map      # only scenes whose name
//                                              # contains one of these
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

/** Scene filter: bare words on the command line keep only the scenes whose
 * name contains one of them. A whole sweep takes minutes, and a fix to one
 * surface only ever needs to look at that surface again. */
const only = process.argv.slice(2);

/** Wait until the run is actually ticking — every driving scene starts here
 * rather than with a fixed countdown wait. Building the world takes several
 * seconds under software rendering, and the loop does not start until it is
 * done — a bare timeout from page load spends most of itself on the loading
 * screen and captures the start line however long it waits. */
async function racing(page) {
  await page.waitForFunction(
    "document.querySelector('.hud-timer')?.textContent !== '0:00.0'",
    null,
    { timeout: 60000 },
  );
}

async function capture(name, viewport, script, params = {}, pageOptions = {}) {
  if (only.length > 0 && !only.some((f) => name.includes(f))) return;
  const page = await browser.newPage({ viewport, ...pageOptions });
  page.on("pageerror", (err) => console.error(`[pageerror] ${err.message}`));
  await page.goto(`${url}?${new URLSearchParams({ ...SCENE_DEFAULTS, ...params })}`);
  await page.waitForSelector("canvas.game-canvas");
  await script(page);
  await page.screenshot({ path: join(outDir, `${name}.png`) });
  console.log(`previews/${name}.png`);
  await page.close();
}

/** A close-up of one HUD element, captured at 4x so the instruments can be
 * JUDGED. The minimap and the damage glyph are a few dozen pixels in a real
 * frame — big enough to check there for clipping, far too small to see
 * whether their parts read apart from each other. */
async function captureElement(name, selector, script, params = {}) {
  if (only.length > 0 && !only.some((f) => name.includes(f))) return;
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 4,
  });
  page.on("pageerror", (err) => console.error(`[pageerror] ${err.message}`));
  await page.goto(`${url}?${new URLSearchParams({ ...SCENE_DEFAULTS, ...params })}`);
  await page.waitForSelector("canvas.game-canvas");
  await script(page);
  await page.locator(selector).screenshot({ path: join(outDir, `${name}.png`) });
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
  await racing(page);
  await page.keyboard.down("ArrowUp");
  await page.waitForTimeout(5000);
});

// The drift: no flick, no handbrake — just a committed turn at pace, which
// is the whole entry now. Held on the power so the slide is at its angle.
await capture("shot-drift", { width: 1280, height: 720 }, async (page) => {
  await racing(page);
  await page.keyboard.down("ArrowUp");
  await page.waitForTimeout(4000);
  await page.keyboard.down("ArrowRight");
  // Long enough for the slide to reach the angle the lock is asking for —
  // the angle builds with commitment rather than arriving with the input,
  // so a short hold captures a car that has only started to move.
  await page.waitForTimeout(950);
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
      await racing(page);
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
  await racing(page);
  await page.keyboard.down("ArrowUp");
  await page.waitForTimeout(4500);
});

// The touch controls, which only a coarse pointer ever sees — the desktop
// shots above hide them by media query. A thumb dragged partway across the
// left zone and HELD: the rim chases the thumb instead of snapping to it, so
// the blue arc from 12 o'clock is the lock the car is actually being given.
await capture(
  "shot-touch-steer",
  { width: 390, height: 844 },
  async (page) => {
    await racing(page);
    const zone = await page.locator(".hud-zone-left").boundingBox();
    const x = zone.x + zone.width * 0.5;
    const y = zone.y + zone.height * 0.6;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 46, y, { steps: 10 });
    // Long enough for the rim to have caught up — a shot taken mid-chase
    // measures the harness's timing, not the control.
    await page.waitForTimeout(700);
  },
  {},
  { hasTouch: true, isMobile: true },
);

// Deep into a short stage, portrait: the minimap's route, the car on it, and
// a gauge with a real fraction of the stage filled in.
await capture(
  "shot-map-portrait",
  { width: 390, height: 844 },
  async (page) => {
    await page.keyboard.down("ArrowUp");
    await racing(page);
    await page.waitForTimeout(20000);
  },
  { length: "short" },
);

// Hood cam at speed.
await capture("shot-hood", { width: 1280, height: 720 }, async (page) => {
  await page.keyboard.press("KeyV");
  await racing(page);
  await page.keyboard.down("ArrowUp");
  await page.waitForTimeout(4500);
});

// The in-race menu, opened the way a player opens it — by tapping the
// minimap — in both orientations, since the card is the same width in each.
for (const [name, viewport] of [
  ["shot-pause", { width: 1280, height: 720 }],
  ["shot-pause-portrait", { width: 390, height: 844 }],
]) {
  await capture(name, viewport, async (page) => {
    await page.keyboard.down("ArrowUp");
    await racing(page);
    await page.waitForTimeout(6000);
    await page.keyboard.up("ArrowUp");
    await page.click(".hud-minimap");
    await page.waitForSelector(".hud-pause");
    await page.waitForTimeout(400);
  });
}

// The two new instruments, close up: the minimap with a stage's worth of
// gauge on it, and the damage glyph on a car that has actually been hurt.
await captureElement(
  "shot-instrument-minimap",
  ".hud-minimap-dock",
  async (page) => {
    await page.keyboard.down("ArrowUp");
    await racing(page);
    await page.waitForTimeout(22000);
  },
  { length: "short" },
);
await captureElement("shot-instrument-damage", ".hud-damage", async (page) => {
  // Into the scenery on purpose, and held there until the glyph has
  // something to SAY: a sound car makes this shot prove nothing, and how long
  // the bashing takes is not a number worth hard-coding.
  await page.keyboard.down("ArrowUp");
  await racing(page);
  await page.keyboard.down("ArrowLeft");
  await page.waitForFunction(
    `[...document.querySelectorAll(".hud-dmg-sys, .hud-dmg-zone")]
       .filter((el) => (el.style.fill || el.style.stroke || "").startsWith("hsl")).length >= 1
     || document.querySelectorAll(".hud-dmg-part-broken").length >= 1`,
    null,
    { timeout: 120000 },
  );
  await page.waitForTimeout(500);
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
    await racing(page);
    await page.keyboard.down("ArrowUp");
    await page.waitForTimeout(4000);
  },
  { tod: "dawn" },
);
await capture(
  "shot-dusk",
  { width: 1280, height: 720 },
  async (page) => {
    await racing(page);
    await page.keyboard.down("ArrowUp");
    await page.waitForTimeout(4000);
  },
  { tod: "dusk" },
);
await capture(
  "shot-storm",
  { width: 1280, height: 720 },
  async (page) => {
    await racing(page);
    await page.keyboard.down("ArrowUp");
    await page.waitForTimeout(4000);
  },
  { weather: "storm" },
);
await capture(
  "shot-night",
  { width: 1280, height: 720 },
  async (page) => {
    await racing(page);
    await page.keyboard.down("ArrowUp");
    await page.waitForTimeout(4000);
  },
  { tod: "night" },
);

await browser.close();
server.close();
