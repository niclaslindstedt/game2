#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE APP STORE / STEAM SCREENSHOT HARNESS. Drives the REAL game to each
// recipe in `store-shots/recipes.mjs`, shoots it at that recipe's chosen
// moment, and composes a caption band in the game's own type — writing an
// upload-ready set into native/store/screenshots/ (Apple) and
// tauri/store/screenshots/ (Steam).
//
// THIS SCRIPT DOES NOT DECIDE WHEN TO SHOOT. That is the sweep's job
// (`store-shot-sweep.mjs`): it samples a matrix of moments, contact-sheets
// them, and you pick the winner by eye and write it into the recipe's
// `captureAtS`. This one reproduces the frame that was picked. The
// `store-shots` skill owns that loop.
//
// Four things make the output trustworthy rather than a lucky screen-grab:
//
//  1. EXACT RASTERS, NOT RESIZES. Each device shoots at its real CSS viewport
//     with its real deviceScaleFactor, so 956×440 @3× IS 2868×1320 — captured
//     at device resolution instead of upscaled into it, and captured against
//     the layout that viewport actually gets (this game ships a whole portrait
//     HUD). Apple rejects a set whose dimensions are one pixel off, so the
//     final PNG is asserted rather than trusted.
//
//  2. STAGED, NOT DRIVEN TO. Every frame stands the run at a moment
//     (`?at=racing&s=…`, engine/game/place.ts) on a pinned campaign level and
//     hands it to the engine's own driver (`?bot=1`). Nothing random is drawn
//     by a placement and the bot is deterministic, so re-running reproduces
//     the same frames — a caption tweak does not mean re-hunting for the
//     moment.
//
//  3. THE SHUTTER IS TIMED IN STAGE SECONDS. Under software rendering the sim
//     advances at a fraction of wall time, and a different fraction on every
//     machine; the run's own clock is the only cursor that means the same
//     thing everywhere. See the note at the top of recipes.mjs.
//
//  4. THE SET IS OWNED BY THE RUN THAT WROTE IT. A full run clears each device
//     directory first, so a renamed or retired recipe cannot leave its old
//     frame behind for the upload to ship alongside the current set.
//
// Usage:
//   make build                                    # the harness serves pwa/dist
//   npm i --no-save playwright-core               # and a Chromium
//   node scripts/store-shots.mjs
//     [--only iphone|ipad|steam] [--shot drift,air] [--layout framed|bleed]
//     [--no-captions]
//
// In a Claude web session Chromium is preinstalled: prefix with
// CHROMIUM_PATH=/opt/pw-browsers/chromium, exactly as the other browser-driven
// tools in this directory are run.

import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { serveDir } from "./lib/serve-dist.mjs";
import { compose, resolvedFont } from "./store-shots/compose.mjs";
import {
  assertRasters,
  DEVICES,
  holdFor,
  PATIENCE,
  prepareContext,
  SHOTS,
  stageRun,
} from "./store-shots/recipes.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "pwa", "dist");

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? args[at + 1] : fallback;
};
const has = (name) => args.includes(`--${name}`);

const onlyDevices = option("only", null)?.split(",");
const onlyShots = option("shot", null)?.split(",");
const layoutFlag = option("layout", null);
const captions = !has("no-captions");

if (!existsSync(join(dist, "index.html"))) {
  console.error(
    "store-shots: pwa/dist is not built. Run `make build` first — a stale or " +
      "missing dist photographs the last change rather than this one.",
  );
  process.exit(1);
}

const devices = DEVICES.filter(
  (d) => !onlyDevices || onlyDevices.includes(d.name.split("-")[0]) || onlyDevices.includes(d.name),
);
if (devices.length === 0) {
  console.error(`store-shots: --only ${option("only")} matches no device`);
  process.exit(1);
}
assertRasters(devices);

const shots = SHOTS.filter((s) => !onlyShots || onlyShots.includes(s.id));
if (shots.length === 0) {
  console.error(`store-shots: --shot ${option("shot")} matches no recipe`);
  process.exit(1);
}

