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
// The app boots to the STUDIO CARD and then the main menu; driving captures
// pass ?start=1 (plus ?seed=, ?hour= or the old ?tod= word, ?weather=, ?camera=) to pin a run and
// skip both.
// The menu captures pass ?menu=1 to force the menu back, and ?splash=1 to
// see the card itself.
import { mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

import { serveDir } from "./lib/serve-dist.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "pwa", "dist");
const outDir = join(root, "previews");
mkdirSync(outDir, { recursive: true });

// The built site on a real origin — an HTTP server rather than `file://`,
// because the service worker, the manifest and `localStorage` all behave
// differently or not at all off an opaque origin. Shared with the store
// screenshot harness (`scripts/lib/serve-dist.mjs`), which needs the same
// thing for the same reason.
const site = await serveDir(dist);
const url = site.url;

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

/** The race clock, read off the HUD and parsed back out of `M\'SS"CC` —
 * the only honest cursor into how far a drive has actually got. Written as
 * a source string because every use of it runs inside the page. */
import { createShooter } from "./lib/shot-harness.mjs";
import { airShots } from "./lib/shots-air.mjs";
import { drivingShots } from "./lib/shots-driving.mjs";
import { menuShots } from "./lib/shots-menus.mjs";
import { toolShots } from "./lib/shots-tools.mjs";
import { showcaseShots } from "./lib/shots-showcase.mjs";

const shot = createShooter({ browser, url, outDir, only, sceneDefaults: SCENE_DEFAULTS });

await drivingShots(shot);
await airShots(shot);
await menuShots(shot);
await toolShots(shot);
await showcaseShots(shot);

await browser.close();
await site.close();