/** A PNG's own dimensions, out of the IHDR chunk at a fixed offset after the
 * 8-byte signature. Twenty-four bytes of arithmetic instead of an image
 * library, for the one image fact this script has to be sure of. */
function pngSize(buffer) {
  if (buffer.length < 24 || buffer.toString("ascii", 1, 4) !== "PNG") return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

const site = await serveDir(dist);
const { chromium } = await import("playwright-core");
const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : undefined,
);

// ONE compositor page for the whole run, on its own context: it is resized per
// device and never loads the game, so it costs one page instead of one per
// frame — and keeping it off the game's contexts means the stamped settings
// and the touch flag can never reach it.
const composer = await (await browser.newContext()).newPage();
if (captions) {
  console.log(`store-shots: captions rendering in ${await resolvedFont(composer)}`);
}

let captured = 0;
let failed = 0;
const written = new Set();
/** Wall seconds spent per stage second, per frame — see `holdFor`. Reported at
 * the end because it is the number that explains a slow or timing-out run. */
const ratios = [];

for (const device of devices) {
  const outDir = join(root, device.out ?? "native/store/screenshots", device.name);
  // A FULL run owns the directory. A `--shot` run is iterating on one frame,
  // so it leaves the others alone.
  if (!onlyShots) rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  written.add(relative(root, dirname(outDir)));

  const layout = layoutFlag ?? device.layout ?? "framed";
  console.log(`\n${device.label} → ${device.raster.width}×${device.raster.height} [${layout}]`);

  const context = await browser.newContext({
    viewport: device.css,
    deviceScaleFactor: device.scale,
    hasTouch: device.touch ?? true,
    reducedMotion: "no-preference",
  });
  await prepareContext(context);

  for (const [index, shot] of shots.entries()) {
    if (shot.devices && !shot.devices.includes(device.name)) continue;
    const n = String(index + 1).padStart(2, "0");
    const file = join(outDir, `${n}-${shot.id}.png`);
    const page = await context.newPage();
    page.on("pageerror", (error) => console.error(`  PAGE ERROR: ${error.message}`));

    try {
      await stageRun(page, shot, site.url);

      // Time the shutter off the trigger, exactly as the sweep did when this
      // offset was chosen — otherwise the shipped frame is not the frame that
      // was picked. The clock starts when the trigger RETURNS, so a trigger
      // that WAITS for something (the slide beginning, the wheels leaving the
      // ground) can take as long as the staged event needs without spending
      // the offset it is measured from.
      if (shot.trigger) await shot.trigger(page);
      const ratio = await holdFor(page, shot.captureAtS);
      if (ratio > 0) ratios.push(ratio);

      const raw = await page.screenshot({ timeout: PATIENCE });
      const framed = await compose(composer, raw, device, captions ? shot.caption : null, layout);

      const size = pngSize(framed);
      if (size?.width !== device.raster.width || size?.height !== device.raster.height) {
        throw new Error(
          `wrong raster ${size?.width}×${size?.height}, expected ` +
            `${device.raster.width}×${device.raster.height}`,
        );
      }
      writeFileSync(file, framed);
      console.log(`  ✓ ${n}-${shot.id}.png  +${shot.captureAtS}s  "${shot.caption}"`);
      captured += 1;
    } catch (error) {
      console.error(`  ✗ ${n}-${shot.id}: ${error.message}`);
      failed += 1;
    } finally {
      await page.close();
    }
  }
  await context.close();
}

await browser.close();
await site.close();

const pace = ratios.length
  ? ` — ${(ratios.reduce((a, b) => a + b, 0) / ratios.length).toFixed(1)}× wall per stage second`
  : "";
console.log(
  `\nstore-shots: ${captured} captured, ${failed} failed → ${[...written].join(", ")}${pace}`,
);
if (failed) process.exitCode = 1;
